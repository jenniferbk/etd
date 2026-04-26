# Transcript Persistence Completeness + Per-Line Dismissed State — Design

**Date:** 2026-04-26
**Status:** Design approved (revised after adversarial review); pending final spec review before plan-writing.

## Background

Four persistence/UX bugs and one new feature, all in the transcript-ingester subsystem. They cluster naturally because they touch the same files and share a mental model (the lifecycle of a transcript utterance).

**Bug A — autosave drops transcripts.** `src/hooks/useAutoSave.ts` writes only `elements` and `connections` to localStorage; `state.transcript` is silently excluded. After the 60-second autosave fires, a recovery via `App.tsx:54` (`handleRecover`) only passes `(elements, connections)` to `loadDiagram` — so any loaded transcript is lost on recovery.

**Bug B — panel doesn't auto-open on load.** `transcriptPanelOpen` is local React state in `App.tsx:18` (default `false`), with no link to whether a transcript exists in the store. The JSON load path in `Toolbar.tsx:115` correctly hydrates `state.transcript`, but the panel stays closed, so visually it looks like nothing loaded. Researcher must click the panel-toggle button to discover the transcript appeared.

**Bug C — `.drawing` import path doesn't pass transcript.** `Toolbar.tsx:104` invokes `loadDiagram` with three args instead of four. Currently harmless because DiagramMix `.drawing` files don't carry transcripts, but it leaves a stale in-store transcript intact when a different diagram is loaded — a quiet inconsistency worth fixing.

**Bug D — panel "X" button destroys the transcript instead of just closing the panel.** `src/components/TranscriptPanel/TranscriptPanel.tsx:65-67` defines `handleClose` as `setTranscript(null)`. The panel disappears as a side effect of the parent rendering `{transcriptPanelOpen && <TranscriptPanel />}`, but the underlying action is destructive: clicking X erases the transcript and (after this work lands) every dismissed flag along with it. This is a pre-existing latent bug that the new dismissed-state feature would make catastrophic.

**Feature — explicit per-line dismissed state.** Researchers reviewing a transcript want to mark utterances they've read and judged not argument-relevant, separately from utterances they've used to create elements. Currently "used" is auto-derived from element back-pointers; there's no equivalent storage for "reviewed and irrelevant," so reviewed-irrelevant lines look identical to unreviewed lines. The fix: add an explicit `dismissed` flag with a checkbox UI and a distinct visual state.

## Goals

- Add a `dismissed?: boolean` field to `TranscriptLine` and bump the save schema from 1.1 to 1.2.
- `dismissed` and `used` are **independent flags**. A line can be both. The display layer uses `used` as the priority signal when both are true.
- Make each transcript-panel row clickable to toggle `dismissed` on not-used rows; clicking is a no-op on used rows.
- Visually distinguish dismissed (not-used) lines with a strikethrough on the text body and slightly reduced opacity (0.75). Distinguish used lines with italic text and a "✓ used" label, while keeping them at full opacity. Add an accessible state indicator (`aria-label`) for the dismissed state so it's announced to screen readers.
- Fix Bug A: include `transcript` in autosave; extend the recovery-prompt trigger condition; pass the transcript on recovery.
- Fix Bug B: auto-open the transcript panel when the store's `transcript` transitions from null to non-null.
- Fix Bug C: pass `null` as the transcript arg on the `.drawing` import path.
- Fix Bug D: rewire the panel's collapse button to just hide the panel (toggle local UI state) without touching the transcript store, and add an edge expand button so the user can bring the panel back.
- Consolidate the save schema version to a single exported constant so future bumps don't drift.

## Non-goals

- No persistence of the transcript-panel open/closed state across sessions.
- No new state machine — `used` stays a derived property rather than promoted to a stored status enum.
- No mass-dismiss / bulk-action UI; per-line toggle only.
- No filtering/hiding of dismissed lines from the panel — they remain visible (just visually de-emphasized) so researchers can revisit the judgment.
- No tooltip or disabled visual on used lines for the dismiss control — clicking a used row is simply a no-op (rationale: a used line is by definition argument-relevant; dismissing it would express a contradiction).
- No migration of existing `.json` files; missing `dismissed` field is treated as `false`.
- No reconciliation when a researcher reloads an edited source transcript: dismissed flags will be lost. (See Risks.)
- No undo/redo for dismiss-state changes. The store's zundo `partialize` (currently `{elements, connections}`) is not extended; dismissing or un-dismissing a line is a deliberate review action, not an editing action that needs an undo path.
- No new "Clear transcript" affordance to replace the destructive X behavior. Loading a different transcript or `.drawing` file still replaces the in-store transcript via the existing `loadDiagram` / `setTranscript` paths. (Acknowledged gap: with the collapse button decoupled, there's no in-app way to return to the empty-state panel without loading a different transcript or clearing localStorage. Queued for the follow-up "transcript panel UI cleanup" sub-project, which also handles toolbar de-clutter.)

## Design

### 1. Data model — one new field

In `src/types/transcript.ts`, add to `TranscriptLine`:

```typescript
dismissed?: boolean;  // explicit "reviewed and not argument-relevant" judgment
```

Optional so 1.1 files round-trip cleanly. Treat `undefined` and `false` identically; only `dismissed === true` triggers any UI distinction.

### 2. State semantics — independent flags, display priority

A line carries two independent bits of state:

- **`dismissed`** — explicit, stored on the line.
- **`used`** — derived: at least one element has `sourceTranscript.lineIndex === this.index`.

The two flags are independent; a line can be in any combination. The **display layer** picks one styling per line based on the precedence order: **used > dismissed > default**.

| `used` | `dismissed` | Display |
|--------|-------------|---------|
| true   | any         | "✓ used" styling (unchanged) |
| false  | true        | "— not relevant" styling (new) |
| false  | false       | default styling (unchanged) |

Concretely: a researcher dismisses a line, then later drags it onto the canvas to create an element. The line's `dismissed` flag stays `true`, but its display switches to "✓ used" because the element's back-pointer makes `used` derive `true` and `used` wins priority. If the element is later deleted, `used` flips back to `false`, and the line's display reverts to "— not relevant" because the stored `dismissed: true` is still there. The earlier judgment is preserved across the use-then-delete cycle.

This model has the side benefit of avoiding any cross-store atomic write (no need to patch `transcript` when an element is created), which keeps the auto-clear/undo class of bugs from arising. There is no auto-clearing.

### 3. Toggle UI

**Click anywhere on the row to toggle `dismissed`** — but only on rows where `!used`. The whole `TranscriptPanelItem` root `<div>` carries an `onClick` that calls `onDismissChange(!dismissed)` when the line is not used, and is a no-op on used lines (where dismissal is meaningless).

Toggling dispatches `updateTranscriptLine(index, { dismissed: <new> })` (the action already exists in `diagramStore.ts:433-444`).

**Why row-click instead of a dedicated checkbox affordance:** an earlier iteration used a small checkbox in the top-left corner. In hands-on use the checkbox was hard to hit; the row is a much larger target and matches a natural "tap-to-mark" interaction for transcript review work.

The two `<select>` dropdowns (contributor, objectType) inside the row have `onMouseDown={(e) => e.stopPropagation()}` so opening a dropdown does not also toggle dismissed. No other event-handling dance is required: native form-control mousedowns suppress drag initiation by the browser, and `onClick`/`onChange` events on `<select>` don't bubble in a way that would trigger the row's click handler.

**Used lines: clicking is a no-op.** A line already on the canvas is by definition relevant; toggling dismissed on it is meaningless. The user has to delete the corresponding element first to bring the line out of the `used` bucket; then row-click toggles dismissed normally.

### 4. Visual treatment

In `TranscriptPanelItem.tsx`, replace the existing two-state styling (`opacity: used ? 0.55 : 1`) with this combination of signals:

```typescript
// Root-div opacity: dismissed (not-used) lines fade slightly; used and unreviewed
// lines stay full brightness. Used lines are differentiated by italic + label, not
// by dimming — researchers found dimming used lines made them harder to skim.
const opacity = dismissed ? 0.75 : 1;

// Text-body strikethrough: dismissed lines (when not used) are crossed out.
// Used wins display priority, so used+dismissed lines do not render strikethrough.
const textDecoration = (dismissed && !used) ? 'line-through' : 'none';

// Text-body italic: used lines render in italic to distinguish them at a glance.
const fontStyle = used ? 'italic' : 'normal';

// Right-side label: only "✓ used" is rendered; dismissed lines have no label —
// the strikethrough alone is the dismissed signal.
const stateLabel = used ? '✓ used' : null;
```

Strikethrough and italic apply to the text body only, not to the timestamp or speaker line — keeps metadata legible so the utterance stays identifiable.

The cursor on the row reflects what's actionable: `canDrag ? 'grab' : (used ? 'default' : 'pointer')`. Draggable rows show grab (drag is the primary affordance; click-to-dismiss is secondary). Non-draggable not-used rows show pointer (only click works). Used rows that aren't draggable show default.

**Accessibility.** When a line is dismissed and not used, set `aria-label="Dismissed: not relevant"` on the item container so the dismissed state is announced to screen readers — strikethrough is visual-only and does not propagate to assistive tech. Used lines do not need an aria-label because the visible "✓ used" `<span>` is in the DOM and read aloud as part of the row's accessible name.

### 5. Panel collapse/expand and auto-open

Three coupled changes in this section.

**Collapse-button decoupling (Bug D fix).** In `TranscriptPanel.tsx`, the panel doesn't currently know how to "close itself" — `handleClose` calls `setTranscript(null)`, which is destructive. Fix by passing an `onClose: () => void` prop from `App.tsx` that flips `setTranscriptPanelOpen(false)`. The component's `handleClose` invokes that prop instead of calling the store. The transcript stays in the store; only the panel hides.

The header icon is a `PanelRightClose` (lucide-react), with `title="Hide panel"` — the prior `<X>` icon and `"Close transcript"` tooltip both implied the action was destructive, which it no longer is.

**Edge expand button.** When `transcriptPanelOpen === false`, render a thin 32px-wide right-edge tab in `App.tsx` in place of the panel. The tab uses the same gradient/border as the panel for visual continuity, shows a `PanelRightOpen` icon at the top, and clicking it sets `transcriptPanelOpen(true)`. Tooltip: "Show transcript panel". This gives the user a dedicated way to bring the panel back without going through the toolbar's panel-toggle button (which is itself queued for removal in a follow-up sub-project).

**Panel auto-open.** In `App.tsx`, add a `useEffect` that watches the store's `transcript` field:

```typescript
useEffect(() => {
  if (transcript) setTranscriptPanelOpen(true);
}, [transcript]);
```

Triggers on every transition where `transcript` becomes non-null — covers JSON load, autosave recovery (after Bug A is fixed), and any future load path. Idempotent on "already open." Manual close after auto-open continues to work; the next load reopens.

This combination resolves the latent bug both adversarial reviewers flagged: previously, "close panel" was equivalent to "destroy transcript," and a destroyed transcript wouldn't trigger the auto-open `useEffect` — so the destructive behavior was silent. With the collapse button decoupled and a dedicated expand affordance, the user's mental model ("collapse means hide; expand means show") matches the code.

### 6. Bug A — autosave includes transcript

In `src/hooks/useAutoSave.ts`:

- Extend `AutoSaveData` interface with `transcript: Transcript | null`.
- Add `transcript: state.transcript` to the saved payload.
- Update the "only save if there's content" guard to: `if (state.elements.length > 0 || state.connections.length > 0 || state.transcript !== null)`. A loaded transcript with annotations is content worth recovering.

In `src/App.tsx`:

- Update the recovery-prompt trigger (`App.tsx:43-48`) parallel to the save guard:

  ```typescript
  if (saved && (saved.elements.length > 0 || saved.connections.length > 0 || saved.transcript != null)) {
    setRecoveryData({ timestamp: saved.timestamp });
  }
  ```

  Without this change, transcript-only autosaves would write to localStorage but never offer recovery.

- Update `handleRecover` (`App.tsx:51-58`) to pass the transcript through:

  ```typescript
  loadDiagram(saved.elements, saved.connections, undefined, saved.transcript);
  ```

  `name` is `undefined` because autosave doesn't capture diagram name today; `loadDiagram`'s body uses `name || 'Untitled Diagram'` (`diagramStore.ts:458`). The `transcript` arg uses the stored value (which may be `null` if there was no transcript at autosave time — `loadDiagram` does `transcript ?? null` internally, so this is safe).

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

### 8. Schema version consolidation

Currently the version literal `'1.1'` is hardcoded at exactly two save sites: `App.tsx:89` and `Toolbar.tsx:75` (verified by grep). Two duplicates is a maintenance hazard for the bump to 1.2 and future bumps.

Create a new file (`src/utils/schema.ts` or co-located with the save utility — implementation detail for the plan) that exports:

```typescript
export const SAVE_SCHEMA_VERSION = '1.2';
```

Replace both literals with imports of the constant. This pulls the consolidation into scope for this sub-project; the `1.1 → 1.2` bump itself is mechanical once the constant exists.

### 9. What's not changing

- The `Transcript` shape itself (only `TranscriptLine` gains a field)
- `usedLineIndexes` derivation in `TranscriptPanel.tsx:16-25`
- Connect-mode UX, drag-onto-canvas behavior (no auto-clear side effects)
- Save/load file shape (only schema version constant changes; field is additive)
- `addElement` and other store actions
- zundo `partialize` config (no transcript in undo history; deliberate)
- Any other transcript-panel features

## Files affected

- `src/types/transcript.ts` — add `dismissed?: boolean` field on `TranscriptLine`
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — row-level click toggles dismissed; three-state visual (used = italic + label, dismissed = strikethrough + 0.75 opacity, neither = default); `aria-label` for dismissed state; `onMouseDown` `stopPropagation` on the two `<select>` dropdowns so they don't toggle dismissed
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — pass `dismissed` through to items; rewire `handleClose` to call a new `onClose` prop instead of `setTranscript(null)`; replace `<X>` icon with `<PanelRightClose>`; tooltip "Hide panel"
- `src/App.tsx` — `useEffect` for panel auto-open; pass `onClose={() => setTranscriptPanelOpen(false)}` to `<TranscriptPanel />`; render a thin 32px right-edge expand tab (`<PanelRightOpen>` icon) when `transcriptPanelOpen === false`; update recovery-prompt trigger condition; update `handleRecover` to pass transcript
- `src/hooks/useAutoSave.ts` — include `transcript` in saved payload; extend save guard
- `src/components/Toolbar/Toolbar.tsx` — pass `null` on `.drawing` import path; replace `'1.1'` literal at line 75 with the new constant
- `src/App.tsx` (also) — replace `'1.1'` literal at line 89 with the new constant
- New file (likely `src/utils/schema.ts`) — export `SAVE_SCHEMA_VERSION = '1.2'`

No changes expected in:

- `src/types/elements.ts`, `src/types/connections.ts`, `src/types/index.ts`
- `src/store/diagramStore.ts` (no auto-clear logic; existing `updateTranscriptLine` already supports the `dismissed` patch)
- Canvas, shape components, connector-related code
- `Canvas.tsx` `handleDrop` (no auto-clear hook needed)
- `.diagramx` export
- Properties panel, image-related code

## Risks & tradeoffs

- **Reloading an edited source transcript wipes dismissed flags.** If a researcher edits the source `.txt` (typo fix, line addition) and re-loads, the in-store transcript is fully replaced — every dismissed flag is gone. There is no reconciliation by `(speaker, timestamp, text)` matching. **This is a documented limitation; reconciliation is out of scope for this sub-project and may be picked up later if it surfaces as a real workflow problem.**
- **`lineIndex` instability.** Both the `used` derivation and the new `dismissed` flag key on `TranscriptLine.index`, which is the line's position in the parsed transcript. If a researcher edits the source `.txt` to insert a line at the top and re-parses, every existing `lineIndex` (in saved JSON: both `dismissed` flags AND element `sourceTranscript.lineIndex` back-pointers) shifts to point at the wrong line. This is a pre-existing weakness of the codebase, not introduced by this work, but is exacerbated by adding a second consumer of `lineIndex`. Documented; not addressed here.
- **`clearDiagram` preserves dismissed flags.** The existing `clearDiagram` action (`diagramStore.ts:463-474`) intentionally preserves the transcript. Consistent with that, dismissed flags on transcript lines also persist across `clearDiagram` — a researcher who clears the diagram to "start over" on the same transcript keeps all their review work. If this turns out not to match user intent, revisit.
- **Visual size of the autosave payload grows when a transcript is loaded.** Adding the transcript to autosave increases the localStorage footprint per save; the upper bound is well under the 5MB localStorage limit at any realistic transcript size, so this is informational rather than a concern.
- **Backward compat on the field.** Loading a 1.2 file in an older 1.1 build would silently drop the `dismissed` field. We don't ship parallel versions and there's no version-pinning between the etd repo and the deployed `jenkleiman.com` artifact, so an out-of-date cached build could in principle drop fields. Treated as theoretical; the additive-only schema choice keeps it benign.
- **Hidden-checkbox-when-used pattern.** Users may wonder why some rows have no dismiss control. The "✓ used" label answers it, but only by inference. We accept this for visual cleanliness; if it causes confusion in practice, add a tooltip later.
- **Nothing under undo for transcript state.** Dismissing a line, un-dismissing, or any other transcript edit is not undoable. This matches today's behavior for transcript metadata (contributor / objectType annotations on lines are similarly outside undo). Documented as deliberate.

## Testing approach

Manual browser verification with Claude for Chrome:

- **Dismissed flow.** Load a transcript, click anywhere on a non-used row — confirm strikethrough + opacity 0.75 appear (no label); click again — confirm restoration.
- **Click on dropdown does not toggle dismiss.** Load a transcript. On a non-used row, click the contributor dropdown to open it, then close without changing. Confirm the row's `dismissed` state did NOT change. Same for the objectType dropdown.
- **Used overrides dismissed (display priority).** Dismiss a line. Drag it onto the canvas to create an element. Confirm the line now shows italic text + "✓ used" label and full opacity (line is `used && dismissed` in storage; `used` wins display, no strikethrough).
- **Dismissed reappears after element delete.** Continuing the previous case: delete the element. Confirm the line returns to strikethrough + 0.75 opacity (the stored `dismissed: true` is still there).
- **Used-only line.** Drag a non-dismissed line to canvas; confirm italic + "✓ used" label shown, full opacity, no strikethrough.
- **Click on used row is a no-op.** With a used line, click it. Confirm `dismissed` does NOT toggle to true.
- **Save/load round-trip.** Create a diagram with one used line, one dismissed line, one used+dismissed line, one default line; save; reload page; load the JSON; confirm all four states come back correctly. Confirm panel auto-opens on load.
- **Schema version persisted.** Open the saved JSON in a text editor; confirm version is `'1.2'` (sourced from the new constant) and `dismissed: true` is present on the dismissed lines, absent or `false` on others.
- **Old-file load.** Load a previously-saved 1.1 file; confirm it loads without errors and no lines appear dismissed.
- **Autosave recovery — diagram + transcript.** Load a transcript and create a few elements; wait 60 seconds for autosave; reload the page; confirm the recovery prompt appears, accept it, and confirm both the diagram and the transcript come back. Panel auto-opens.
- **Autosave recovery — transcript only.** Load a transcript, dismiss a few lines, do not create any elements; wait 60 seconds; reload; confirm the recovery prompt appears (this requires the recovery trigger condition to be extended); accept and confirm dismissed flags are restored.
- **`.drawing` import after JSON.** Load a JSON with a transcript; then load a `.drawing` file; confirm the in-store transcript is cleared and only the new diagram's elements appear. Panel hides (transcript-null state).
- **Collapse/expand affordances.** Open the transcript panel via load. Click the `PanelRightClose` icon in the panel header. Confirm the panel hides AND the in-store transcript is preserved (a thin 32px right-edge tab with `PanelRightOpen` icon should be visible). Click that edge tab; panel reopens with the transcript intact.
- **Empty-state expand.** From a fresh session (or after clearing localStorage and reloading): without loading any transcript, click the edge expand tab. Confirm the panel opens with the empty state ("No transcript loaded" + "Load transcript (.txt)" button).
- **Auto-open after manual close.** Open via load → click collapse → load a different transcript JSON. Confirm panel auto-opens with the new transcript.
- **Static checks.** `npm run lint` (lint baseline preserved), `npm run build` (clean `tsc -b`).

## Out of scope (queued as separate sub-projects)

These remain pending after this work:

1. **Configurable support types** — deferred work; prior brainstorm captured in memory.
2. **Transcript panel UI cleanup** — bundle (a) in-app "Clear transcript" affordance to restore the empty state without loading another transcript or clearing localStorage, (b) remove the toolbar's panel-toggle button (now fully redundant with the in-panel collapse + edge expand affordances), (c) remove the toolbar's "Load transcript" button (redundant with the panel's empty-state upload button), (d) any other top-strip de-clutter.
3. **UI bug review** — researcher's list of disallowed actions that should be allowed.
4. **Transcript reload reconciliation** — preserve dismissed flags and element back-pointers across edits to the source `.txt`. Likely keys: `(speaker, timestamp, text)` triple matching with a fallback to manual reconciliation. Substantial design work; deferred.

Each gets its own brainstorm → spec → plan cycle.

## Open questions

None.
