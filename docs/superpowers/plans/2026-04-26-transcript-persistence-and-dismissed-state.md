# Transcript Persistence Completeness + Per-Line Dismissed State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit per-line `dismissed` flag with a checkbox UI and distinct visual state, fix the four transcript persistence/UX bugs (autosave drops transcripts, panel doesn't auto-open on load, `.drawing` import path doesn't pass transcript, panel "X" button destroys transcript instead of just hiding the panel), and consolidate the save-schema version literal to a single exported constant.

**Architecture:** Independent flags — `dismissed` is a stored `boolean` on `TranscriptLine`, `used` remains a derived property; the display layer picks a single styling per line with priority `used > dismissed > default`. No cross-store atomic writes (no auto-clear on drag), so undo/redo and zundo's existing partialize behavior are unaffected. Bugs A/B/C/D are mechanically independent and ship as their own commits. The schema-version consolidation lands first so subsequent commits use the constant.

**Tech Stack:** React 19, TypeScript, Vite, Konva.js (`react-konva`), Zustand, zundo. No test framework — verification is `npm run lint`, `npm run build` (which runs `tsc -b`), and manual browser testing per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-04-26-transcript-persistence-and-dismissed-state-design.md`

**Branch:** Should be created as `feature/transcript-dismissed-state` from `main` before Task 1. Working-tree note: `package-lock.json` may have unrelated drift (`peer: true` flag stripping from a prior `npm install`); do NOT include it in any commit.

---

## Task 1: Consolidate save-schema version to a single exported constant

**Files:**
- Create: `src/utils/schema.ts`
- Modify: `src/App.tsx:89` (replace `'1.1'` literal with constant import)
- Modify: `src/components/Toolbar/Toolbar.tsx:75` (replace `'1.1'` literal with constant import)

This task lands the bumped version (`'1.2'`) at the same time as the consolidation, since the literal at the two existing call sites is being replaced anyway.

- [ ] **Step 1: Create `src/utils/schema.ts`**

```typescript
// Save-format schema version stamped into every saved diagram JSON.
// Bump on any breaking schema change. Optional/additive fields don't require a bump,
// but bumping when a new field is added is fine and helps observability.
export const SAVE_SCHEMA_VERSION = '1.2';
```

- [ ] **Step 2: Replace the literal in `src/App.tsx`**

Find the existing block (around `App.tsx:84-102`) — the `handleSave` callback that builds the JSON payload. Look for `version: '1.1',` (currently line 89). Add a new import at the top of the file (alongside the existing imports from `./utils/...`):

```typescript
import { SAVE_SCHEMA_VERSION } from './utils/schema';
```

Then replace:

```typescript
const data = {
  version: '1.1',
  name: diagramName,
```

with:

```typescript
const data = {
  version: SAVE_SCHEMA_VERSION,
  name: diagramName,
```

- [ ] **Step 3: Replace the literal in `src/components/Toolbar/Toolbar.tsx`**

Add an import at the top:

```typescript
import { SAVE_SCHEMA_VERSION } from '../../utils/schema';
```

(Adjust the relative path if the file's import block uses a different convention — check existing imports.)

Find `version: '1.1',` (currently line 75 inside a save payload object) and replace `'1.1'` with `SAVE_SCHEMA_VERSION`.

- [ ] **Step 4: Verify no other version literals remain**

```bash
grep -rn "version.*'1\.1'\|version.*\"1\.1\"\|'1\.1'\|\"1\.1\"" src/
```

Expected: zero matches (other than the new import lines and possibly the constant definition itself, neither of which contain `'1.1'`). If any other usage of `'1.1'` shows up that wasn't expected, investigate before continuing.

- [ ] **Step 5: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean lint (Canvas-related pre-existing errors only, the same baseline as before) + clean `tsc -b` + successful Vite production build.

- [ ] **Step 6: Commit**

```bash
git add src/utils/schema.ts src/App.tsx src/components/Toolbar/Toolbar.tsx
git commit -m "$(cat <<'EOF'
Consolidate save-schema version to SAVE_SCHEMA_VERSION constant

Replaces hardcoded '1.1' string literals at App.tsx:89 and Toolbar.tsx:75
with a single exported SAVE_SCHEMA_VERSION constant in src/utils/schema.ts.
Bumps version to '1.2' as part of the consolidation, anticipating the
additive 'dismissed' field on TranscriptLine that follows in subsequent
commits.
EOF
)"
```

---

## Task 2: Add `dismissed?: boolean` field to `TranscriptLine`

**Files:**
- Modify: `src/types/transcript.ts`

This is purely an additive type change. No consumer reads the field yet; the field is plumbed through subsequent tasks.

- [ ] **Step 1: Edit `src/types/transcript.ts` to add the field**

Find the `TranscriptLine` interface (currently lines 7-15). Add `dismissed?: boolean;` to it, with a brief inline comment. Final shape:

```typescript
export interface TranscriptLine {
  index: number;              // 0-based position within the transcript; stable
  timestamp: string;          // preserved verbatim (e.g. "55:07", "1:05:22.3")
  speaker: string;            // preserved verbatim (e.g. "Teacher-CurlyHair")
  text: string;               // the utterance body, trimmed
  contributor: ContributorType | null;
  objectType: TranscriptObjectType | null;
  subtype?: SupportSubtype;   // only meaningful when objectType === 'other'
  dismissed?: boolean;        // explicit "reviewed and not argument-relevant" judgment
}
```

- [ ] **Step 2: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean. Adding an optional field is a safe additive change; existing readers ignore it.

- [ ] **Step 3: Commit**

```bash
git add src/types/transcript.ts
git commit -m "$(cat <<'EOF'
Add optional dismissed flag to TranscriptLine

Stores the researcher's explicit "reviewed and not argument-relevant"
judgment per transcript line. Optional so 1.1 files round-trip
cleanly; absent/undefined is treated identically to false. UI plumbing
follows in later commits.
EOF
)"
```

---

## Task 3: Bug A — autosave includes transcript and recovery prompt triggers on transcript-only state

**Files:**
- Modify: `src/hooks/useAutoSave.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Edit `src/hooks/useAutoSave.ts`**

Add a `Transcript` import at the top, alongside the existing imports. The current file imports `useDiagramStore` from `../store`; add the type import from the same types index path used elsewhere. Append:

```typescript
import type { Transcript } from '../types';
```

Update the `AutoSaveData` interface (currently lines 7-11) to include `transcript`:

```typescript
interface AutoSaveData {
  elements: ReturnType<typeof useDiagramStore.getState>['elements'];
  connections: ReturnType<typeof useDiagramStore.getState>['connections'];
  transcript: Transcript | null;
  timestamp: number;
}
```

Update the save callback inside the `setInterval` (currently lines 17-36) so the guard accepts transcript-only state and the saved payload includes the transcript:

```typescript
intervalRef.current = window.setInterval(() => {
  const state = useDiagramStore.getState();

  // Save if there's any work in progress: diagram content or a loaded transcript.
  if (state.elements.length > 0 || state.connections.length > 0 || state.transcript !== null) {
    const data: AutoSaveData = {
      elements: state.elements,
      connections: state.connections,
      transcript: state.transcript,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
      console.log('Auto-saved diagram at', new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Failed to auto-save:', e);
    }
  }
}, AUTO_SAVE_INTERVAL);
```

- [ ] **Step 2: Edit `src/App.tsx` — recovery prompt trigger**

Find the on-mount recovery check (currently `App.tsx:43-48`):

```typescript
useEffect(() => {
  const saved = getAutoSavedData();
  if (saved && (saved.elements.length > 0 || saved.connections.length > 0)) {
    setRecoveryData({ timestamp: saved.timestamp });
  }
}, []);
```

Extend the condition to also trigger on transcript-only saves. Use loose equality (`!= null`) to handle both `null` and missing-field on older AutoSaveData entries:

```typescript
useEffect(() => {
  const saved = getAutoSavedData();
  if (
    saved &&
    (saved.elements.length > 0 ||
      saved.connections.length > 0 ||
      saved.transcript != null)
  ) {
    setRecoveryData({ timestamp: saved.timestamp });
  }
}, []);
```

- [ ] **Step 3: Edit `src/App.tsx` — `handleRecover` passes transcript**

Find `handleRecover` (currently `App.tsx:51-58`):

```typescript
const handleRecover = useCallback(() => {
  const saved = getAutoSavedData();
  if (saved) {
    loadDiagram(saved.elements, saved.connections);
    clearAutoSave();
  }
  setRecoveryData(null);
}, [loadDiagram]);
```

Update the `loadDiagram` call to thread the transcript through:

```typescript
const handleRecover = useCallback(() => {
  const saved = getAutoSavedData();
  if (saved) {
    loadDiagram(saved.elements, saved.connections, undefined, saved.transcript);
    clearAutoSave();
  }
  setRecoveryData(null);
}, [loadDiagram]);
```

`name` is `undefined` because autosave doesn't capture diagram name; `loadDiagram`'s body handles that with `name || 'Untitled Diagram'`. `saved.transcript` may be `null` or `undefined` for older saves; `loadDiagram` does `transcript ?? null` internally, so both are safe.

- [ ] **Step 4: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAutoSave.ts src/App.tsx
git commit -m "$(cat <<'EOF'
Persist and recover transcript through autosave (Bug A)

Adds 'transcript' to the AutoSaveData payload, extends the autosave
content guard to fire on transcript-only state (so a researcher who
loads a transcript but hasn't yet built a diagram still gets recovery
on crash), extends the recovery-prompt trigger condition in parallel,
and threads the saved transcript through handleRecover into loadDiagram.
EOF
)"
```

---

## Task 4: Bug C — `.drawing` import passes null transcript

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx:104`

- [ ] **Step 1: Edit the single line in `Toolbar.tsx:104`**

Find the `.drawing` branch in `handleFileChange` (currently around lines 100-107):

```typescript
// Handle .drawing files (DiagramMix binary plist)
if (file.name.endsWith('.drawing')) {
  const result = await importDrawingFile(file);
  loadDiagram(result.elements, result.connections, result.name);
  e.target.value = '';
  return;
}
```

Add `null` as the fourth arg:

```typescript
// Handle .drawing files (DiagramMix binary plist)
if (file.name.endsWith('.drawing')) {
  const result = await importDrawingFile(file);
  loadDiagram(result.elements, result.connections, result.name, null);
  e.target.value = '';
  return;
}
```

- [ ] **Step 2: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "$(cat <<'EOF'
Pass null transcript on .drawing import path (Bug C)

DiagramMix .drawing files don't carry transcripts, but the previous
three-arg call left any in-store transcript untouched — letting it
bleed into a freshly imported diagram. Pass null explicitly to clear.
EOF
)"
```

---

## Task 5: Bug D + Bug B — Decouple panel "X" button from setTranscript and add panel auto-open

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx`
- Modify: `src/App.tsx`

These two fixes ship together because the X-button rewire requires a new `onClose` prop from `App.tsx`, and the auto-open useEffect lives in the same file.

- [ ] **Step 1: Add `Props` interface and `onClose` to `TranscriptPanel.tsx`**

Edit `src/components/TranscriptPanel/TranscriptPanel.tsx`. Currently the component has no props (`export function TranscriptPanel()`). Add a props interface and accept the new `onClose` callback. Replace the function signature and `handleClose`:

Current:

```typescript
export function TranscriptPanel() {
  const transcript = useDiagramStore((s) => s.transcript);
  const setTranscript = useDiagramStore((s) => s.setTranscript);
  // ...
  const handleClose = () => {
    setTranscript(null);
  };
```

New:

```typescript
interface TranscriptPanelProps {
  onClose: () => void;
}

export function TranscriptPanel({ onClose }: TranscriptPanelProps) {
  const transcript = useDiagramStore((s) => s.transcript);
  const setTranscript = useDiagramStore((s) => s.setTranscript);
  // ...
  const handleClose = () => {
    onClose();
  };
```

`setTranscript` is still imported because it's used by `handleFileChange` to *set* the transcript on user-initiated load. Don't remove that import.

- [ ] **Step 2: Update `App.tsx` — pass `onClose` and add auto-open `useEffect`**

In `App.tsx`, find the existing JSX line `{transcriptPanelOpen && <TranscriptPanel />}` (currently around `App.tsx:335`). Replace with:

```tsx
{transcriptPanelOpen && (
  <TranscriptPanel onClose={() => setTranscriptPanelOpen(false)} />
)}
```

Then add a new `useEffect` to auto-open the panel whenever a transcript becomes present in the store. Place it near the other `useEffect` that handles the recovery check (currently around `App.tsx:42-48`). Add immediately after that block:

```typescript
// Auto-open the transcript panel when a transcript becomes loaded in the store.
// Triggers on JSON load, autosave recovery, or any future load path. Setting
// to true is idempotent if already open. Manual close after auto-open still
// works; the next null→non-null transition reopens.
useEffect(() => {
  if (transcript) setTranscriptPanelOpen(true);
}, [transcript]);
```

`transcript` is already in the destructured `useDiagramStore` hook at `App.tsx:24-38` (line 37); no new import needed.

- [ ] **Step 3: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean. The new `onClose` prop on `TranscriptPanel` makes it required at the call site; if you forgot to pass it, TypeScript will error. If lint complains about the `useEffect`'s dependency array, ensure `transcript` is the only listed dep.

- [ ] **Step 4: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
Decouple panel X button from setTranscript; auto-open on load (Bugs D, B)

Previously the panel's X button called setTranscript(null), destroying
the transcript instead of just hiding the panel — a latent data-loss
bug that the new dismissed-state feature would make catastrophic. Add
an onClose prop so the parent toggles its local panel-open state, and
add a useEffect in App.tsx that auto-opens the panel whenever the
store's transcript transitions to non-null. Covers JSON load, autosave
recovery, and any future load path.
EOF
)"
```

---

## Task 6: Dismissed-state UI — checkbox, three-state visual, accessibility

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx` (pass `dismissed` and `onDismissChange` through to items)
- Modify: `src/components/TranscriptPanel/TranscriptPanelItem.tsx` (accept new props; add checkbox; three-state visual; aria-label)

- [ ] **Step 1: Update `TranscriptPanel.tsx` to pass `dismissed` and `onDismissChange` to each `TranscriptPanelItem`**

Find the `transcript.lines.map` block (currently around `TranscriptPanel.tsx:150-164`):

```tsx
<TranscriptPanelItem
  key={line.index}
  line={line}
  transcriptId={transcript.id}
  used={usedLineIndexes.has(line.index)}
  altRow={idx % 2 === 1}
  onContributorChange={(value) =>
    updateTranscriptLine(line.index, { contributor: value })
  }
  onObjectTypeChange={(objectType, subtype) =>
    updateTranscriptLine(line.index, { objectType, subtype })
  }
/>
```

Add `dismissed` (read from `line.dismissed === true`) and `onDismissChange`:

```tsx
<TranscriptPanelItem
  key={line.index}
  line={line}
  transcriptId={transcript.id}
  used={usedLineIndexes.has(line.index)}
  dismissed={line.dismissed === true}
  altRow={idx % 2 === 1}
  onContributorChange={(value) =>
    updateTranscriptLine(line.index, { contributor: value })
  }
  onObjectTypeChange={(objectType, subtype) =>
    updateTranscriptLine(line.index, { objectType, subtype })
  }
  onDismissChange={(value) =>
    updateTranscriptLine(line.index, { dismissed: value })
  }
/>
```

The `=== true` check normalizes `undefined`/`false` to `false` in the prop value, keeping `TranscriptPanelItem`'s prop type a strict `boolean`.

- [ ] **Step 2: Update `TranscriptPanelItem.tsx` — extend `TranscriptPanelItemProps`**

Find the props interface (currently `TranscriptPanelItem.tsx:64-71`):

```typescript
export interface TranscriptPanelItemProps {
  line: TranscriptLine;
  transcriptId: string;
  used: boolean;
  altRow: boolean;
  onContributorChange: (value: ContributorType | null) => void;
  onObjectTypeChange: (objectType: TranscriptObjectType | null, subtype?: SupportSubtype) => void;
}
```

Add `dismissed` and `onDismissChange`:

```typescript
export interface TranscriptPanelItemProps {
  line: TranscriptLine;
  transcriptId: string;
  used: boolean;
  dismissed: boolean;
  altRow: boolean;
  onContributorChange: (value: ContributorType | null) => void;
  onObjectTypeChange: (objectType: TranscriptObjectType | null, subtype?: SupportSubtype) => void;
  onDismissChange: (dismissed: boolean) => void;
}
```

Update the destructuring in the function signature (currently lines 73-80):

```typescript
export function TranscriptPanelItem({
  line,
  transcriptId,
  used,
  dismissed,
  altRow,
  onContributorChange,
  onObjectTypeChange,
  onDismissChange,
}: TranscriptPanelItemProps) {
```

- [ ] **Step 3: Update the `style` prop on the outer `<div>` for three-state opacity**

Find the existing root `<div>` (currently around lines 128-143). The `style` block has `opacity: used ? 0.55 : 1`. Replace just that line with:

```typescript
opacity: used ? 0.55 : (dismissed ? 0.75 : 1),
```

Also add an `aria-label` attribute on the same `<div>`, so screen readers get the dismissed state. Build the label conditionally — only set it when the line is dismissed and not used (used has its own visible "✓ used" label that is in the DOM):

Add this just before the JSX `return`:

```typescript
const ariaLabel = dismissed && !used ? 'Dismissed: not relevant' : undefined;
```

Then on the root `<div>` (currently `<div draggable={canDrag} onDragStart={...} ...>`), add `aria-label={ariaLabel}`. The full opening tag becomes:

```tsx
<div
  draggable={canDrag}
  onDragStart={handleDragStart}
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  title={dragTooltip || undefined}
  aria-label={ariaLabel}
  className="p-3 transition-colors duration-100"
  style={{
    backgroundColor: cardBg,
    borderLeft: `3px solid ${borderColor}`,
    borderBottom: `1px solid ${theme.sidebar.border}`,
    opacity: used ? 0.55 : (dismissed ? 0.75 : 1),
    cursor: canDrag ? 'grab' : 'not-allowed',
  }}
>
```

- [ ] **Step 4: Add the dismiss checkbox at the top-left of each item**

Find the existing top-row flex container (currently around lines 144-170):

```tsx
<div className="flex items-center justify-between mb-1 gap-2">
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
    <GripVertical
      size={12}
      style={{ ... }}
    />
    <div className="text-xs font-mono truncate" style={{ color: theme.sidebar.muted }}>
      {line.timestamp}{' '}
      <span style={{ color: theme.sidebar.textSecondary }}>{line.speaker}</span>
    </div>
  </div>
  {used && (
    <span ... >✓ used</span>
  )}
</div>
```

Insert a checkbox as the first child of the inner `<div className="flex items-center gap-1.5 min-w-0 flex-1">`, placed before the `<GripVertical>`. The checkbox is **only rendered when `!used`** (per Section 3 of the spec — used lines have no dismiss control):

```tsx
<div className="flex items-center justify-between mb-1 gap-2">
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
    {!used && (
      <input
        type="checkbox"
        checked={dismissed}
        onChange={(e) => {
          e.stopPropagation();
          onDismissChange(e.target.checked);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        title={dismissed ? 'Restore: marked not relevant' : 'Mark as not relevant'}
        aria-label={dismissed ? 'Restore: not relevant' : 'Mark as not relevant'}
        className="cursor-pointer flex-shrink-0"
        style={{ accentColor: theme.sidebar.accent }}
      />
    )}
    <GripVertical
      size={12}
      style={{
        color: canDrag ? theme.sidebar.muted : theme.sidebar.border,
        opacity: isHovered && canDrag ? 1 : 0.5,
        flexShrink: 0,
      }}
    />
    <div
      className="text-xs font-mono truncate"
      style={{ color: theme.sidebar.muted }}
    >
      {line.timestamp}{' '}
      <span style={{ color: theme.sidebar.textSecondary }}>{line.speaker}</span>
    </div>
  </div>
  {used ? (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
      style={{ color: theme.sidebar.accent }}
    >
      ✓ used
    </span>
  ) : dismissed ? (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
      style={{ color: theme.sidebar.muted }}
    >
      — not relevant
    </span>
  ) : null}
</div>
```

The mouse-event `stopPropagation` calls prevent the parent `<div draggable>` from initiating a drag when the user clicks the checkbox. Without these, browsers might in some cases interpret a slow click on the checkbox as the start of a drag and prevent the checkbox from toggling.

- [ ] **Step 5: Add strikethrough to the text content when dismissed (and not used)**

Find the text content `<div>` (currently around lines 172-184):

```tsx
<div
  className="text-sm mb-2"
  style={{
    color: theme.sidebar.text,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }}
  title={line.text}
>
  {line.text}
</div>
```

Add `textDecoration` conditionally:

```tsx
<div
  className="text-sm mb-2"
  style={{
    color: theme.sidebar.text,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textDecoration: (dismissed && !used) ? 'line-through' : 'none',
  }}
  title={line.text}
>
  {line.text}
</div>
```

The strikethrough applies only to the text body, not to the timestamp/speaker line above or the dropdowns below.

- [ ] **Step 6: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: clean. The new `dismissed`/`onDismissChange` props are required, so any older usage in the codebase would error — there should be exactly one call site (`TranscriptPanel.tsx`), updated in Step 1.

- [ ] **Step 7: Browser smoke test (subagent: skip if no browser tools available)**

```bash
npm run dev
```

If browser tools are available (load `mcp__claude-in-chrome__*` via ToolSearch), do this minimum check:

1. Open the dev URL.
2. App loads with no console errors.
3. If a transcript can be loaded: load one, click the checkbox on one line, confirm the line gets strikethrough + lighter opacity + the "— not relevant" label appears.

If browser tools aren't available, defer detailed visual verification to Task 7 (the controller will run it manually).

- [ ] **Step 8: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx src/components/TranscriptPanel/TranscriptPanelItem.tsx
git commit -m "$(cat <<'EOF'
Add dismissed-state checkbox UI to transcript panel items

Adds an always-visible checkbox at the top-left of each transcript
item, hidden for used lines (which by definition are relevant).
Toggling sets line.dismissed via the existing updateTranscriptLine
action. Visual treatment: opacity 0.75 + line-through on the text
body + "— not relevant" label, distinct from the existing 0.55 +
"✓ used" treatment. Adds aria-label for screen-reader access to the
dismissed state.

dismissed and used are independent flags; display priority is
used > dismissed > default. No auto-clear: a line dismissed and then
dragged onto the canvas keeps dismissed: true in storage, but its
display switches to "✓ used" until the element is deleted, at which
point the dismissed treatment returns.
EOF
)"
```

---

## Task 7: Final integration verification

**Files:**
- None modified in this task. Verification-only pass against the spec's testing approach.

- [ ] **Step 1: Final lint and build pass**

```bash
npm run lint && npm run build
```

Expected: clean. Any failure means a regression in Tasks 1-6.

- [ ] **Step 2: Full browser walkthrough**

```bash
npm run dev
```

Walk through every bullet from the "Testing approach" section of `docs/superpowers/specs/2026-04-26-transcript-persistence-and-dismissed-state-design.md`, in order:

1. **Dismissed flow.** Load a transcript (any `.txt` you have, or use a small test transcript). Check the dismiss checkbox on a line — strikethrough appears on the text body, opacity drops to ~0.75, "— not relevant" label appears. Uncheck — restoration to default styling.

2. **Used overrides dismissed (display priority).** Dismiss a line. Drag it onto the canvas to create an element. The line in the panel switches to "✓ used" styling (opacity 0.55, no strikethrough, "✓ used" label, no checkbox visible).

3. **Dismissed reappears after element delete.** Continuing #2: delete the element on the canvas. The line in the panel returns to "— not relevant" styling (opacity 0.75, strikethrough, label, checkbox visible AND checked).

4. **Used-only line.** Drag a non-dismissed line to canvas; confirm checkbox absent and "✓ used" styling shown.

5. **Save/load round-trip (four states).** Create a diagram with one used line, one dismissed line, one used+dismissed line (dismiss then drag), one default line. Save to JSON. Reload the page. Load the JSON. Confirm all four states display correctly. Confirm panel auto-opens on load.

6. **Schema version persisted.** Open the saved JSON in a text editor (or `cat path/to/file.json | head -3`); confirm `"version": "1.2"` and the dismissed lines have `"dismissed": true`. Lines whose dismissal was cleared show `"dismissed"` either absent or `false`.

7. **Old-file load (1.1 backward compat).** Load a previously-saved 1.1 file (any older `.json` in your collection); confirm it loads without errors and no lines appear dismissed.

8. **Autosave recovery — diagram + transcript.** Load a transcript and create a few elements. Wait 60 seconds (or `localStorage.getItem('toulmin-diagram-autosave')` to confirm save fired). Reload the page. Confirm the recovery prompt appears, accept it, and confirm both the diagram and the transcript come back. Panel auto-opens.

9. **Autosave recovery — transcript only.** Load a transcript, dismiss a few lines, do not create any elements. Wait 60s for autosave. Reload page. Confirm the recovery prompt appears (this requires the recovery trigger condition extended in Task 3). Accept and confirm dismissed flags are restored.

10. **`.drawing` import after JSON.** Load a JSON with a transcript. Then load a `.drawing` file. Confirm the in-store transcript is cleared and only the new diagram's elements appear. Panel hides (because transcript is now null and the parent's conditional render `{transcriptPanelOpen && ...}` doesn't auto-close — but the panel itself shows the "No transcript loaded" empty state if open).

11. **X-button fix.** Open the transcript panel via load. Click X. Panel hides. Re-open via the panel-toggle button (if there is one) or load a fresh transcript. The original transcript should still be in the store — verify by checking the React devtools store inspector OR by re-loading the original JSON and confirming dismissed flags persist.

12. **Auto-open after manual close.** Open via load → click X to close → load a different transcript JSON. Confirm panel auto-opens with the new transcript.

13. **Accessibility spot check.** Hover the dismiss checkbox on a dismissed line; confirm the `title` attribute reads "Restore: marked not relevant" (or your tooltip-equivalent). Tab through the panel with the keyboard; confirm the checkbox is focusable.

If any step fails, do NOT mark this task complete. Capture which step failed and what the symptom was, and return to the relevant task to fix it.

- [ ] **Step 3: Verify no leftover dead version literals or unused imports**

```bash
grep -rn "version.*'1\.1'\|version.*\"1\.1\"" src/
```

Expected: zero matches (the consolidation in Task 1 should have cleared every literal).

```bash
grep -rn "setTranscript(null)" src/
```

Expected: only matches inside `Toolbar.tsx` (where `null` is passed as an argument to `loadDiagram` for `.drawing` imports — that's a different function call, search for `setTranscript(null)` specifically as a method invocation). The destructive `handleClose` form should be gone.

If unexpected matches appear, investigate before declaring done.

- [ ] **Step 4: No-op or cleanup commit**

If steps 1-3 pass without any code edits, no commit is needed for this task.

If you found and fixed an issue during this task, commit it:

```bash
git add -A
git commit -m "$(cat <<'EOF'
Final cleanup after transcript persistence + dismissed state

Captures any leftover deletions or fixes found during the post-
integration verification pass.
EOF
)"
```

---

## Out of scope (queued as separate sub-projects)

These are explicitly NOT addressed by this plan and remain pending:

1. **Transcript reload reconciliation** — preserve dismissed flags and element back-pointers across edits to the source `.txt`. Likely keys: `(speaker, timestamp, text)` triple matching with manual fallback. Substantial design work; deferred.
2. **Configurable support types** — deferred work; prior brainstorm captured in memory.
3. **UI bug review** — researcher's list of disallowed actions that should be allowed.

Each will get its own brainstorm → spec → plan cycle.
