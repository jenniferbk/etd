# Analytic Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Researchers can write analytic notes on a diagram — general, or attached to a specific element or connection — that save with the diagram (local file, autosave, library versions), show as small canvas badges, and never appear in exports.

**Architecture:** `notes: AnalyticNote[]` lives in `diagramStore` and rides inside the existing save-file shape (`buildDiagramFile`) so local save, autosave and every cloud snapshot carry it with no server change. Anchors are resolved at render time (`utils/noteAnchors.ts`), so deleting an element detaches rather than deletes its notes and undo re-attaches them. A right-side `NotesPanel` (composer + list) mirrors `HistoryPanel`; canvas badges are Konva nodes named `note-badge`, hidden around PNG/PDF stage snapshots by `withNodesHidden`.

**Tech Stack:** React 18 + TypeScript, react-konva (Konva 10), Zustand + zundo, lucide-react 0.562, vitest (Node env, `src/**/*.test.ts` only — no `.tsx` tests, no jsdom).

**Spec:** `docs/superpowers/specs/2026-09-21-counterclaim-and-analytic-notes-design.md` §3. **Depends on** `2026-09-21-counterclaim-connector.md` being complete on this branch (this plan references `conn.type === 'counterclaim'` and does not bump the schema version again).

## Global Constraints

- Branch `feature/counterclaim-and-analytic-notes`; schema version already `'1.7'` — do not change.
- Verification recipe (memory `etd-repo-quirks`): `npm run lint` adds **zero new** problems (baseline ≈ 17); `npx tsc -b` (no root `typecheck` script); `npm test`; `npm run build`.
- Notes are **not** in undo/redo (`partialize` in `diagramStore` stays `elements`, `connections`, `styleConfig`). Deleting a note asks for confirmation.
- Notes change → diagram dirty (`dirtyTracking`), but toggling the panel must not.
- Exports (SVG/PNG/PDF/.diagramx) contain no notes and no badges.
- Copy, verbatim: panel title `Notes`; placeholder `Add an analytic note…`; button `Add note`; chips `Attach to <label>` / `General note`; row label for a lost anchor `Detached — item deleted`; empty state `No notes yet. Notes save with the diagram and never appear in exports.`; delete dialog title `Delete note?`, body `This note will be removed from the diagram. Deleting a note cannot be undone.`, confirm `Delete note`.
- Keyboard: `N` toggles the panel (no modifier; same guards as `F`). `⌘/Ctrl+Enter` submits the composer / saves an edit; `Esc` cancels an edit.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `src/types/notes.ts` (new), `src/types/index.ts` | `AnalyticNote`, `NoteAnchor` |
| `src/store/diagramStore.ts` | `notes`, `notesPanelOpen`, `addNote`/`updateNoteText`/`removeNote`/`setNotesPanelOpen`, `loadDiagram` 6th arg, `clearDiagram` |
| `src/utils/saveDiagram.ts`, `src/utils/buildCloudSnapshot.ts`, `src/hooks/librarySave.ts`, `src/components/Workspace/{CanvasHeader,DiagramCard}.tsx` | write `notes` into every save-file shape |
| `src/api/types.ts` | `SavedDiagramFile.notes?` |
| `src/hooks/useAutoSave.ts`, `src/hooks/dirtyTracking.ts` | autosave + dirty flag |
| `src/App.tsx`, `src/components/Toolbar/Toolbar.tsx`, `src/components/Workspace/{Workspace,HistoryPanel}.tsx` | pass `notes` on every load path; panel mount; `N`; toolbar toggle |
| `src/utils/relativeTime.ts` | accept ISO timestamps with a zone |
| `src/utils/noteAnchors.ts` (new) | resolve/describe anchors, selection anchor, badge counts |
| `src/components/Notes/{NotesPanel,NoteComposer,NoteRow,index}.tsx` (new) | the panel |
| `src/utils/exportHideNodes.ts` (new), `src/components/Canvas/shapes/NoteBadge.tsx` (new) | badge node + hide-around-snapshot helper |
| `src/components/Canvas/Canvas.tsx`, `src/components/Canvas/shapes/{ArgumentShape,SupportShape,TeacherSupportShape,InfoBoxShape,Arrow}.tsx`, `src/utils/pdfExport.ts` | badges + hiding |
| `docs/REQUIREMENTS.md` | §6.1 `notes` field, Appendix C `N` |

---

### Task 1: Types and store

**Files:**
- Create: `src/types/notes.ts`
- Modify: `src/types/index.ts`
- Modify: `src/store/diagramStore.ts` (imports lines 3–8; `DiagramState` ~line 74–147; initial state ~line 163–175; `loadDiagram`/`clearDiagram` ~line 598–634)
- Test: `src/store/diagramStore.test.ts` (append)

**Interfaces:**
- Produces (types): 
  ```ts
  export type NoteAnchorKind = 'element' | 'connection';
  export interface NoteAnchor { kind: NoteAnchorKind; id: string }
  export interface AnalyticNote { id: string; text: string; author?: string; createdAt: string; updatedAt?: string; anchor?: NoteAnchor }
  ```
- Produces (store): `notes: AnalyticNote[]`, `notesPanelOpen: boolean`, `addNote(input: { text: string; anchor?: NoteAnchor; author?: string }): AnalyticNote`, `updateNoteText(id: string, text: string): void`, `removeNote(id: string): void`, `setNotesPanelOpen(open: boolean): void`, `loadDiagram(elements, connections, name?, transcript?, styleConfig?, notes?: AnalyticNote[])`.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/diagramStore.test.ts`. Extend the type import at the top to include `AnalyticNote`:

```ts
import type { ArgumentElement, SupportElement, DiagramElement, Connection, AnalyticNote } from '../types';
```

Then append:

```ts
describe('analytic notes', () => {
  beforeEach(() => {
    useDiagramStore.setState({ notes: [] });
  });

  it('addNote appends a note with id, createdAt, text, anchor and author', () => {
    const note = useDiagramStore.getState().addNote({
      text: 'The warrant is implicit here.',
      anchor: { kind: 'element', id: 'w1' },
      author: 'Jennifer',
    });
    expect(note.id).toMatch(/^note-/);
    expect(Number.isNaN(Date.parse(note.createdAt))).toBe(false);
    expect(note.anchor).toEqual({ kind: 'element', id: 'w1' });
    expect(note.author).toBe('Jennifer');
    expect(useDiagramStore.getState().notes).toEqual([note]);
  });

  it('addNote omits author and anchor keys when not given (general, signed-out note)', () => {
    const note = useDiagramStore.getState().addNote({ text: 'General memo' });
    expect('author' in note).toBe(false);
    expect('anchor' in note).toBe(false);
  });

  it('updateNoteText changes only that note and stamps updatedAt', () => {
    const a = useDiagramStore.getState().addNote({ text: 'a' });
    const b = useDiagramStore.getState().addNote({ text: 'b' });
    useDiagramStore.getState().updateNoteText(a.id, 'a2');
    const notes = useDiagramStore.getState().notes;
    const a2 = notes.find((n) => n.id === a.id)!;
    expect(a2.text).toBe('a2');
    expect(a2.updatedAt).toBeDefined();
    expect(notes.find((n) => n.id === b.id)).toEqual(b);
  });

  it('removeNote drops only that note', () => {
    const a = useDiagramStore.getState().addNote({ text: 'a' });
    const b = useDiagramStore.getState().addNote({ text: 'b' });
    useDiagramStore.getState().removeNote(a.id);
    expect(useDiagramStore.getState().notes).toEqual([b]);
  });

  it('removeElement keeps notes anchored to the removed element (detached, not deleted)', () => {
    useDiagramStore.setState({ elements: [arg('a')] });
    const note = useDiagramStore.getState().addNote({ text: 'memo', anchor: { kind: 'element', id: 'a' } });
    useDiagramStore.getState().removeElement('a');
    expect(useDiagramStore.getState().notes).toEqual([note]);
  });

  it('clearDiagram empties notes', () => {
    useDiagramStore.getState().addNote({ text: 'memo' });
    useDiagramStore.getState().clearDiagram();
    expect(useDiagramStore.getState().notes).toEqual([]);
  });

  it('loadDiagram defaults notes to [] when omitted and loads them when given', () => {
    useDiagramStore.getState().addNote({ text: 'stale' });
    useDiagramStore.getState().loadDiagram([], [], 'Untitled');
    expect(useDiagramStore.getState().notes).toEqual([]);
    const loaded: AnalyticNote[] = [{ id: 'note-1', text: 'from file', createdAt: '2026-09-21T10:00:00.000Z' }];
    useDiagramStore.getState().loadDiagram([], [], 'Untitled', null, undefined, loaded);
    expect(useDiagramStore.getState().notes).toEqual(loaded);
  });

  it('setNotesPanelOpen toggles the panel flag', () => {
    useDiagramStore.getState().setNotesPanelOpen(true);
    expect(useDiagramStore.getState().notesPanelOpen).toBe(true);
    useDiagramStore.getState().setNotesPanelOpen(false);
    expect(useDiagramStore.getState().notesPanelOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/diagramStore.test.ts -t "analytic notes"`
Expected: FAIL — `addNote is not a function` (and TS complaints about `notes`).

- [ ] **Step 3: Create the types**

Create `src/types/notes.ts`:

```ts
// Analytic notes — researcher memos saved inside the diagram file. A note is
// either general (no anchor) or attached to one element or connection by id.
// Anchors are resolved at render time: if the anchored item is gone the note
// is shown as detached, never deleted (see utils/noteAnchors.ts).

export type NoteAnchorKind = 'element' | 'connection';

export interface NoteAnchor {
  kind: NoteAnchorKind;
  id: string;
}

export interface AnalyticNote {
  id: string;
  text: string;
  /** Display name of the signed-in author at creation; absent when signed out. */
  author?: string;
  /** ISO 8601 with zone, e.g. 2026-09-21T14:03:00.000Z */
  createdAt: string;
  /** Set on every text edit. */
  updatedAt?: string;
  /** Absent → general note about the whole diagram. */
  anchor?: NoteAnchor;
}
```

Add to `src/types/index.ts`:

```ts
export * from './notes';
```

- [ ] **Step 4: Extend the store**

In `src/store/diagramStore.ts`:

1. Add `AnalyticNote, NoteAnchor` to the `import type { … } from '../types';` block (lines 3–8).
2. In `interface DiagramState`, after `styleConfig: StyleConfig;` add:

```ts
  // Analytic notes — researcher memos saved with the diagram, never exported.
  notes: AnalyticNote[];

  // UI: whether the Notes side panel is open (not persisted, not undoable).
  notesPanelOpen: boolean;
```

3. After the `// Actions - Style config` entry add:

```ts
  // Actions - Notes
  addNote: (input: { text: string; anchor?: NoteAnchor; author?: string }) => AnalyticNote;
  updateNoteText: (id: string, text: string) => void;
  removeNote: (id: string) => void;
  setNotesPanelOpen: (open: boolean) => void;
```

4. Change the `loadDiagram` signature in the interface to:

```ts
  loadDiagram: (
    elements: DiagramElement[],
    connections: Connection[],
    name?: string,
    transcript?: Transcript | null,
    styleConfig?: StyleConfig,
    notes?: AnalyticNote[],
  ) => void;
```

5. In the initial state (after `styleConfig: createCurrentDefaults(),` at ~line 175) add:

```ts
      notes: [],
      notesPanelOpen: false,
```

6. After the `replaceStyleConfig` action (search for `replaceStyleConfig:`) add:

```ts
      addNote: ({ text, anchor, author }) => {
        const note: AnalyticNote = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          createdAt: new Date().toISOString(),
          ...(author ? { author } : {}),
          ...(anchor ? { anchor } : {}),
        };
        set((state) => ({ notes: [...state.notes, note] }));
        return note;
      },

      updateNoteText: (id, text) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, text, updatedAt: new Date().toISOString() } : n,
          ),
        })),

      removeNote: (id) =>
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),

      setNotesPanelOpen: (notesPanelOpen) => set({ notesPanelOpen }),
```

7. `loadDiagram`: change the implementation signature to `loadDiagram: (elements, connections, name, transcript, styleConfig, notes) => {` and add `notes: notes ?? [],` to its `set({ … })` (after `transcript: transcript ?? null,`).
8. `clearDiagram`: add `notes: [],` after `styleConfig: createCurrentDefaults(),`.

Do **not** touch `partialize` — notes stay out of undo history by design.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/store/diagramStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/types/notes.ts src/types/index.ts src/store/diagramStore.ts src/store/diagramStore.test.ts
git commit -m "feat(notes): AnalyticNote type + store state/actions; loadDiagram accepts notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Persistence — save file, cloud snapshot, autosave, dirty tracking, every load path

**Files:**
- Modify: `src/utils/saveDiagram.ts:19-36`
- Modify: `src/utils/buildCloudSnapshot.ts:13-19`
- Modify: `src/hooks/librarySave.ts:21-29`
- Modify: `src/components/Workspace/CanvasHeader.tsx:174-182`
- Modify: `src/components/Workspace/DiagramCard.tsx:107-118`
- Modify: `src/api/types.ts` (`SavedDiagramFile`)
- Modify: `src/hooks/useAutoSave.ts` (interface ~line 9–21; save body ~line 33–45)
- Modify: `src/hooks/dirtyTracking.ts:33-45`
- Modify: `src/App.tsx` (`hasWork` ~line 27–30; mount check ~line 123–132; `handleRecover` ~line 152–164; `handleFileLoad` ~line 282–300)
- Modify: `src/components/Toolbar/Toolbar.tsx:110-114`
- Modify: `src/components/Workspace/Workspace.tsx` (`handleFileChange` ~line 82–92; `openDiagram` ~line 105–130)
- Modify: `src/components/Workspace/HistoryPanel.tsx` (`loadVersion` ~line 59–81; `hasContent` ~line 95)
- Tests: `src/utils/saveDiagram.test.ts`, `src/hooks/useAutoSave.test.ts`, `src/hooks/dirtyTracking.test.ts`

**Interfaces:**
- Consumes: store `notes`, `addNote`, `setNotesPanelOpen`, `loadDiagram(..., notes)` (Task 1).
- Produces: `DiagramSnapshot.notes: AnalyticNote[]` (required); save file gains `notes`; `SavedDiagramFile.notes?: unknown[]`; `AutoSaveData.notes?: AnalyticNote[]`.

- [ ] **Step 1: Write the failing tests**

`src/utils/saveDiagram.test.ts` — in `buildDiagramFile` test, add `notes: []` to the input object and to the expected object:

```ts
    const file = buildDiagramFile({
      diagramName: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {} as never,
      transcript: null,
      notes: [],
    });
    expect(file).toEqual({
      version: SAVE_SCHEMA_VERSION,
      name: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {},
      transcript: null,
      notes: [],
    });
```

`src/hooks/useAutoSave.test.ts` — append inside the existing `describe`:

```ts
  it('round-trips notes through getAutoSavedData', () => {
    const notes = [{ id: 'note-1', text: 'memo', createdAt: '2026-09-21T10:00:00.000Z' }];
    localStorage.setItem(
      KEY,
      JSON.stringify({ elements: [], connections: [], transcript: null, notes, timestamp: 1 }),
    );
    expect(getAutoSavedData()?.notes).toEqual(notes);
  });

  it('leaves notes undefined for legacy entries (loadDiagram defaults to [])', () => {
    localStorage.setItem(KEY, JSON.stringify({ elements: [], connections: [], transcript: null, timestamp: 1 }));
    expect(getAutoSavedData()?.notes).toBeUndefined();
  });
```

`src/hooks/dirtyTracking.test.ts` — append inside the `describe`:

```ts
  it('marks saved → dirty when a note is added', () => {
    stop = startDirtyTracking();
    useDiagramStore.getState().addNote({ text: 'memo' });
    expect(useCloudStore.getState().status).toBe('dirty');
  });

  it('does not increment getEditTick when the notes panel is toggled', () => {
    stop = startDirtyTracking();
    const before = getEditTick();
    useDiagramStore.getState().setNotesPanelOpen(true);
    expect(getEditTick()).toBe(before);
    useDiagramStore.getState().setNotesPanelOpen(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/saveDiagram.test.ts src/hooks/useAutoSave.test.ts src/hooks/dirtyTracking.test.ts`
Expected: `buildDiagramFile` FAILS (no `notes` key; TS error on the input); autosave `notes` test passes trivially (JSON passthrough) — keep it as the contract; dirty test FAILS (status stays `saved`).

- [ ] **Step 3: Save-file shape**

`src/utils/saveDiagram.ts`: add `AnalyticNote` to the type import; in `DiagramSnapshot` add `notes: AnalyticNote[];`; in `buildDiagramFile` add `notes: snapshot.notes,` after `transcript: snapshot.transcript,`.

`src/utils/buildCloudSnapshot.ts`: add `notes: s.notes,` to the `buildDiagramFile({ … })` call.

`src/hooks/librarySave.ts`: in the signed-out `saveDiagramJson({ … })` call add `notes: d.notes,`.

`src/components/Workspace/CanvasHeader.tsx` `handleDownloadCopy`: add `notes: d.notes,`.

`src/components/Workspace/DiagramCard.tsx` `handleDownload`: add `notes: (snap.notes ?? []) as AnalyticNote[],` and add `AnalyticNote` to that file's `import type { … } from '../../types'` (create the import if the file has none; check the top of the file).

`src/api/types.ts` — in `SavedDiagramFile` add:

```ts
  notes?: unknown[];
```

- [ ] **Step 4: Autosave and dirty tracking**

`src/hooks/useAutoSave.ts`:
- Change the type import to `import type { Transcript, StyleConfig, AnalyticNote } from '../types';`
- In `AutoSaveData` add (after `diagramName?`):

```ts
  // Optional: autosave entries written before notes existed lack this field.
  notes?: AnalyticNote[];
```

- Change the "any work in progress" condition to:

```ts
      if (state.elements.length > 0 || state.connections.length > 0 || state.transcript !== null || state.notes.length > 0) {
```

- Add `notes: state.notes,` to the `data` object (after `diagramName: state.diagramName,`).

`src/hooks/dirtyTracking.ts`: add `state.notes !== prev.notes ||` to the condition in `startDirtyTracking` (before `state.diagramName !== prev.diagramName`).

- [ ] **Step 5: Every load path passes notes**

`src/App.tsx`:
- `hasWork()`: `return d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null || d.notes.length > 0;`
- Mount recovery check: add `|| (saved.notes?.length ?? 0) > 0` inside the `if (saved && ( … ))` condition.
- `handleRecover`: `loadDiagram(saved.elements, saved.connections, saved.diagramName, saved.transcript, saved.styleConfig, saved.notes);`
- `handleFileLoad`: `loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig, data.notes);`

`src/components/Toolbar/Toolbar.tsx` `handleFileChange` (.json branch): `loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig, data.notes);`

`src/components/Workspace/Workspace.tsx`:
- `handleFileChange` (.json branch): add `data.notes` as the 6th argument.
- `openDiagram`: add `AnalyticNote` to the `import type { … } from '../../types'` list and pass `(snap.notes ?? []) as AnalyticNote[]` as the 6th argument to `loadDiagram`.

`src/components/Workspace/HistoryPanel.tsx`:
- `loadVersion`: add `AnalyticNote` to the type import; pass `(snap.notes ?? []) as AnalyticNote[]` as the 6th argument.
- `handleRowClick`: `const hasContent = d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null || d.notes.length > 0;`

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/utils/saveDiagram.test.ts src/hooks/useAutoSave.test.ts src/hooks/dirtyTracking.test.ts && npx tsc -b`
Expected: PASS; tsc clean (tsc is what catches any `saveDiagramJson`/`buildDiagramFile` caller you missed — `DiagramSnapshot.notes` is required on purpose).

- [ ] **Step 7: Commit**

```bash
git add src/utils/saveDiagram.ts src/utils/saveDiagram.test.ts src/utils/buildCloudSnapshot.ts src/hooks/librarySave.ts src/components/Workspace/CanvasHeader.tsx src/components/Workspace/DiagramCard.tsx src/api/types.ts src/hooks/useAutoSave.ts src/hooks/useAutoSave.test.ts src/hooks/dirtyTracking.ts src/hooks/dirtyTracking.test.ts src/App.tsx src/components/Toolbar/Toolbar.tsx src/components/Workspace/Workspace.tsx src/components/Workspace/HistoryPanel.tsx
git commit -m "feat(notes): notes persist in save file, cloud snapshots and autosave; edits mark dirty

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Anchor helpers and timestamp display

**Files:**
- Create: `src/utils/noteAnchors.ts`, `src/utils/noteAnchors.test.ts`
- Modify: `src/utils/relativeTime.ts`
- Create: `src/utils/relativeTime.test.ts`

**Interfaces:**
- Consumes: `getClaimRole`, `deriveClaimLabel` (`./claimRoleDerivation`); type guards from `../types`; `conn.type === 'counterclaim'` (counterclaim plan).
- Produces (all exported from `src/utils/noteAnchors.ts`):
  - `type ResolvedAnchor = { status: 'general' } | { status: 'attached'; anchor: NoteAnchor; label: string } | { status: 'detached'; anchor: NoteAnchor }`
  - `const DETACHED_LABEL = 'Detached — item deleted'`
  - `truncate(text: string, max: number): string`
  - `describeElement(el, connections, elementsById): string`
  - `describeConnection(conn, elements, connections): string`
  - `describeAnchor(anchor, elements, connections): string | null`
  - `resolveAnchor(note, elements, connections): ResolvedAnchor`
  - `selectionAnchor(selectedIds, elements, connections): NoteAnchor | null`
  - `countNotesByAnchor(notes): Map<string, number>`
  - `relativeTime(ts)` now accepts both `'2026-09-21 12:00:00'` (SQLite, treated as UTC) and `'2026-09-21T12:00:00.000Z'`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/relativeTime.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  afterEach(() => vi.useRealTimers());

  it('treats zone-less SQLite timestamps as UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:10:00Z'));
    expect(relativeTime('2026-09-21 12:00:00')).toBe('10 minutes ago');
  });

  it('accepts ISO timestamps that already carry a zone (notes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:10:00Z'));
    expect(relativeTime('2026-09-21T12:00:00.000Z')).toBe('10 minutes ago');
    expect(relativeTime('2026-09-21T08:00:00-04:00')).toBe('10 minutes ago');
  });
});
```

Create `src/utils/noteAnchors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AnalyticNote, ArgumentElement, Connection, DiagramElement, InfoBoxElement, SupportElement } from '../types';
import {
  DETACHED_LABEL, countNotesByAnchor, describeAnchor, describeConnection, describeElement,
  resolveAnchor, selectionAnchor, truncate,
} from './noteAnchors';

function claim(id: string, label = `Claim ${id}`): ArgumentElement {
  return { id, type: 'argument', argumentType: 'claim', contributor: 'student', label, content: '', position: { x: 0, y: 0 }, size: { width: 180, height: 80 } };
}
function data(id: string): ArgumentElement {
  return { id, type: 'argument', argumentType: 'data', contributor: 'given', label: `Data ${id}`, content: '', position: { x: 0, y: 0 }, size: { width: 180, height: 80 } };
}
function support(id: string, content: string): SupportElement {
  return { id, type: 'support', contributor: 'teacher', supportType: 'question', content, position: { x: 0, y: 0 }, size: { width: 160, height: 50 } };
}
function infoBox(id: string, label: string): InfoBoxElement {
  return { id, type: 'infoBox', label, content: '', position: { x: 0, y: 0 }, size: { width: 160, height: 80 } };
}
const byId = (els: DiagramElement[]) => new Map(els.map((e) => [e.id, e]));
const note = (id: string, anchor?: AnalyticNote['anchor']): AnalyticNote =>
  ({ id, text: 't', createdAt: '2026-09-21T10:00:00.000Z', ...(anchor ? { anchor } : {}) });

describe('truncate', () => {
  it('collapses whitespace and caps with an ellipsis', () => {
    expect(truncate('  short  text ', 24)).toBe('short text');
    expect(truncate('Why is this one not growing or decaying?', 24)).toBe('Why is this one not gro…');
    expect(truncate('Why is this one not growing or decaying?', 24)).toHaveLength(24);
  });
});

describe('describeElement', () => {
  it('uses the live derived label for claims', () => {
    const c1 = claim('1'); const c2 = claim('2');
    const conns: Connection[] = [{ id: 's', from: '1', to: '2', type: 'support' }];
    expect(describeElement(c1, conns, byId([c1, c2]))).toBe('Dataclaim 1');
    expect(describeElement(c2, conns, byId([c1, c2]))).toBe('Claim 2');
  });
  it('uses the label for non-claim arguments and info boxes', () => {
    expect(describeElement(data('1'), [], byId([]))).toBe('Data 1');
    expect(describeElement(infoBox('i', 'Context'), [], byId([]))).toBe('Context');
  });
  it('uses type + truncated content for support elements', () => {
    expect(describeElement(support('s', 'Why is this one not growing or decaying?'), [], byId([]))).toBe('Question: Why is this one not gro…');
    expect(describeElement(support('s', '   '), [], byId([]))).toBe('Question');
  });
});

describe('describeConnection', () => {
  const els = [data('1'), claim('2'), claim('3')];
  it('reads "from → to" for support links', () => {
    const c: Connection = { id: 'c', from: '1', to: '2', type: 'support' };
    expect(describeConnection(c, els, [c])).toBe('Data 1 → Claim 2');
  });
  it('uses the slash joiner for counterclaims', () => {
    const c: Connection = { id: 'c', from: '2', to: '3', type: 'counterclaim' };
    expect(describeConnection(c, els, [c])).toBe('Claim 2 –/– Claim 3');
  });
  it('says "line" for a connection that targets another connection', () => {
    const base: Connection = { id: 'base', from: '1', to: '2', type: 'support' };
    const w: Connection = { id: 'w', from: '3', to: { connectionId: 'base', position: 0.5 }, type: 'support' };
    expect(describeConnection(w, els, [base, w])).toBe('Warrantclaim 3 → line');
  });
});

describe('describeAnchor / resolveAnchor', () => {
  const els = [data('1'), claim('2')];
  const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
  it('labels element and connection anchors', () => {
    expect(describeAnchor({ kind: 'element', id: '2' }, els, conns)).toBe('Claim 2');
    expect(describeAnchor({ kind: 'connection', id: 'c' }, els, conns)).toBe('Data 1 → Claim 2');
  });
  it('returns null for a missing item', () => {
    expect(describeAnchor({ kind: 'element', id: 'nope' }, els, conns)).toBeNull();
    expect(describeAnchor({ kind: 'connection', id: 'nope' }, els, conns)).toBeNull();
  });
  it('resolves general, attached and detached notes', () => {
    expect(resolveAnchor(note('g'), els, conns)).toEqual({ status: 'general' });
    expect(resolveAnchor(note('a', { kind: 'element', id: '2' }), els, conns)).toEqual({ status: 'attached', anchor: { kind: 'element', id: '2' }, label: 'Claim 2' });
    expect(resolveAnchor(note('d', { kind: 'element', id: 'gone' }), els, conns)).toEqual({ status: 'detached', anchor: { kind: 'element', id: 'gone' } });
    expect(DETACHED_LABEL).toBe('Detached — item deleted');
  });
});

describe('selectionAnchor', () => {
  const els = [claim('1')];
  const conns: Connection[] = [{ id: 'c', from: '1', to: '1', type: 'support' }];
  it('returns the single selected element or connection', () => {
    expect(selectionAnchor(['1'], els, conns)).toEqual({ kind: 'element', id: '1' });
    expect(selectionAnchor(['c'], els, conns)).toEqual({ kind: 'connection', id: 'c' });
  });
  it('returns null for nothing, multi-selection, or an unknown id', () => {
    expect(selectionAnchor([], els, conns)).toBeNull();
    expect(selectionAnchor(['1', 'c'], els, conns)).toBeNull();
    expect(selectionAnchor(['zzz'], els, conns)).toBeNull();
  });
});

describe('countNotesByAnchor', () => {
  it('counts anchored notes per item id and ignores general notes', () => {
    const counts = countNotesByAnchor([
      note('a', { kind: 'element', id: 'e1' }),
      note('b', { kind: 'element', id: 'e1' }),
      note('c', { kind: 'connection', id: 'c1' }),
      note('d'),
    ]);
    expect(counts.get('e1')).toBe(2);
    expect(counts.get('c1')).toBe(1);
    expect(counts.has('d')).toBe(false);
    expect(counts.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/noteAnchors.test.ts src/utils/relativeTime.test.ts`
Expected: FAIL — module `./noteAnchors` not found; the ISO-with-zone case returns an invalid-date string.

- [ ] **Step 3: Make `relativeTime` zone-aware**

Replace the body of `src/utils/relativeTime.ts` with:

```ts
// Minutes/hours/days ago, falling back to a locale date past a week — mirrors
// the granularity researchers actually care about ("did Sam edit this today
// or last month?") without needing exact timestamps. Shared by DiagramCard
// (last-edited), HistoryPanel (per-version timestamps) and the Notes panel.
//
// Accepts two input shapes: SQLite's zone-less "YYYY-MM-DD HH:MM:SS" (UTC —
// a 'Z' is appended) and full ISO 8601 strings that already carry a zone
// (analytic notes' createdAt/updatedAt).
function toDate(timestamp: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
  return new Date(hasZone ? timestamp : timestamp + 'Z');
}

export function relativeTime(isoTimestamp: string): string {
  const then = toDate(isoTimestamp).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return toDate(isoTimestamp).toLocaleDateString();
}
```

- [ ] **Step 4: Create `noteAnchors.ts`**

```ts
// Pure helpers for analytic-note anchors: resolving an anchor against the
// current elements/connections and producing the short labels shown in the
// Notes panel ("Claim 2", "Data 1 → Claim 2", "Detached — item deleted").
// No React, no Konva — unit-tested in Node.

import type { AnalyticNote, Connection, DiagramElement, NoteAnchor } from '../types';
import { isArgumentElement, isArrowAttachment, isInfoBoxElement, isSupportElement } from '../types';
import { deriveClaimLabel, getClaimRole } from './claimRoleDerivation';

export type ResolvedAnchor =
  | { status: 'general' }
  | { status: 'attached'; anchor: NoteAnchor; label: string }
  | { status: 'detached'; anchor: NoteAnchor };

export const DETACHED_LABEL = 'Detached — item deleted';

/** Collapse whitespace and cap at `max` characters (ellipsis counts as one). */
export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/** Short label for an element as shown in anchor chips. Claims use the live
 *  role derivation so a claim wired as data reads "Dataclaim 1" here too. */
export function describeElement(
  el: DiagramElement,
  connections: readonly Connection[],
  elementsById: ReadonlyMap<string, DiagramElement>,
): string {
  if (isArgumentElement(el)) {
    if (el.argumentType === 'claim') {
      return deriveClaimLabel(el.label, getClaimRole(el, connections, elementsById));
    }
    return el.label;
  }
  if (isSupportElement(el)) {
    const kind = el.supportType.charAt(0).toUpperCase() + el.supportType.slice(1);
    return el.content.trim() ? `${kind}: ${truncate(el.content, 24)}` : kind;
  }
  if (isInfoBoxElement(el)) return el.label;
  // Deprecated TeacherSupportElement
  return el.content.trim() ? truncate(el.content, 24) : 'Teacher support';
}

/** "Data 1 → Claim 2"; "Claim 1 –/– Claim 2" for counterclaims;
 *  "Warrant 1 → line" when the target is another connection. */
export function describeConnection(
  conn: Connection,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const from = byId.get(conn.from);
  const fromLabel = from ? describeElement(from, connections, byId) : '?';
  const joiner = conn.type === 'counterclaim' ? ' –/– ' : ' → ';
  if (isArrowAttachment(conn.to)) return `${fromLabel}${joiner}line`;
  const to = byId.get(conn.to);
  return `${fromLabel}${joiner}${to ? describeElement(to, connections, byId) : '?'}`;
}

/** Label for an anchor, or null when the anchored item no longer exists. */
export function describeAnchor(
  anchor: NoteAnchor,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): string | null {
  if (anchor.kind === 'element') {
    const el = elements.find((e) => e.id === anchor.id);
    if (!el) return null;
    return describeElement(el, connections, new Map(elements.map((e) => [e.id, e])));
  }
  const conn = connections.find((c) => c.id === anchor.id);
  if (!conn) return null;
  return describeConnection(conn, elements, connections);
}

export function resolveAnchor(
  note: AnalyticNote,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): ResolvedAnchor {
  if (!note.anchor) return { status: 'general' };
  const label = describeAnchor(note.anchor, elements, connections);
  if (label === null) return { status: 'detached', anchor: note.anchor };
  return { status: 'attached', anchor: note.anchor, label };
}

/** The anchor a new note would attach to: exactly one selected id that is an
 *  element or a connection. Nothing / multi-selection / unknown id → null. */
export function selectionAnchor(
  selectedIds: readonly string[],
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): NoteAnchor | null {
  if (selectedIds.length !== 1) return null;
  const id = selectedIds[0];
  if (elements.some((e) => e.id === id)) return { kind: 'element', id };
  if (connections.some((c) => c.id === id)) return { kind: 'connection', id };
  return null;
}

/** Number of notes per anchored item id — drives the canvas badges. */
export function countNotesByAnchor(notes: readonly AnalyticNote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (!n.anchor) continue;
    counts.set(n.anchor.id, (counts.get(n.anchor.id) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/noteAnchors.test.ts src/utils/relativeTime.test.ts`
Expected: PASS. If the `Warrantclaim 3 → line` expectation fails, check `deriveClaimLabel` — a claim whose outgoing edge is an arrow attachment derives the `warrant` role; the test is correct.

- [ ] **Step 6: Commit**

```bash
git add src/utils/noteAnchors.ts src/utils/noteAnchors.test.ts src/utils/relativeTime.ts src/utils/relativeTime.test.ts
git commit -m "feat(notes): anchor resolution/labels helpers; relativeTime accepts zoned ISO timestamps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Notes panel components

**Files:**
- Create: `src/components/Notes/NoteComposer.tsx`, `src/components/Notes/NoteRow.tsx`, `src/components/Notes/NotesPanel.tsx`, `src/components/Notes/index.ts`

**Interfaces:**
- Consumes: store (Task 1), `noteAnchors` (Task 3), `relativeTime`, `confirmAsync({ title, message, confirmLabel, cancelLabel, variant })` from `../../store/confirmStore`, `useAuthStore((s) => s.user?.displayName)`, `theme` tokens (`sidebar.*`, `input.*`, `button.primary.*`, `button.secondary.*`, `danger.fg`, `focus.ring`), lucide icons `PanelRightClose`, `StickyNote`, `Link2`, `Link2Off`, `Pencil`, `Trash2` (all present in lucide-react 0.562).
- Produces: `export function NotesPanel(): JSX.Element` (no props; reads/writes the store; closes itself via `setNotesPanelOpen(false)`).

No unit tests (`.tsx`, Node env). Verified by `npx tsc -b`, lint, and the Task 7 walkthrough.

- [ ] **Step 1: `NoteComposer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { theme } from '../../utils/theme';
import type { NoteAnchor } from '../../types';

interface NoteComposerProps {
  /** Anchor a new note would attach to (the current single selection), or null. */
  selection: NoteAnchor | null;
  /** Human label for `selection` ("Claim 2"); null when there is no selection. */
  selectionLabel: string | null;
  onAdd: (text: string, anchor: NoteAnchor | undefined) => void;
}

export function NoteComposer({ selection, selectionLabel, onAdd }: NoteComposerProps) {
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);

  // A new selection resets the default back to "attach to it".
  const selectionId = selection?.id ?? null;
  useEffect(() => {
    setAttach(true);
  }, [selectionId]);

  const canAdd = text.trim().length > 0;
  const willAttach = attach && selection !== null;

  const submit = () => {
    if (!canAdd) return;
    onAdd(text.trim(), willAttach && selection ? selection : undefined);
    setText('');
  };

  return (
    <div className="px-4 py-3 border-b flex flex-col gap-2" style={{ borderColor: theme.sidebar.border }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder="Add an analytic note…"
        aria-label="New analytic note"
        className="w-full text-sm rounded-md px-2.5 py-2 resize-y border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.input.bg,
          borderColor: theme.input.border,
          color: theme.input.text,
          outlineColor: theme.focus.ring,
        }}
      />
      <div className="flex items-center justify-between gap-2">
        {selection && selectionLabel ? (
          <button
            type="button"
            onClick={() => setAttach((v) => !v)}
            aria-pressed={willAttach}
            title={willAttach ? 'Click to make this a general note' : 'Click to attach to the selection'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border max-w-[60%]"
            style={{
              borderColor: willAttach ? theme.sidebar.accent : theme.sidebar.border,
              backgroundColor: willAttach ? theme.sidebar.surfaceActive : theme.sidebar.surface,
              color: theme.sidebar.text,
            }}
          >
            {willAttach ? <Link2 size={12} /> : <Link2Off size={12} />}
            <span className="truncate">{willAttach ? `Attach to ${selectionLabel}` : 'General note'}</span>
          </button>
        ) : (
          <span className="text-xs" style={{ color: theme.sidebar.textSecondary }}>General note</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          title="Add note (⌘/Ctrl+Enter)"
          className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          Add note
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `NoteRow.tsx`**

```tsx
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';
import { DETACHED_LABEL, type ResolvedAnchor } from '../../utils/noteAnchors';
import type { AnalyticNote } from '../../types';

interface NoteRowProps {
  note: AnalyticNote;
  resolved: ResolvedAnchor;
  onSelectAnchor: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}

export function NoteRow({ note, resolved, onSelectAnchor, onSave, onDelete }: NoteRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const startEdit = () => {
    setDraft(note.text);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    const t = draft.trim();
    if (t && t !== note.text) onSave(t);
    setEditing(false);
  };

  const meta = [note.author, `${relativeTime(note.createdAt)}${note.updatedAt ? ' · edited' : ''}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="group px-4 py-3 border-b"
      style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.surface }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        {resolved.status === 'attached' ? (
          <button
            type="button"
            onClick={onSelectAnchor}
            title="Select on canvas"
            className="text-[11px] font-medium px-1.5 py-0.5 rounded truncate max-w-[70%]"
            style={{ backgroundColor: theme.sidebar.surfaceActive, color: theme.sidebar.text }}
          >
            {resolved.label}
          </button>
        ) : (
          <span className="text-[11px] italic truncate" style={{ color: theme.sidebar.textSecondary }}>
            {resolved.status === 'detached' ? DETACHED_LABEL : 'General'}
          </span>
        )}
        {!editing && (
          <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button type="button" onClick={startEdit} aria-label="Edit note" className="p-1 rounded" style={{ color: theme.sidebar.textSecondary }}>
              <Pencil size={13} />
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete note" className="p-1 rounded" style={{ color: theme.danger.fg }}>
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            rows={3}
            aria-label="Edit note text"
            className="w-full text-sm rounded-md px-2.5 py-2 resize-y border"
            style={{ backgroundColor: theme.input.bg, borderColor: theme.input.border, color: theme.input.text }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="px-2.5 py-1 text-xs rounded-md border"
              style={{ borderColor: theme.button.secondary.border, color: theme.button.secondary.text, backgroundColor: theme.button.secondary.bg }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="px-2.5 py-1 text-xs rounded-md"
              style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words" style={{ color: theme.sidebar.text }}>
          {note.text}
        </p>
      )}

      <div className="text-[11px] mt-1" style={{ color: theme.sidebar.textSecondary }}>{meta}</div>
    </div>
  );
}
```

- [ ] **Step 3: `NotesPanel.tsx`**

```tsx
import { useMemo } from 'react';
import { PanelRightClose, StickyNote } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { useAuthStore } from '../../api/authStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { describeAnchor, resolveAnchor, selectionAnchor } from '../../utils/noteAnchors';
import { NoteComposer } from './NoteComposer';
import { NoteRow } from './NoteRow';
import type { AnalyticNote, NoteAnchor } from '../../types';

/** Right-side panel (mirrors HistoryPanel's conventions) for analytic notes.
 *  Notes live in diagramStore.notes and save with the diagram. App renders
 *  this inside the wrapper that goes `inert` during version preview, so the
 *  panel is read-only there without any extra handling here. */
export function NotesPanel() {
  const notes = useDiagramStore((s) => s.notes);
  const elements = useDiagramStore((s) => s.elements);
  const connections = useDiagramStore((s) => s.connections);
  const selectedIds = useDiagramStore((s) => s.selectedIds);
  const addNote = useDiagramStore((s) => s.addNote);
  const updateNoteText = useDiagramStore((s) => s.updateNoteText);
  const removeNote = useDiagramStore((s) => s.removeNote);
  const setSelectedIds = useDiagramStore((s) => s.setSelectedIds);
  const setNotesPanelOpen = useDiagramStore((s) => s.setNotesPanelOpen);
  const displayName = useAuthStore((s) => s.user?.displayName);

  const selection = useMemo(
    () => selectionAnchor(selectedIds, elements, connections),
    [selectedIds, elements, connections],
  );
  const selectionLabel = useMemo(
    () => (selection ? describeAnchor(selection, elements, connections) : null),
    [selection, elements, connections],
  );

  // Newest first; the selection's own notes are pulled into a leading section.
  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes],
  );
  const onSelection = selection ? sorted.filter((n) => n.anchor?.id === selection.id) : [];
  const others = selection ? sorted.filter((n) => n.anchor?.id !== selection.id) : sorted;

  const handleAdd = (text: string, anchor: NoteAnchor | undefined) => {
    addNote({ text, anchor, author: displayName ?? undefined });
  };

  const handleDelete = async (note: AnalyticNote) => {
    const ok = await confirmAsync({
      title: 'Delete note?',
      message: 'This note will be removed from the diagram. Deleting a note cannot be undone.',
      confirmLabel: 'Delete note',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (ok) removeNote(note.id);
  };

  const renderRow = (note: AnalyticNote) => (
    <NoteRow
      key={note.id}
      note={note}
      resolved={resolveAnchor(note, elements, connections)}
      onSelectAnchor={() => {
        if (note.anchor) setSelectedIds([note.anchor.id]);
      }}
      onSave={(text) => updateNoteText(note.id, text)}
      onDelete={() => void handleDelete(note)}
    />
  );

  const sectionHeading = (label: string) => (
    <div
      className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: theme.sidebar.textSecondary }}
    >
      {label}
    </div>
  );

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{ background: theme.sidebar.bgGradient, borderColor: theme.sidebar.border }}
    >
      <div
        className="px-5 py-3 border-b flex items-center justify-between gap-2"
        style={{ borderColor: theme.sidebar.border }}
      >
        <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          Notes
          {notes.length > 0 && (
            <span className="ml-2 font-normal" style={{ color: theme.sidebar.textSecondary }}>
              {notes.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setNotesPanelOpen(false)}
          className="p-1 rounded transition-colors duration-150"
          title="Hide notes panel"
          aria-label="Hide notes panel"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <NoteComposer selection={selection} selectionLabel={selectionLabel} onAdd={handleAdd} />

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-3">
            <StickyNote size={28} aria-hidden="true" style={{ color: theme.sidebar.muted }} />
            <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.textSecondary }}>
              No notes yet. Notes save with the diagram and never appear in exports.
            </p>
          </div>
        )}

        {onSelection.length > 0 && (
          <>
            {sectionHeading(`On ${selectionLabel ?? 'selection'}`)}
            {onSelection.map(renderRow)}
          </>
        )}

        {others.length > 0 && (
          <>
            {onSelection.length > 0 && sectionHeading('All notes')}
            {others.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `index.ts`**

```ts
export { NotesPanel } from './NotesPanel';
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc -b && npm run lint 2>&1 | tail -3`
Expected: tsc clean; lint count unchanged from baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/Notes
git commit -m "feat(notes): Notes panel — composer with attach-to-selection, list, inline edit, confirmed delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Toolbar toggle, `N` shortcut, panel mount

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx` (lucide import lines 3–16; store destructure ~line 53–57; View group ~line 318–331)
- Modify: `src/App.tsx` (imports ~line 13; store reads ~line 88–101; keyboard handler after the `F` block ~line 410–417; canvas row after `<Canvas …/>` ~line 565–569)

**Interfaces:**
- Consumes: `NotesPanel` (Task 4); `notesPanelOpen`, `setNotesPanelOpen` (Task 1).

- [ ] **Step 1: Toolbar button**

Add `StickyNote,` to the lucide import list. Add `notesPanelOpen, setNotesPanelOpen,` to the `const { … } = useDiagramStore();` destructure. In the `View` `ToolbarGroup`, after the legend `IconButton`, add:

```tsx
            <IconButton
              onClick={() => setNotesPanelOpen(!notesPanelOpen)}
              icon={StickyNote}
              tooltip="Notes"
              shortcut="N"
              isActive={notesPanelOpen}
            />
```

- [ ] **Step 2: App — import and read the flag**

Add `import { NotesPanel } from './components/Notes';` next to the other component imports. Add a selector after the `useDiagramStore()` destructure block:

```ts
  const notesPanelOpen = useDiagramStore((s) => s.notesPanelOpen);
```

- [ ] **Step 3: App — mount the panel inside the inert wrapper**

Directly after `<Canvas connectMode={connectMode} onConnectionStart={handleConnectionStart} connectingFrom={connectingFrom} />` and before the transcript `<div className={fullScreen ? 'hidden' : 'contents'}>`, add:

```tsx
              {/* Notes side panel — inside the inert wrapper on purpose: notes
                  are diagram content, so they're read-only during preview. */}
              <div className={fullScreen ? 'hidden' : 'contents'}>
                {notesPanelOpen && <NotesPanel />}
              </div>
```

- [ ] **Step 4: App — `N` shortcut**

In the keyboard handler, after the full-screen `F` block (which ends with `return;`) and before `// 'C' for connect mode`, add:

```ts
      // Notes panel toggle: N (no modifier). Same guards as F so ⌘N / Ctrl+N
      // (browser new window) and Shift/Alt combos pass through untouched.
      if ((e.key === 'n' || e.key === 'N') && !isMod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const d = useDiagramStore.getState();
        d.setNotesPanelOpen(!d.notesPanelOpen);
        return;
      }
```

(No dependency-array change: it reads the store via `getState()`.)

- [ ] **Step 5: Typecheck, lint, commit**

Run: `npx tsc -b && npm run lint 2>&1 | tail -3`

```bash
git add src/components/Toolbar/Toolbar.tsx src/App.tsx
git commit -m "feat(notes): toolbar Notes toggle, N shortcut, panel mounted beside the canvas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Canvas badges, hidden during PNG/PDF snapshots

**Files:**
- Create: `src/utils/exportHideNodes.ts`, `src/utils/exportHideNodes.test.ts`
- Create: `src/components/Canvas/shapes/NoteBadge.tsx`
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx` (props ~line 13–24; three `return (<Group …>…</Group>)` branches: attached qualifier ~line 105–149, cloud ~line 156–232, standard ~line 245–372)
- Modify: `src/components/Canvas/shapes/SupportShape.tsx` (props ~line 7–18; `</Group>` ~line 207), `TeacherSupportShape.tsx` (props ~line 7–17; `</Group>` ~line 195), `InfoBoxShape.tsx` (props ~line 5–15; `</Group>` ~line 95)
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (props; after the slash block from the counterclaim plan)
- Modify: `src/components/Canvas/Canvas.tsx` (imports line 1 and store hooks ~line 113–142; shape/arrow props ~line 1052–1131)
- Modify: `src/components/Toolbar/Toolbar.tsx` (`handleExportPNG` ~line 133–157)
- Modify: `src/utils/pdfExport.ts:32-39`

**Interfaces:**
- Produces: `NOTE_BADGE_NAME = 'note-badge'`, `NOTE_BADGE_SELECTOR = '.note-badge'`, `withNodesHidden<T>(stage: HideableStage, selector: string, fn: () => T): T`; `NoteBadge({ x, y, count, onClick? })`; every shape and `ConnectionArrow` accept `noteCount?: number` and `onNoteBadgeClick?: () => void`.

- [ ] **Step 1: Write the failing test for the hide helper**

Create `src/utils/exportHideNodes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NOTE_BADGE_SELECTOR, withNodesHidden, type HideableNode, type HideableStage } from './exportHideNodes';

function fakeNode(initial: boolean): HideableNode & { value: boolean } {
  const node = {
    value: initial,
    visible(v?: boolean) {
      if (v === undefined) return node.value;
      node.value = v;
      return node;
    },
  };
  return node as unknown as HideableNode & { value: boolean };
}

describe('withNodesHidden', () => {
  it('hides matching nodes while fn runs and restores prior visibility after', () => {
    const shown = fakeNode(true);
    const alreadyHidden = fakeNode(false);
    let draws = 0;
    const stage: HideableStage = { find: () => [shown, alreadyHidden], draw: () => { draws += 1; } };
    const seen: boolean[] = [];
    const result = withNodesHidden(stage, NOTE_BADGE_SELECTOR, () => {
      seen.push(shown.value, alreadyHidden.value);
      return 'png';
    });
    expect(result).toBe('png');
    expect(seen).toEqual([false, false]);
    expect(shown.value).toBe(true);
    expect(alreadyHidden.value).toBe(false);
    expect(draws).toBe(2);
  });

  it('restores visibility even when fn throws', () => {
    const shown = fakeNode(true);
    const stage: HideableStage = { find: () => [shown], draw: () => undefined };
    expect(() => withNodesHidden(stage, NOTE_BADGE_SELECTOR, () => { throw new Error('boom'); })).toThrow('boom');
    expect(shown.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/exportHideNodes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `exportHideNodes.ts`**

```ts
// Keeps canvas-only UI (note badges) out of PNG/PDF stage snapshots. Konva's
// stage.toDataURL renders whatever is visible, so we hide the badge nodes,
// take the snapshot, then restore. Typed against a minimal surface so the
// helper is unit-testable without Konva.

/** Konva node name for analytic-note badges; `stage.find(NOTE_BADGE_SELECTOR)` finds them all. */
export const NOTE_BADGE_NAME = 'note-badge';
export const NOTE_BADGE_SELECTOR = `.${NOTE_BADGE_NAME}`;

export interface HideableNode {
  visible(): boolean;
  visible(value: boolean): unknown;
}

export interface HideableStage {
  find(selector: string): HideableNode[];
  draw(): unknown;
}

export function withNodesHidden<T>(stage: HideableStage, selector: string, fn: () => T): T {
  const nodes = stage.find(selector);
  const previous = nodes.map((n) => n.visible());
  nodes.forEach((n) => n.visible(false));
  stage.draw();
  try {
    return fn();
  } finally {
    nodes.forEach((n, i) => n.visible(previous[i]));
    stage.draw();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/exportHideNodes.test.ts`
Expected: PASS.

- [ ] **Step 5: `NoteBadge.tsx`**

Create `src/components/Canvas/shapes/NoteBadge.tsx`:

```tsx
import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { NOTE_BADGE_NAME } from '../../../utils/exportHideNodes';

interface NoteBadgeProps {
  x: number;
  y: number;
  count: number;
  onClick?: () => void;
}

/** Small "has analytic notes" marker. Rendered inside a shape's Group so it
 *  follows drags; named `note-badge` so exports can hide it
 *  (utils/exportHideNodes). Never emitted by svgExport. */
export function NoteBadge({ x, y, count, onClick }: NoteBadgeProps) {
  const handle = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onClick?.();
  };
  const width = count > 1 ? 18 : 14;
  return (
    <Group x={x} y={y} name={NOTE_BADGE_NAME} onClick={handle} onTap={handle}>
      <Rect
        width={width}
        height={14}
        fill="#F5D76E"
        stroke="#8a6f47"
        strokeWidth={1}
        cornerRadius={3}
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={0.2}
      />
      <Text
        x={0}
        y={2}
        width={width}
        align="center"
        text={count > 1 ? String(count) : '≡'}
        fontSize={9}
        fontStyle="bold"
        fill="#2a3324"
        listening={false}
      />
    </Group>
  );
}
```

- [ ] **Step 6: Shapes accept `noteCount` / `onNoteBadgeClick` and render the badge**

In **each** of `ArgumentShape.tsx`, `SupportShape.tsx`, `TeacherSupportShape.tsx`, `InfoBoxShape.tsx`:

1. Add `import { NoteBadge } from './NoteBadge';`
2. Add to the props interface:

```ts
  /** Number of analytic notes anchored to this element (badge hidden when 0/undefined). */
  noteCount?: number;
  onNoteBadgeClick?: () => void;
```

3. Add `noteCount,` and `onNoteBadgeClick,` to the destructured props.
4. Insert as the LAST child before each returned `</Group>` (ArgumentShape has three return branches — attached qualifier, cloud, standard — add it to all three; in the attached-qualifier branch use `qWidth` instead of `size.width`):

```tsx
      {(noteCount ?? 0) > 0 && (
        <NoteBadge x={size.width - 8} y={-6} count={noteCount ?? 0} onClick={onNoteBadgeClick} />
      )}
```

In **`Arrow.tsx`**: add `import { NoteBadge } from './NoteBadge';`; add the same two props to `ArrowProps` and the destructure; after the counterclaim slash block (and before the connect-mode hover `Circle`), add:

```tsx
      {/* Analytic-note badge just above the polyline midpoint. */}
      {(noteCount ?? 0) > 0 && (
        <NoteBadge x={midPoint.x - 7} y={midPoint.y - 24} count={noteCount ?? 0} onClick={onNoteBadgeClick} />
      )}
```

- [ ] **Step 7: Canvas passes counts and handles badge clicks**

`src/components/Canvas/Canvas.tsx`:
- Line 1: `import { useRef, useCallback, useEffect, useMemo, useState } from 'react';`
- Add `import { countNotesByAnchor } from '../../utils/noteAnchors';`
- After the `const { … } = useDiagramStore();` destructure add:

```ts
  const notes = useDiagramStore((s) => s.notes);
  const setNotesPanelOpen = useDiagramStore((s) => s.setNotesPanelOpen);
  const noteCounts = useMemo(() => countNotesByAnchor(notes), [notes]);
  const handleNoteBadgeClick = useCallback(
    (id: string) => {
      setSelectedIds([id]);
      setNotesPanelOpen(true);
    },
    [setSelectedIds, setNotesPanelOpen],
  );
```

- On `<ConnectionArrow …>` add:

```tsx
              noteCount={noteCounts.get(connection.id)}
              onNoteBadgeClick={() => handleNoteBadgeClick(connection.id)}
```

- On each of `<ArgumentShape>`, `<SupportShape>`, `<TeacherSupportShape>`, `<InfoBoxShape>` add:

```tsx
                  noteCount={noteCounts.get(element.id)}
                  onNoteBadgeClick={() => handleNoteBadgeClick(element.id)}
```

- [ ] **Step 8: Hide badges in PNG and PDF snapshots**

`src/components/Toolbar/Toolbar.tsx`: add `import { NOTE_BADGE_SELECTOR, withNodesHidden } from '../../utils/exportHideNodes';`. In `handleExportPNG` replace the `const dataURL = stage.toDataURL({ … });` statement with:

```ts
    const dataURL = withNodesHidden(stage, NOTE_BADGE_SELECTOR, () =>
      stage.toDataURL({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        pixelRatio: 2,
        mimeType: 'image/png',
      }),
    );
```

`src/utils/pdfExport.ts`: add `import { NOTE_BADGE_SELECTOR, withNodesHidden } from './exportHideNodes';` and wrap its `stage.toDataURL({ … })` the same way:

```ts
  const dataURL = withNodesHidden(stage, NOTE_BADGE_SELECTOR, () =>
    stage.toDataURL({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio: quality,
      mimeType: 'image/png',
    }),
  );
```

- [ ] **Step 9: Typecheck, lint, test, commit**

Run: `npx tsc -b && npm run lint 2>&1 | tail -3 && npm test`
Expected: tsc clean (if `Konva.Stage` is not assignable to `HideableStage`, cast at the call site: `withNodesHidden(stage as unknown as HideableStage, …)` and note it in the commit); lint unchanged; all tests pass.

```bash
git add src/utils/exportHideNodes.ts src/utils/exportHideNodes.test.ts src/components/Canvas/shapes/NoteBadge.tsx src/components/Canvas/shapes/ArgumentShape.tsx src/components/Canvas/shapes/SupportShape.tsx src/components/Canvas/shapes/TeacherSupportShape.tsx src/components/Canvas/shapes/InfoBoxShape.tsx src/components/Canvas/shapes/Arrow.tsx src/components/Canvas/Canvas.tsx src/components/Toolbar/Toolbar.tsx src/utils/pdfExport.ts
git commit -m "feat(notes): canvas note badges (click → select + open panel), hidden in PNG/PDF snapshots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Docs, full verification, browser walkthrough

**Files:**
- Modify: `docs/REQUIREMENTS.md` (§6.1 after the JSON block ~line 297; Appendix C table ~line 455–468)

- [ ] **Step 1: Document the save-file field and the shortcut**

After the §6.1 JSON code block (before `### 6.2 Export Formats`) add:

```markdown
**Since 1.7 — `notes`:** an optional top-level array of analytic notes `{ id, text, author?, createdAt, updatedAt?, anchor?: { kind: 'element' | 'connection', id } }`. Notes are researcher memos: they save with the diagram (and with every library version) but are never drawn in PNG/SVG/PDF/DiagramMix exports. A note whose anchored item was deleted is kept and shown as detached.
```

In Appendix C add a row after `Connect mode | C`:

```markdown
| Toggle notes panel | N |
```

- [ ] **Step 2: Full verification recipe**

```bash
npm run lint 2>&1 | tail -3      # problem count equals the baseline (≈17)
npx tsc -b
npm test
npm run build
```

Expected: all clean; test count = previous total + the new suites (store notes, saveDiagram, autosave, dirtyTracking, relativeTime, noteAnchors, exportHideNodes).

- [ ] **Step 3: Browser walkthrough (Playwright MCP or Claude for Chrome)**

`npm run dev`, then at `http://localhost:5173`:

1. Press `N` → Notes panel opens with the empty state; press `N` again → closes; toolbar Notes button toggles the same and shows active while open.
2. With nothing selected, type a note, press `⌘/Ctrl+Enter` → it appears with `General`, time `just now`, no author (signed out).
3. Drop a Claim, select it → composer chip reads `Attach to Claim 1`; add a note → row chip `Claim 1`; a yellow `≡` badge appears at the claim's top-right; a second note → badge shows `2`; section `On Claim 1` appears above `All notes`.
4. Click the `Claim 1` chip on a note row → the claim is selected on canvas. Deselect (Esc), close the panel, click the badge → claim selected AND panel opens.
5. Connect the claim to another element, select the line, add a note → chip reads e.g. `Claim 1 → Data 1`; badge sits above the line's midpoint.
6. Hover a row → Edit; change the text, `⌘/Ctrl+Enter` → `· edited` appears. Hover → Delete → confirm dialog `Delete note?` → note removed.
7. Delete Claim 1 → its notes remain, chip reads `Detached — item deleted`; `⌘Z` → chip returns to `Claim 1`.
8. Export PNG and PDF → no badges in the images. Export SVG → open it; no `note-badge` and no note text.
9. Save `.json` → file contains `"notes": [...]` and `"version": "1.7"`; reload page, open file → notes and badges are back.
10. Wait 60 s (or shorten `AUTO_SAVE_INTERVAL` locally), reload → Recovery prompt → Recover → notes present.
11. Signed in (dev server on 8787): open a library diagram, add a note → header status flips to unsaved; save → reopen from the Workspace → note present with your display name as author. Open History → preview an older version → the Notes panel is inert (cannot type); Back to current restores.

Take screenshots of steps 3, 5 and 8 for the review record.

- [ ] **Step 4: Commit**

```bash
git add docs/REQUIREMENTS.md
git commit -m "docs(requirements): analytic notes save-file field and N shortcut

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then finish the branch with `superpowers:finishing-a-development-branch` (Jennifer's standing default: merge to `main` **and** push in one motion; deploying to jenkleiman.com stays a separate decision).
