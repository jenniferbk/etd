# Transcript Ingester Design

Date: 2026-04-20
Status: Spec — approved during brainstorming, pending implementation plan.

## Purpose

Let researchers import a classroom-discourse transcript into ETD and populate diagrams by dragging utterances from a side panel onto the canvas. Transcripts may be pre-annotated by an upstream agent (speaker + contributor + object type tags) or raw (user picks types via dropdowns). Each utterance becomes one argument or support element when dragged, with its speaker and timestamp attached as attribution metadata.

This is an **ingestion feature** — connections between elements remain user-drawn. The feature does not automate diagram construction; it speeds the tedious step of transcribing individual utterances into elements while preserving provenance (which transcript, which line).

## Scope

### In scope

- Plain-text transcript import (`.txt`) with optional inline annotation tags
- Right-column panel listing every transcript line as a draggable card
- Auto-inference of `teacher` / `student` contributor from speaker prefix
- Per-item contributor and object type dropdowns for editing before drag
- Drag-to-canvas creates a new argument or support element with utterance text as `content` and `{speaker, timestamp}` as `attribution`
- "Used" visual state on panel items derived from elements' `sourceTranscript` back-reference
- Transcript persistence across save/load (travels with the diagram JSON)
- Parse-warning surface (count of skipped lines shown in panel header)

### Out of scope

- The upstream annotator agent itself (separate project; this spec only fixes the file format it produces)
- Automatic connection drawing between imported elements — user draws connections manually, as today
- Splitting or merging transcript lines into multiple panel items — the 1:1 rule is firm for this spec; can be revisited later
- Round-tripping `sourceTranscript` through `.diagramx` export — it is an ETD-internal field
- Loading multiple transcripts simultaneously — single active transcript; loading a new one replaces the previous
- Chronological reordering or format normalization of timestamps — timestamp strings are preserved verbatim

## File format

Plain UTF-8 text, one utterance per line. Grammar:

```
<timestamp> <speaker>[ <tag>]: <text>
```

Where:
- `<timestamp>` — matches `MM:SS`, `MM:SS.s`, or `H:MM:SS[.s]` (e.g. `55:07`, `55:07.3`, `1:05:22`). Preserved as-is in the parsed model; never reformatted.
- `<speaker>` — everything between the timestamp and either the `:` or the `[`, whitespace-trimmed. May contain spaces, hyphens, parens (`Teacher-CurlyHair`, `Students (chorus)`).
- `<tag>` (optional) — `[<contributor>|<objectType>]`. Either side may be empty: `[|claim]`, `[teacher|]`, `[|]`. Missing tag entirely is equivalent to `[|]`.
- `<text>` — everything after the `:`, trimmed.

Example:

```
55:07 Teacher-CurlyHair [teacher|claim]: We're going to watch the light...
55:12 Teacher-CurlyHair: ...stays green, makes its four sides, four rotations.
55:18 Students (chorus) [student|claim]: Rectangle! Square! Square!
```

Blank lines and any line that fails the grammar are skipped silently. The count of skipped lines is stored in `parseWarnings` and surfaced in the panel header.

### Valid `<contributor>` values

`given` / `student` / `teacher` / `joint` / `implicit` (matches `ContributorType` in `src/types/elements.ts`). Case-insensitive on parse; normalized to lowercase.

### Valid `<objectType>` values

Argument types: `data` / `claim` / `warrant` / `backing` / `qualifier` / `rebuttal`
Support types: `action` / `question` / `other`

Case-insensitive on parse; normalized to lowercase. Any value outside this set is treated as missing (behaves like `[|]`) and a parse warning is recorded.

## Parsing behavior

### Contributor inference

Applied only when the tag is absent OR the contributor half of the tag is empty.

Rules:
- Speaker starts with `Teacher` (case-insensitive) → `teacher`
- Speaker starts with `Student` or `Students` (case-insensitive) → `student`
- Otherwise → `null` (user sets via dropdown)

Groups of students (e.g. `Students (chorus)`, `Students (group)`) classify as `student`, not `joint`. `joint`, `given`, and `implicit` are never inferred — they must be explicit in the tag.

Explicit tags **override** inference. A line tagged `[joint|claim]` with speaker `Teacher-X` yields `contributor = joint`, even though the prefix would infer `teacher`.

### Object type

Never inferred. If the tag is missing or its object-type half is empty, `objectType` is `null` in the parsed model and the user picks via dropdown in the panel.

## Data model

### Transcript state

Added to the Zustand diagram store (extend `diagramStore.ts` or add a slice — implementation choice):

```typescript
interface Transcript {
  id: string;                // uuid, stable across save/load
  filename: string;          // for panel header display
  lines: TranscriptLine[];
  parseWarnings: string[];   // human-readable, e.g. "3 lines skipped"
}

interface TranscriptLine {
  index: number;             // 0-based, stable
  timestamp: string;         // raw, preserved verbatim
  speaker: string;
  text: string;
  contributor: ContributorType | null;
  objectType: ArgumentType | SupportType | null;
}

// Store fields:
//   transcript: Transcript | null
//   setTranscript(t: Transcript | null): void
//   updateTranscriptLine(index: number, patch: Partial<TranscriptLine>): void
```

### Element extension

Add an optional back-reference to `BaseElement` in `src/types/elements.ts`:

```typescript
interface BaseElement {
  // ...existing fields...
  sourceTranscript?: { transcriptId: string; lineIndex: number };
}
```

This lets the panel compute "used" state as a derived value (see below) and preserves provenance when diagrams are saved.

## Panel UI

### Layout

Fixed right column, ~280px wide, mirroring the left Elements palette visually. Toggled by a new toolbar button positioned between "Toggle Legend" and the zoom controls in `Toolbar.tsx`. Empty state (no transcript loaded): a centered "Load transcript (.txt)" button that invokes the same file picker as the toolbar button. Panel is hidden (zero width, canvas reclaims space) when toggled off.

### Panel header

```
Transcript
<filename.txt>           [✕ close]
128 lines · 3 skipped
```

- `close` removes the transcript and any `sourceTranscript` references on elements become orphans (they still display but their "used" link is severed)

### Panel item

One card per `TranscriptLine`, top-down, scrollable. Rendered in the order parsed (no chronological sort).

```
┌──────────────────────────────────────┐
│ 55:07  Teacher-CurlyHair             │
│ "We're going to watch the light..."  │
│ [teacher ▾]  [claim ▾]       ✓ used  │
└──────────────────────────────────────┘
```

- Header: `<timestamp>` + `<speaker>`, small secondary color
- Body: utterance text, clamped to 2–3 lines with ellipsis; full text in hover tooltip
- Two dropdowns:
  - Contributor: `given` / `student` / `teacher` / `joint` / `implicit` / `—`
  - Object type: `data` / `claim` / `warrant` / `backing` / `qualifier` / `rebuttal` / `action` / `question` / `other` / `—`
- Used badge (checkmark + "used" label) when the item has been dragged onto the canvas
- Whole card is the drag handle (HTML5 drag, matching the left Elements palette pattern)

### Drag rules

- Drag blocked when `contributor === null` OR `objectType === null`. Cursor: `not-allowed`. Tooltip on hover: "Set contributor and object type first."
- Drag also blocked when the combination is invalid for the target element type — specifically when `objectType ∈ {action, question, other}` and `contributor ∈ {given, joint, implicit}` (support elements require `teacher` or `student`). Tooltip: "Support elements require teacher or student contributor."
- Drag allowed when both fields are set and compatible, regardless of "used" state (re-dragging a used item creates a second element; see "Used-state tracking" below).

### Used-state tracking

Derived at render time — not stored on the transcript line:

```typescript
const usedLineIndexes = new Set(
  elements
    .filter(e => e.sourceTranscript?.transcriptId === transcript.id)
    .map(e => e.sourceTranscript!.lineIndex)
);
```

Deleting a canvas element → panel re-renders → line returns to unused automatically. No manual un-mark button needed.

Re-dragging a used item: creates a second element. Both elements have `sourceTranscript.lineIndex === N`. The panel shows the line as used (a line is used iff ≥1 element references it). This is edge-case behavior; not a primary flow.

### Post-drag decoupling

Editing a panel item's dropdowns after a drag does NOT update the already-placed element. Element edits happen via the bottom Properties panel, as with any hand-placed element.

## Drag → element creation

On drop, create a new `DiagramElement` at the cursor drop position. The shape depends on `objectType`:

- `data` / `claim` / `warrant` / `backing` / `qualifier` / `rebuttal` → `ArgumentElement` with `type: 'argument'`, `argumentType: objectType`, `contributor`, `label: ''` (user edits later)
- `action` / `question` / `other` → `SupportElement` with `type: 'support'`, `supportType: objectType`, `contributor`

**Incompatible combination handling:** `SupportElement.contributor` is constrained to `teacher | student` by the existing type. If a panel item has `contributor ∈ {given, joint, implicit}` AND `objectType ∈ {action, question, other}`, the drag is blocked at drag-start time. Tooltip: "Support elements require teacher or student contributor — change the contributor or object type." This is a harder constraint than the generic "set both" rule, so it's enforced in addition to it.

Common fields on both:
- `id`: new uuid
- `position`: cursor drop position (canvas coordinates)
- `size`: default for the element type (use the same defaults as the left-palette drag)
- `content`: `line.text` (just the utterance text, no timestamp prefix)
- `attribution`: `{ speaker: line.speaker, timestamp: line.timestamp }`
- `sourceTranscript`: `{ transcriptId: transcript.id, lineIndex: line.index }`

## Toolbar integration

Add one new button to `Toolbar.tsx`:

- **Position**: in the "View options" group, after "Toggle Legend"
- **Icon**: from lucide-react; `FileText` or similar (final pick during implementation)
- **Tooltip**: "Load transcript"
- **Shortcut**: none (keep the existing shortcut set intact)
- **Behavior**: click → file picker (accept `.txt`) → parse → replace any existing transcript → open panel

Separately, the panel visibility itself is controlled by the panel-toggle button (also new, adjacent to the load button or integrated with it — implementation detail). Opening the panel with no transcript loaded shows the empty state.

## Save / load integration

### Save

`handleSave` in `Toolbar.tsx` already serializes `{ version, name, elements, connections }`. Extend to include `transcript`:

```typescript
const data = {
  version: '1.1',           // bump minor — backwards-compatible
  name: diagramName,
  elements,
  connections,
  transcript,               // may be null
};
```

The `sourceTranscript` field on elements is already part of `BaseElement`, so it flows through the existing `elements` serialization for free.

### Load

`handleFileChange` passes the parsed `data` to `loadDiagram`. Extend the `loadDiagram` action to accept an optional fourth parameter `transcript?: Transcript | null`. Old saves (no `transcript` field) load with `transcript: null` — fully backwards-compatible.

### Load with existing transcript

If a user loads a new `.txt` transcript while one is already active:

- If any current-canvas element has a `sourceTranscript.transcriptId` matching the active transcript → show a confirm dialog: "Loading a new transcript will orphan N existing element references. Proceed?" Orphaned elements keep all their content and attribution but lose their "used" link (the new transcript's id won't match).
- Otherwise → silent replace.

## Error handling

- Unparseable line → skip silently, increment `parseWarnings` counter. Do not fail the whole load.
- File with zero parseable lines → show alert "No valid transcript lines found in <filename>."; transcript state unchanged.
- File read failure (non-`.txt` content, binary, etc.) → show alert "Failed to read transcript file."; transcript state unchanged.
- Contributor / objectType value outside the allowed set → treat as missing (same as `[|]`); parse warning logged.

## Testing approach

Per `CLAUDE.md`: use Claude for Chrome for live testing after implementation.

Targeted scenarios:
1. Raw transcript (no tags) — every line shows `— / —` dropdowns, contributor inferred where possible, drag blocked until both set
2. Fully-annotated transcript — every line ready to drag immediately, contributor and objectType pre-filled
3. Mixed — some lines tagged, some not
4. Drag creates correct element type with correct attribution
5. Element deletion un-marks the panel line
6. Save → reload → transcript persists with its parse warnings, used-state re-derives correctly
7. Re-import a different `.txt` — orphan-confirmation dialog fires when elements would be orphaned

Plus `npm run typecheck` and `npm run lint` must pass.

## Deployment note

Per `CLAUDE.md`: after push to the ETD repo, mirror the build into `jenkleiman.com/public/tools/etd/` per the existing two-repo workflow.

## Known limitations

- Line grammar is strict — speakers with `:` or `[` in their name will mis-parse. Real-world transcripts from the user's workflow don't appear to hit this, but it's a latent sharp edge.
- Timestamps are strings only — the app doesn't enforce chronological order, format consistency, or monotonic progression.
- Dedup: two lines with identical `{timestamp, speaker, text}` remain distinct by `lineIndex`.
- No undo/redo of transcript load itself (zundo covers element-level operations, not transcript state). Re-loading restores, but closing then reopening the app loses an unsaved transcript along with the unsaved diagram.

## Open questions deferred to implementation

- Exact icon choice for the toolbar button
- Whether the panel-toggle and transcript-load button are two buttons or one combined control
- Default element size for transcript-dragged elements (mirror the left-palette drag defaults verbatim)
- Whether "Close transcript" is a panel-header `✕` or a separate menu action
