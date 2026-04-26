# Transcript Persistence Completeness + Per-Line Dismissed State — Design

**Date:** 2026-04-26
**Status:** Design approved; pending spec review before plan-writing.

## Background

Three persistence bugs and one new feature, all in the transcript-ingester subsystem. They cluster naturally because they touch the same files and share a mental model (the lifecycle of a transcript utterance).

**Bug A — autosave drops transcripts.** `src/hooks/useAutoSave.ts` writes only `elements` and `connections` to localStorage; `state.transcript` is silently excluded. After the 60-second autosave fires, a recovery via `App.tsx:54` (`handleRecover`) only passes `(elements, connections)` to `loadDiagram` — so any loaded transcript is lost on recovery.

**Bug B — panel doesn't auto-open on load.** `transcriptPanelOpen` is local React state in `App.tsx:18` (default `false`), with no link to whether a transcript exists in the store. The JSON load path in `Toolbar.tsx:115` correctly hydrates `state.transcript`, but the panel stays closed, so visually it looks like nothing loaded. Researcher must click the panel-toggle button to discover the transcript appeared.

**Bug C — `.drawing` import path doesn't pass transcript.** `Toolbar.tsx:104` invokes `loadDiagram` with three args instead of four. Currently harmless because DiagramMix `.drawing` files don't carry transcripts, but it leaves a stale in-store transcript intact when a different diagram is loaded — a quiet inconsistency worth fixing.

**Feature — explicit per-line dismissed state.** Researchers reviewing a transcript want to mark utterances they've read and judged not argument-relevant, separately from utterances they've used to create elements. Currently "used" is auto-derived from element back-pointers; there's no equivalent storage for "reviewed and irrelevant," so reviewed-irrelevant lines look identical to unreviewed lines. The fix: add an explicit `dismissed` flag with a checkbox UI and a distinct visual state.

## Goals

- Add a `dismissed?: boolean` field to `TranscriptLine` and bump the save schema from 1.1 to 1.2.
- Implement three mutually exclusive utterance states (unreviewed / dismissed / used) with auto-clearing of `dismissed` when a line is dragged onto the canvas.
- Add a checkbox toggle in the transcript panel item, always visible for unreviewed-or-dismissed lines, hidden for used lines.
- Visually distinguish dismissed lines with a strikethrough, opacity 0.75, and a "— not relevant" label.
- Fix Bug A: include `transcript` in autosave + recovery.
- Fix Bug B: auto-open the transcript panel when the store's `transcript` transitions from null to non-null.
- Fix Bug C: pass `null` as the transcript arg on the `.drawing` import path.

## Non-goals

- No persistence of the transcript-panel open/closed state across sessions.
- No new state machine — we keep "used" as a derived property rather than promoting to a stored status enum.
- No mass-dismiss / bulk-action UI; per-line toggle only.
- No filtering/hiding of dismissed lines from the panel — they remain visible (just visually de-emphasized) so researchers can revisit the judgment.
- No tooltip or disabled-button affordance for the dismiss control on used lines — the checkbox is simply absent.
- No migration of existing `.json` files; missing `dismissed` field is treated as `false`.

## Design

### 1. Data model — one new field

In `src/types/transcript.ts`, add to `TranscriptLine`:

```typescript
dismissed?: boolean;  // explicit "reviewed and not argument-relevant" judgment
```

Optional so 1.1 files round-trip cleanly. Treat `undefined` and `false` identically; only `dismissed === true` triggers any UI distinction.

Schema version constant (currently `1.1` somewhere in the save/load utility) bumps to `1.2`. Saved files always write 1.2; loaded files accept 1.1 or 1.2 with no migration code beyond the implicit default.

### 2. State semantics

A line is in exactly one of three states at any time:

- **unreviewed** — `dismissed !== true` AND not referenced by any element
- **dismissed** — `dismissed === true` AND not referenced by any element
- **used** — at least one element has `sourceTranscript.lineIndex === this.index`

The `used` derivation is unchanged from current behavior (`TranscriptPanel.tsx:16`).

**Auto-clearing rule:** when a transcript line is dragged onto the canvas and an element is created with a `sourceTranscript` back-pointer to that line, if the line has `dismissed: true`, clear it to `false` as part of the same store action. This enforces the mutual exclusion: a line cannot be simultaneously dismissed and used. Implementation: locate the store action that creates a sourced element (the path the canvas drop handler invokes) and add a `dismissed: false` patch on the corresponding `TranscriptLine` if it was previously `true`.

If the user later deletes the element, the line returns to **unreviewed**, not back to dismissed. (Per the option-(b) decision: dragging a dismissed line is interpreted as a deliberate revision of the earlier "not relevant" judgment.)

### 3. Toggle UI

Small checkbox, always visible, in the **top-left corner** of each `TranscriptPanelItem`, before the timestamp. Checked = dismissed.

Toggling dispatches `updateTranscriptLine(index, { dismissed: <new> })` (the action already exists in `diagramStore.ts`).

**Used lines: checkbox is hidden entirely.** A line already on the canvas cannot be meaningfully dismissed; the affordance is simply absent. If the user wants to dismiss a used line, they delete the corresponding element first, and the checkbox reappears.

The checkbox is its own click target — it must not bubble into the drag-handle or item-select behavior.

### 4. Visual treatment

In `TranscriptPanelItem.tsx`, replace the existing two-state styling with three states:

```typescript
// existing: opacity: used ? 0.55 : 1
const opacity = used ? 0.55 : (dismissed ? 0.75 : 1);

// new
const textDecoration = (dismissed && !used) ? 'line-through' : 'none';

// existing label "✓ used" extended:
const stateLabel = used ? '✓ used'
  : (dismissed ? '— not relevant' : null);
```

`used` retains display priority for the (impossible-after-auto-clear, but cheap to guard) edge case where a line is somehow flagged both. The strikethrough applies only to text content, not to the timestamp or speaker (visual call: keep the metadata legible so the line stays identifiable).

Drag affordance on dismissed lines: still draggable (dragging clears the dismissal per Section 2). The hover-to-reveal drag handle continues to work; no special treatment.

### 5. Panel auto-open

`transcriptPanelOpen` stays as local React state in `App.tsx`. Add a `useEffect` that watches the store's `transcript` field:

```typescript
useEffect(() => {
  if (transcript) setTranscriptPanelOpen(true);
}, [transcript]);
```

Triggers on every transition where `transcript` becomes non-null — covers JSON load, autosave recovery (after Bug A is fixed), and any future load path. Idempotent for "already open" cases (set-to-true is a no-op when already true). Manual close after auto-open continues to work; the next load reopens.

### 6. Bug A — autosave includes transcript

In `src/hooks/useAutoSave.ts`:

- Extend the `AutoSaveData` interface with `transcript: Transcript | null`.
- Add `transcript: state.transcript` to the saved payload object.
- The "only save if there's content" guard expands: save if `elements.length > 0 || connections.length > 0 || transcript !== null`. (A transcript loaded with no diagram yet is content worth recovering.)

In `src/App.tsx:54` (`handleRecover`), pass `saved.transcript` as the fourth arg:

```typescript
loadDiagram(saved.elements, saved.connections, undefined, saved.transcript);
```

(`name` is `undefined` because autosave doesn't currently capture diagram name; `loadDiagram` defaults to "Untitled Diagram".)

### 7. Bug C — `.drawing` import passes null

In `src/components/Toolbar/Toolbar.tsx:104`, change:

```typescript
loadDiagram(result.elements, result.connections, result.name);
```

to:

```typescript
loadDiagram(result.elements, result.connections, result.name, null);
```

Explicitly clears any existing in-store transcript when a different diagram is loaded from a `.drawing` file. (DiagramMix `.drawing` files don't carry transcripts; the prior in-store transcript belongs to a different diagram and shouldn't bleed into the newly imported one.)

### 8. What's not changing

- The `Transcript` shape itself (only `TranscriptLine` gains a field)
- `usedLineIndexes` derivation in `TranscriptPanel.tsx`
- Connect-mode UX, drag-onto-canvas behavior (gains only the auto-clear side effect)
- Save/load file shape (only schema version constant changes; field is additive)
- Any other transcript-panel features

## Files affected

- `src/types/transcript.ts` — add `dismissed?: boolean` field
- `src/store/diagramStore.ts` — auto-clear `dismissed` in the element-create-from-transcript path
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — checkbox UI, three-state opacity/strikethrough/label
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — pass `dismissed` through to items
- `src/App.tsx` — `useEffect` for panel auto-open; updated `handleRecover` call
- `src/hooks/useAutoSave.ts` — include `transcript` in saved payload
- `src/components/Toolbar/Toolbar.tsx` — pass `null` on `.drawing` import path; bump `version: '1.1'` literal at line 75 to `'1.2'`
- `src/App.tsx` (also) — bump `version: '1.1'` literal at line 89 to `'1.2'` (the project currently has the schema version hardcoded as a literal in both save paths; consolidating to a shared constant is a possible follow-up cleanup but out of scope here)

No changes expected in:

- `src/types/elements.ts`, `src/types/connections.ts`, `src/types/index.ts`
- Canvas, shape components, connector-related code
- `.diagramx` export
- Properties panel, image-related code

## Risks & tradeoffs

- **Auto-clear surprise.** A user who had explicitly dismissed a line, then dragged it onto the canvas (perhaps accidentally), then deletes the element, will find the line returned to unreviewed rather than dismissed. They lose the dismissal judgment. This is the documented option-(b) tradeoff: cleaner three-bucket semantics in exchange for not preserving the earlier-overridden judgment. Mitigation: none planned; if this surfaces as a real workflow problem, revisit with option (a).
- **Backward compat on the field.** Loading a 1.2 file in an older 1.1 build would silently drop the `dismissed` field. We don't ship parallel versions, so this is theoretical, but the additive-only schema choice keeps it benign.
- **Hidden-checkbox-when-used pattern.** Users might wonder "why is there no dismiss checkbox on this row?" The reason is non-obvious unless they notice the "✓ used" label. We accept this for visual cleanliness; if it causes confusion we can add a tooltip later.
- **Autosave size.** A loaded transcript can be a few hundred KB. Adding it to the autosave payload roughly doubles the localStorage footprint per save. Still well under the 5 MB limit; not a concern but worth knowing.

## Testing approach

Manual browser verification with Claude for Chrome:

- **Dismissed flow:** load a transcript, check the dismiss checkbox on a line — confirm strikethrough + opacity 0.75 + "— not relevant" label appear; uncheck — confirm restoration.
- **Auto-clear flow:** dismiss a line, drag it onto the canvas to create an element — confirm the dismiss checkbox un-checks itself and the line shows as "✓ used" with no checkbox visible. Delete the element — confirm the line returns to unreviewed (default styling, checkbox visible and unchecked).
- **Used-while-dismissed edge case:** confirm the checkbox is absent when a line is used.
- **Save/load round-trip:** create a diagram with one used line, one dismissed line, one unreviewed line; save; reload page; load the JSON; confirm all three states come back correctly. Confirm panel auto-opens on load.
- **Schema version:** open the saved JSON in a text editor; confirm version is `1.2` and `dismissed: true` is present on the dismissed line (and absent or `false` on the others).
- **Old-file load:** load a previously-saved 1.1 file; confirm it loads without errors and no lines appear dismissed.
- **Autosave recovery:** load a transcript; wait for autosave (or manually trigger); reload the page; confirm the recovery prompt offers the diagram + transcript and recovery restores both, with panel auto-open.
- **`.drawing` import after JSON:** load a JSON with a transcript; then load a `.drawing` file; confirm the in-store transcript is cleared (panel closes or shows nothing) and only the new diagram's elements appear.
- Static checks: `npm run lint` (Canvas-related lint baseline preserved), `npm run build` (clean `tsc -b`).

## Out of scope (queued as separate sub-projects)

These remain pending after this work:

1. **Configurable support types** — deferred work; prior brainstorm captured in memory.
2. **UI bug review** — researcher's list of disallowed actions that should be allowed.

Each will get its own brainstorm → spec → plan cycle.

## Open questions

None.
