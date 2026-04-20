# Transcript Ingester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transcript ingester to the ETD editor: user loads a `.txt` transcript (optionally pre-annotated with `[contributor|objectType]` tags), a right-column panel lists each line as a draggable card, and dragging a card onto the canvas creates an element with the utterance text as content and the speaker/timestamp as attribution.

**Architecture:** Pure-function parser (`src/utils/transcriptParser.ts`) turns file text into a `Transcript` object. Zustand store holds that object alongside `elements` and `connections`. A new `TranscriptPanel` on the right side renders each line with contributor/objectType dropdowns and acts as an HTML5 drag source. The Canvas container is extended with `onDrop` / `onDragOver` handlers that create a new argument or support element at the drop position. "Used" state on panel items is derived at render time from elements whose `sourceTranscript` back-reference points at that line.

**Tech Stack:** React 19, TypeScript, Zustand (existing store), zundo (untouched), Tailwind + inline `theme` styles, lucide-react icons, HTML5 drag-and-drop API. No test framework is installed in this repo (per `package.json`) and per `CLAUDE.md` the project relies on `npm run typecheck`, `npm run lint`, and live browser verification via Claude for Chrome. This plan follows that pattern — no unit-test tasks; each task ends with typecheck + commit, and Task 10 covers live browser verification.

---

## File Structure

**New files:**
- `src/types/transcript.ts` — `Transcript`, `TranscriptLine` interfaces
- `src/utils/transcriptParser.ts` — `parseTranscript(text, filename) -> Transcript`
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — right-column container
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — one draggable card
- `src/components/TranscriptPanel/index.ts` — barrel

**Modified files:**
- `src/types/elements.ts` — add optional `sourceTranscript` on `BaseElement`
- `src/types/index.ts` — re-export transcript types
- `src/store/diagramStore.ts` — add transcript state + actions; extend `loadDiagram` signature; preserve transcript across `clearDiagram`
- `src/components/Toolbar/Toolbar.tsx` — include transcript in `handleSave`; pass transcript through on load; add two new toolbar buttons (load transcript, toggle panel)
- `src/App.tsx` — include transcript in the keyboard-shortcut `handleSave`; pass transcript through in `handleFileLoad`; manage panel visibility state; mount `TranscriptPanel`; orphan-confirm on toolbar-initiated re-load
- `src/components/Canvas/Canvas.tsx` — add `onDrop` / `onDragOver` on the container div; convert drop to canvas coords and create element

---

## Task 1: Types — transcript types + `sourceTranscript` on `BaseElement`

**Files:**
- Create: `src/types/transcript.ts`
- Modify: `src/types/elements.ts` (add field)
- Modify: `src/types/index.ts` (add re-export)

- [ ] **Step 1: Create `src/types/transcript.ts`**

```typescript
// Transcript types for the ingester panel
import type { ContributorType, ArgumentType, SupportType } from './elements';

// Object type on a transcript line is either an argument type or a support type
export type TranscriptObjectType = ArgumentType | SupportType;

export interface TranscriptLine {
  index: number;              // 0-based position within the transcript; stable
  timestamp: string;          // preserved verbatim (e.g. "55:07", "1:05:22.3")
  speaker: string;            // preserved verbatim (e.g. "Teacher-CurlyHair")
  text: string;               // the utterance body, trimmed
  contributor: ContributorType | null;
  objectType: TranscriptObjectType | null;
}

export interface Transcript {
  id: string;                 // uuid, stable across save/load
  filename: string;           // display only
  lines: TranscriptLine[];
  parseWarnings: string[];    // human-readable: "Line 12 skipped: could not parse timestamp"
}
```

- [ ] **Step 2: Add `sourceTranscript` to `BaseElement`**

In `src/types/elements.ts`, modify the `BaseElement` interface to add one optional field at the end:

```typescript
export interface BaseElement {
  id: string;
  position: Position;
  size: Size;
  content: string;
  attribution?: Attribution;
  image?: string | null;
  imageSettings?: ImageSettings;
  sourceTranscript?: { transcriptId: string; lineIndex: number };
}
```

- [ ] **Step 3: Re-export transcript types**

In `src/types/index.ts`, add one line:

```typescript
export * from './elements';
export * from './connections';
export * from './transcript';
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. The new optional field is backwards-compatible; the new type file is self-contained.

- [ ] **Step 5: Commit**

```bash
git add src/types/transcript.ts src/types/elements.ts src/types/index.ts
git commit -m "Add transcript types and sourceTranscript back-reference on elements"
```

---

## Task 2: Transcript parser

**Files:**
- Create: `src/utils/transcriptParser.ts`

- [ ] **Step 1: Create `src/utils/transcriptParser.ts`**

```typescript
// Parses a plain-text transcript (optionally with inline [contributor|objectType] tags)
// into a Transcript object. Pure function — no side effects.

import type { Transcript, TranscriptLine, TranscriptObjectType } from '../types/transcript';
import type { ContributorType, ArgumentType, SupportType } from '../types/elements';

const CONTRIBUTOR_VALUES: ContributorType[] = ['given', 'student', 'teacher', 'joint', 'implicit'];
const ARGUMENT_VALUES: ArgumentType[] = ['data', 'claim', 'warrant', 'backing', 'qualifier', 'rebuttal'];
const SUPPORT_VALUES: SupportType[] = ['action', 'question', 'other'];

// Matches the whole line shape:
//   <timestamp> <speaker>[ <tag>]: <text>
// Timestamp: MM:SS, MM:SS.s, H:MM:SS, H:MM:SS.s
// Speaker: anything up to '[' or ':'; trimmed
// Tag (optional): [contributor|objectType], either side may be empty
// Text: everything after the final colon
const LINE_RE =
  /^\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+([^[:]+?)\s*(?:\[([^|\]]*)\|([^|\]]*)\])?\s*:\s*(.+?)\s*$/;

function normalizeContributor(raw: string | undefined): ContributorType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  return (CONTRIBUTOR_VALUES as string[]).includes(lower) ? (lower as ContributorType) : null;
}

function normalizeObjectType(raw: string | undefined): TranscriptObjectType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if ((ARGUMENT_VALUES as string[]).includes(lower)) return lower as ArgumentType;
  if ((SUPPORT_VALUES as string[]).includes(lower)) return lower as SupportType;
  return null;
}

// Auto-infer contributor from the speaker label.
// Rules (case-insensitive):
//   starts with "Teacher"  -> "teacher"
//   starts with "Student"  -> "student" (also matches "Students", "Students (chorus)")
//   otherwise              -> null
// NEVER infers joint/given/implicit.
function inferContributor(speaker: string): ContributorType | null {
  const lower = speaker.trim().toLowerCase();
  if (lower.startsWith('teacher')) return 'teacher';
  if (lower.startsWith('student')) return 'student';
  return null;
}

function generateTranscriptId(): string {
  // crypto.randomUUID is available in all modern browsers and in Node 19+.
  return crypto.randomUUID();
}

export function parseTranscript(text: string, filename: string): Transcript {
  const rawLines = text.split(/\r?\n/);
  const lines: TranscriptLine[] = [];
  const parseWarnings: string[] = [];
  let index = 0;

  rawLines.forEach((raw, lineNumber) => {
    const trimmed = raw.trim();
    if (trimmed === '') return; // blank lines skipped silently

    const match = raw.match(LINE_RE);
    if (!match) {
      parseWarnings.push(`Line ${lineNumber + 1} skipped: did not match transcript grammar.`);
      return;
    }

    const [, timestamp, speakerRaw, contribRaw, typeRaw, textRaw] = match;
    const speaker = speakerRaw.trim();

    // Tag values: if present but invalid, warn and treat as missing.
    const tagWasPresent = contribRaw !== undefined || typeRaw !== undefined;
    const contribFromTag = normalizeContributor(contribRaw);
    const typeFromTag = normalizeObjectType(typeRaw);

    if (tagWasPresent) {
      if (contribRaw && contribRaw.trim() !== '' && !contribFromTag) {
        parseWarnings.push(`Line ${lineNumber + 1}: unrecognized contributor "${contribRaw.trim()}"; treated as unset.`);
      }
      if (typeRaw && typeRaw.trim() !== '' && !typeFromTag) {
        parseWarnings.push(`Line ${lineNumber + 1}: unrecognized object type "${typeRaw.trim()}"; treated as unset.`);
      }
    }

    // Tag takes precedence over inference; inference fills in when tag is missing/blank.
    const contributor = contribFromTag ?? inferContributor(speaker);

    lines.push({
      index: index++,
      timestamp,
      speaker,
      text: textRaw.trim(),
      contributor,
      objectType: typeFromTag,
    });
  });

  return {
    id: generateTranscriptId(),
    filename,
    lines,
    parseWarnings,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/transcriptParser.ts
git commit -m "Add transcript parser for plain-text transcripts with inline tags"
```

---

## Task 3: Zustand store — transcript state and actions

**Files:**
- Modify: `src/store/diagramStore.ts`

- [ ] **Step 1: Extend the store imports**

At the top of `src/store/diagramStore.ts`, add `Transcript` and `TranscriptLine` to the existing type import block:

```typescript
import type {
  DiagramElement, Connection, Position, Size, ContributorType,
  ImageSettings, SupportType, SupportSubtype, ArgumentType,
  SupportContributor, ArgumentElement, SupportElement,
  Transcript, TranscriptLine,
} from '../types';
```

- [ ] **Step 2: Add transcript fields to the `DiagramState` interface**

Add after `legendConfig: LegendConfig;` and before `// Actions - Elements`:

```typescript
  // Transcript
  transcript: Transcript | null;
```

Add new action signatures in the `// Actions - File operations` group, replacing the existing `loadDiagram` signature. The updated group should read:

```typescript
  // Actions - Transcript
  setTranscript: (transcript: Transcript | null) => void;
  updateTranscriptLine: (lineIndex: number, patch: Partial<TranscriptLine>) => void;

  // Actions - File operations
  loadDiagram: (
    elements: DiagramElement[],
    connections: Connection[],
    name?: string,
    transcript?: Transcript | null,
  ) => void;
  clearDiagram: () => void;
```

- [ ] **Step 3: Add the initial `transcript: null` to the store's initial state**

Find the object literal starting `diagramName: 'Untitled Diagram',` inside `create<DiagramState>()(temporal((set, get) => ({...`, and add `transcript: null,` immediately after `legendConfig: { ... },`:

```typescript
      legendConfig: {
        visible: false,
        position: { x: 50, y: 50 },
      },
      transcript: null,
```

- [ ] **Step 4: Implement the two transcript actions**

Add these two actions anywhere alongside the existing actions (a natural spot is immediately after `moveLegend`):

```typescript
      setTranscript: (transcript) => set({ transcript }),

      updateTranscriptLine: (lineIndex, patch) =>
        set((state) => {
          if (!state.transcript) return state;
          return {
            transcript: {
              ...state.transcript,
              lines: state.transcript.lines.map((line) =>
                line.index === lineIndex ? { ...line, ...patch } : line,
              ),
            },
          };
        }),
```

- [ ] **Step 5: Update `loadDiagram` to accept and store transcript**

Replace the existing `loadDiagram` implementation with:

```typescript
      loadDiagram: (elements, connections, name, transcript) => {
        // Auto-size all elements on load to ensure content fits
        const sizedElements = elements.map((el) => {
          const autoSize = getAutoSize(el);
          return { ...el, size: autoSize };
        });
        set({
          elements: sizedElements,
          connections,
          selectedIds: [],
          diagramName: name || 'Untitled Diagram',
          transcript: transcript ?? null,
        });
      },
```

- [ ] **Step 6: Preserve transcript across `clearDiagram`**

Per the spec, "Clear diagram" clears elements + connections but keeps the transcript (user may keep dragging from it into a fresh canvas). Replace the existing `clearDiagram` with:

```typescript
      clearDiagram: () =>
        set((state) => ({
          diagramName: 'Untitled Diagram',
          elements: [],
          connections: [],
          selectedIds: [],
          zoom: 1,
          panX: 0,
          panY: 0,
          legendConfig: { visible: false, position: { x: 50, y: 50 } },
          transcript: state.transcript, // preserved intentionally
        })),
```

(The explicit passthrough keeps the intent obvious to a future reader.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/store/diagramStore.ts
git commit -m "Add transcript state and actions to diagram store"
```

---

## Task 4: Save/load JSON persistence of transcript

The app has TWO places that serialize the diagram to JSON: `Toolbar.tsx` (button) and `App.tsx` (Ctrl+S keyboard shortcut). Both must include `transcript`. Similarly, both load paths must pass transcript through.

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Bump the save version string and include transcript in Toolbar save**

In `src/components/Toolbar/Toolbar.tsx`, replace the `handleSave` body with:

```typescript
  // Save diagram as JSON
  const handleSave = () => {
    const data = {
      version: '1.1',
      name: diagramName,
      elements,
      connections,
      transcript,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toFilename(diagramName)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
```

And widen the store destructuring at the top of the `Toolbar` component to also pull `transcript`:

```typescript
  const {
    zoom, setZoom, elements, connections, loadDiagram, clearDiagram,
    toggleLegend, legendConfig, diagramName, setDiagramName,
    transcript,
  } = useDiagramStore();
```

- [ ] **Step 2: Pass transcript through in Toolbar load**

In `handleFileChange`, update the `.json` branch to pass `data.transcript` (may be undefined for old saves; the store normalizes to null). Replace:

```typescript
          if (data.elements && data.connections) {
            loadDiagram(data.elements, data.connections, data.name);
          } else {
```

with:

```typescript
          if (data.elements && data.connections) {
            loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null);
          } else {
```

Leave the `.drawing` branch untouched (those imports never carry transcripts).

- [ ] **Step 3: Update the keyboard-shortcut save in `App.tsx`**

In `src/App.tsx`, extend the destructuring to include `transcript`:

```typescript
  const {
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    elements,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
    loadDiagram,
    diagramName,
    transcript,
  } = useDiagramStore();
```

Update `handleSave` to include transcript and bump version:

```typescript
  const handleSave = useCallback(() => {
    const toFilename = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';

    const data = {
      version: '1.1',
      name: diagramName,
      elements,
      connections,
      transcript,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toFilename(diagramName)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, connections, diagramName, transcript]);
```

Update `handleFileLoad` to pass transcript to `loadDiagram`:

```typescript
  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.elements && data.connections) {
          loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null);
        }
      } catch (err) {
        console.error('Failed to parse diagram file:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [loadDiagram]);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx src/App.tsx
git commit -m "Persist transcript in save/load JSON and bump schema to 1.1"
```

---

## Task 5: `TranscriptPanelItem` component

One card per transcript line. Shows timestamp+speaker header, clamped text, two dropdowns, a "used" badge, and acts as an HTML5 drag source.

**Files:**
- Create: `src/components/TranscriptPanel/TranscriptPanelItem.tsx`

- [ ] **Step 1: Create the component**

```typescript
import type { ContributorType } from '../../types/elements';
import type { TranscriptLine, TranscriptObjectType } from '../../types/transcript';
import { theme } from '../../utils/theme';
import { getContributorColor } from '../../utils/colors';

const CONTRIBUTOR_OPTIONS: { value: ContributorType | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'given', label: 'Given' },
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];

const OBJECT_TYPE_OPTIONS: { value: TranscriptObjectType | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'data', label: 'Data' },
  { value: 'claim', label: 'Claim' },
  { value: 'warrant', label: 'Warrant' },
  { value: 'backing', label: 'Backing' },
  { value: 'qualifier', label: 'Qualifier' },
  { value: 'rebuttal', label: 'Rebuttal' },
  { value: 'action', label: 'Action' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other Support' },
];

// Support elements are limited to teacher|student contributors.
function isIncompatible(contributor: ContributorType | null, objectType: TranscriptObjectType | null): boolean {
  if (contributor == null || objectType == null) return false;
  const isSupport = objectType === 'action' || objectType === 'question' || objectType === 'other';
  if (!isSupport) return false;
  return contributor !== 'teacher' && contributor !== 'student';
}

export interface TranscriptPanelItemProps {
  line: TranscriptLine;
  transcriptId: string;
  used: boolean;
  onContributorChange: (value: ContributorType | null) => void;
  onObjectTypeChange: (value: TranscriptObjectType | null) => void;
}

export function TranscriptPanelItem({
  line,
  transcriptId,
  used,
  onContributorChange,
  onObjectTypeChange,
}: TranscriptPanelItemProps) {
  const incompatible = isIncompatible(line.contributor, line.objectType);
  const canDrag = line.contributor !== null && line.objectType !== null && !incompatible;

  const dragTooltip = !canDrag
    ? incompatible
      ? 'Support elements require teacher or student contributor.'
      : 'Set contributor and object type first.'
    : '';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    const payload = {
      kind: 'transcript-line',
      transcriptId,
      lineIndex: line.index,
      // Inline what the Canvas needs so it doesn't have to re-read the store on drop:
      speaker: line.speaker,
      timestamp: line.timestamp,
      text: line.text,
      contributor: line.contributor,
      objectType: line.objectType,
    };
    e.dataTransfer.setData('application/x-etd-transcript-line', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const borderColor = line.contributor ? getContributorColor(line.contributor) : theme.sidebar.border;

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStart}
      title={dragTooltip || undefined}
      className="rounded-lg p-3 mb-2 transition-all duration-150"
      style={{
        backgroundColor: theme.sidebar.surface,
        borderLeft: `3px solid ${borderColor}`,
        opacity: used ? 0.55 : 1,
        cursor: canDrag ? 'grab' : 'not-allowed',
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <div
          className="text-xs font-mono"
          style={{ color: theme.sidebar.muted }}
        >
          {line.timestamp}  <span style={{ color: theme.sidebar.textSecondary }}>{line.speaker}</span>
        </div>
        {used && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: theme.sidebar.accent }}
          >
            ✓ used
          </span>
        )}
      </div>

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

      <div className="flex gap-2">
        <select
          value={line.contributor ?? ''}
          onChange={(e) => onContributorChange(e.target.value === '' ? null : (e.target.value as ContributorType))}
          className="flex-1 px-2 py-1 text-xs rounded border"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.text,
            borderColor: theme.sidebar.border,
          }}
        >
          {CONTRIBUTOR_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={line.objectType ?? ''}
          onChange={(e) => onObjectTypeChange(e.target.value === '' ? null : (e.target.value as TranscriptObjectType))}
          className="flex-1 px-2 py-1 text-xs rounded border"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.text,
            borderColor: theme.sidebar.border,
          }}
        >
          {OBJECT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {incompatible && (
        <div
          className="text-[10px] mt-1"
          style={{ color: '#ef4444' }}
        >
          Support requires teacher or student contributor.
        </div>
      )}
    </div>
  );
}
```

**Note on line-clamping:** the component uses inline `-webkit-box` styles rather than Tailwind's `line-clamp-3` utility, since Tailwind 4 requires an explicit plugin for `@tailwindcss/line-clamp` that may not be in the repo's build. The inline version works without plugin setup.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanelItem.tsx
git commit -m "Add TranscriptPanelItem card component"
```

---

## Task 6: `TranscriptPanel` container

Right-column container with a header, empty state, list of items, and file-load plumbing. Does NOT handle toolbar toggle visibility itself — the parent (`App.tsx`) controls whether the panel is mounted.

**Files:**
- Create: `src/components/TranscriptPanel/TranscriptPanel.tsx`
- Create: `src/components/TranscriptPanel/index.ts`

- [ ] **Step 1: Create `TranscriptPanel.tsx`**

```typescript
import { useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import { parseTranscript } from '../../utils/transcriptParser';
import { TranscriptPanelItem } from './TranscriptPanelItem';

export function TranscriptPanel() {
  const transcript = useDiagramStore((s) => s.transcript);
  const setTranscript = useDiagramStore((s) => s.setTranscript);
  const updateTranscriptLine = useDiagramStore((s) => s.updateTranscriptLine);
  const elements = useDiagramStore((s) => s.elements);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived: which line indexes are "used" (referenced by at least one element).
  const usedLineIndexes = useMemo(() => {
    if (!transcript) return new Set<number>();
    const set = new Set<number>();
    for (const el of elements) {
      if (el.sourceTranscript?.transcriptId === transcript.id) {
        set.add(el.sourceTranscript.lineIndex);
      }
    }
    return set;
  }, [elements, transcript]);

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Orphan check: warn if replacing a transcript whose lines are referenced by canvas elements.
    if (transcript) {
      const orphanCount = elements.filter(
        (el) => el.sourceTranscript?.transcriptId === transcript.id,
      ).length;
      if (orphanCount > 0) {
        const proceed = confirm(
          `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
        );
        if (!proceed) {
          e.target.value = '';
          return;
        }
      }
    }

    try {
      const text = await file.text();
      const parsed = parseTranscript(text, file.name);
      if (parsed.lines.length === 0) {
        alert(`No valid transcript lines found in ${file.name}.`);
        e.target.value = '';
        return;
      }
      setTranscript(parsed);
    } catch (err) {
      console.error('Failed to read transcript file:', err);
      alert('Failed to read transcript file.');
    }
    e.target.value = '';
  };

  const handleClose = () => {
    setTranscript(null);
  };

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: theme.sidebar.border }}
      >
        <h2
          className="font-semibold text-sm uppercase tracking-wider"
          style={{ color: theme.sidebar.text }}
        >
          Transcript
        </h2>
        {transcript && (
          <button
            onClick={handleClose}
            className="p-1 rounded hover:opacity-80"
            title="Close transcript"
            style={{ color: theme.sidebar.textSecondary }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!transcript && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p
            className="text-sm mb-4"
            style={{ color: theme.sidebar.textSecondary }}
          >
            No transcript loaded.
          </p>
          <button
            onClick={handleLoadClick}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: theme.sidebar.surface,
              color: theme.sidebar.text,
              borderWidth: '1px',
              borderColor: theme.sidebar.border,
            }}
          >
            Load transcript (.txt)
          </button>
        </div>
      )}

      {transcript && (
        <>
          <div
            className="px-5 py-2 text-xs"
            style={{ color: theme.sidebar.muted, borderColor: theme.sidebar.border, borderBottomWidth: '1px' }}
          >
            <div
              className="truncate"
              style={{ color: theme.sidebar.textSecondary }}
              title={transcript.filename}
            >
              {transcript.filename}
            </div>
            <div>
              {transcript.lines.length} line{transcript.lines.length === 1 ? '' : 's'}
              {transcript.parseWarnings.length > 0 && ` · ${transcript.parseWarnings.length} skipped`}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {transcript.lines.map((line) => (
              <TranscriptPanelItem
                key={line.index}
                line={line}
                transcriptId={transcript.id}
                used={usedLineIndexes.has(line.index)}
                onContributorChange={(value) =>
                  updateTranscriptLine(line.index, { contributor: value })
                }
                onObjectTypeChange={(value) =>
                  updateTranscriptLine(line.index, { objectType: value })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `src/components/TranscriptPanel/index.ts`:

```typescript
export { TranscriptPanel } from './TranscriptPanel';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TranscriptPanel/
git commit -m "Add TranscriptPanel container with load/close and item list"
```

---

## Task 7: Canvas drop handler

The Konva `<Stage>` is wrapped by a plain `<div ref={containerRef}>`. HTML5 drop events must attach to that div. On drop, we convert the browser-pixel coordinates into Konva canvas coordinates (respecting zoom and pan), then call `addElement` with a new argument or support element built from the drag payload.

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Add imports for the new element-creation helpers**

Near the top of `src/components/Canvas/Canvas.tsx` (alongside existing type imports), extend the type-only import to include what we need:

```typescript
import type {
  ArgumentType, SupportType, SupportContributor,
  ArgumentElement, SupportElement,
} from '../../types';
```

Make sure `addElement` is destructured from the store. The existing destructure block doesn't include it; add it there:

```typescript
  const {
    elements,
    connections,
    zoom,
    panX,
    panY,
    selectedIds,
    legendConfig,
    setZoom,
    setPan,
    setSelectedIds,
    clearSelection,
    moveElement,
    resizeElement,
    updateElement,
    addConnection,
    removeElement,
    removeConnection,
    duplicateElements,
    bringToFront,
    sendToBack,
    changeContributor,
    moveLegend,
    addElement,
  } = useDiagramStore();
```

- [ ] **Step 2: Add two handlers and a helper inside the component body**

Place these above the existing JSX return. The helpers below use the Canvas's `containerRef` and the store-backed `zoom` / `panX` / `panY` already in scope.

```typescript
  // Convert a browser-pixel drop location to Konva canvas coordinates.
  const clientPointToCanvas = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const stageX = clientX - rect.left;
      const stageY = clientY - rect.top;
      return {
        x: (stageX - panX) / zoom,
        y: (stageY - panY) / zoom,
      };
    },
    [panX, panY, zoom],
  );

  const generateId = () =>
    `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-etd-transcript-line')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const raw = e.dataTransfer.getData('application/x-etd-transcript-line');
      if (!raw) return;
      e.preventDefault();

      let payload: {
        kind: string;
        transcriptId: string;
        lineIndex: number;
        speaker: string;
        timestamp: string;
        text: string;
        contributor: string;
        objectType: string;
      };
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      if (payload.kind !== 'transcript-line') return;

      const pos = clientPointToCanvas(e.clientX, e.clientY);
      const attribution = { speaker: payload.speaker, timestamp: payload.timestamp };
      const sourceTranscript = {
        transcriptId: payload.transcriptId,
        lineIndex: payload.lineIndex,
      };

      const isSupport =
        payload.objectType === 'action' ||
        payload.objectType === 'question' ||
        payload.objectType === 'other';

      if (isSupport) {
        // Spec: drag is blocked for support+given/joint/implicit at panel level;
        // defense-in-depth here rejects any stray case.
        if (payload.contributor !== 'teacher' && payload.contributor !== 'student') {
          return;
        }
        const supportType = payload.objectType as SupportType;
        const contributor = payload.contributor as SupportContributor;
        const newElement: SupportElement = {
          id: generateId(),
          type: 'support',
          contributor,
          supportType,
          subtype: supportType === 'other' ? 'displays' : undefined,
          content: payload.text,
          attribution,
          position: pos,
          size: supportType === 'action' ? { width: 140, height: 60 } : { width: 160, height: 50 },
          sourceTranscript,
        };
        addElement(newElement);
        return;
      }

      // Argument path
      const argumentType = payload.objectType as ArgumentType;
      // Count existing elements of this type for the auto-label, matching Palette's pattern.
      const existingCount = elements.filter(
        (el) => el.type === 'argument' && (el as ArgumentElement).argumentType === argumentType,
      ).length;
      const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${existingCount + 1}`;

      const newElement: ArgumentElement = {
        id: generateId(),
        type: 'argument',
        argumentType,
        contributor: payload.contributor as ArgumentElement['contributor'],
        label,
        content: payload.text,
        attribution,
        position: pos,
        size:
          payload.contributor === 'implicit'
            ? { width: 140, height: 60 }
            : { width: 180, height: 80 },
        sourceTranscript,
      };
      addElement(newElement);
    },
    [clientPointToCanvas, addElement, elements],
  );
```

- [ ] **Step 3: Wire the handlers onto the container div**

Find the outer `<div ref={containerRef} ...>` that wraps the Konva `<Stage>` in the component's return statement. Add `onDragOver={handleDragOver}` and `onDrop={handleDrop}` to its props. If the wrapping div has inline `style` or `className`, leave them — only append event handlers.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "Handle transcript-line drops on canvas to create elements"
```

---

## Task 8: Toolbar buttons + mount `TranscriptPanel` in App

Two new toolbar buttons: "Load transcript" (opens file picker, parses, replaces) and "Toggle transcript panel" (shows/hides the panel). Panel visibility state lives in `App.tsx` and is passed down via props.

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the `panelOpen` state in `App.tsx`**

At the top of the `App` function body (near `useState(connectMode...)`), add:

```typescript
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(false);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
```

Also add a static import for the parser at the top of `App.tsx`:

```typescript
import { parseTranscript } from './utils/transcriptParser';
import { TranscriptPanel } from './components/TranscriptPanel';
```

- [ ] **Step 2: Add the transcript-load handler and toggler in `App.tsx`**

Add these callbacks alongside the existing handlers:

```typescript
  const setTranscript = useDiagramStore((s) => s.setTranscript);

  const handleLoadTranscriptClick = useCallback(() => {
    transcriptFileInputRef.current?.click();
  }, []);

  const handleTranscriptFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Orphan-confirm using current store state
      const current = useDiagramStore.getState();
      if (current.transcript) {
        const orphanCount = current.elements.filter(
          (el) => el.sourceTranscript?.transcriptId === current.transcript!.id,
        ).length;
        if (orphanCount > 0) {
          const proceed = confirm(
            `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
          );
          if (!proceed) {
            e.target.value = '';
            return;
          }
        }
      }

      try {
        const text = await file.text();
        const parsed = parseTranscript(text, file.name);
        if (parsed.lines.length === 0) {
          alert(`No valid transcript lines found in ${file.name}.`);
          e.target.value = '';
          return;
        }
        setTranscript(parsed);
        setTranscriptPanelOpen(true);
      } catch (err) {
        console.error('Failed to read transcript file:', err);
        alert('Failed to read transcript file.');
      }
      e.target.value = '';
    },
    [setTranscript],
  );

  const toggleTranscriptPanel = useCallback(() => {
    setTranscriptPanelOpen((v) => !v);
  }, []);
```

- [ ] **Step 3: Render the hidden file input and the panel in `App.tsx`**

Update the JSX return. Add a second hidden input near the existing one:

```typescript
      <input
        ref={transcriptFileInputRef}
        type="file"
        accept=".txt"
        onChange={handleTranscriptFileChange}
        className="hidden"
      />
```

Update the main layout row to include the panel on the right when open. Change:

```typescript
      <div className="flex flex-1 overflow-hidden">
        <Palette
          connectMode={connectMode}
          onToggleConnectMode={toggleConnectMode}
        />
        <Canvas
          connectMode={connectMode}
          onConnectionStart={handleConnectionStart}
          connectingFrom={connectingFrom}
        />
      </div>
```

to:

```typescript
      <div className="flex flex-1 overflow-hidden">
        <Palette
          connectMode={connectMode}
          onToggleConnectMode={toggleConnectMode}
        />
        <Canvas
          connectMode={connectMode}
          onConnectionStart={handleConnectionStart}
          connectingFrom={connectingFrom}
        />
        {transcriptPanelOpen && <TranscriptPanel />}
      </div>
```

- [ ] **Step 4: Pass toolbar props**

`Toolbar` currently takes no props. Extend it to accept two new props:

In `App.tsx`, change `<Toolbar />` to:

```typescript
      <Toolbar
        onLoadTranscript={handleLoadTranscriptClick}
        transcriptPanelOpen={transcriptPanelOpen}
        onToggleTranscriptPanel={toggleTranscriptPanel}
      />
```

- [ ] **Step 5: Add the two toolbar buttons**

In `src/components/Toolbar/Toolbar.tsx`, update the component signature:

```typescript
interface ToolbarProps {
  onLoadTranscript: () => void;
  transcriptPanelOpen: boolean;
  onToggleTranscriptPanel: () => void;
}

export function Toolbar({ onLoadTranscript, transcriptPanelOpen, onToggleTranscriptPanel }: ToolbarProps) {
```

Extend the lucide imports at the top:

```typescript
import {
  Save, FolderOpen, Download, Image, FileText, Trash2,
  ZoomIn, ZoomOut, Undo2, Redo2, Info, LayoutGrid, Loader2,
  FileInput, PanelRight,
} from 'lucide-react';
```

Inside the JSX, in the "View options" group (currently just the Toggle Legend button), add two new buttons. Locate:

```typescript
          {/* View options */}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={toggleLegend}
              icon={LayoutGrid}
              tooltip="Toggle Legend"
              isActive={legendConfig.visible}
            />
          </div>
```

and extend to:

```typescript
          {/* View options */}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={toggleLegend}
              icon={LayoutGrid}
              tooltip="Toggle Legend"
              isActive={legendConfig.visible}
            />
            <IconButton
              onClick={onLoadTranscript}
              icon={FileInput}
              tooltip="Load transcript"
            />
            <IconButton
              onClick={onToggleTranscriptPanel}
              icon={PanelRight}
              tooltip="Toggle transcript panel"
              isActive={transcriptPanelOpen}
            />
          </div>
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/Toolbar/Toolbar.tsx
git commit -m "Add transcript load and panel-toggle buttons; mount TranscriptPanel"
```

---

## Task 9: Final clean-up + build check

**Files:**
- No code changes unless typecheck/lint/build surface issues.

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no errors. If lint flags a missing dependency in a `useCallback`, add the dep; if it flags an unused import, remove it.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds and emits `dist/`. This catches things typecheck alone misses (CSS purge, Vite import resolution, etc).

- [ ] **Step 4: Commit if any follow-up fixes were needed**

```bash
# Only if fixes were made:
git add -A
git commit -m "Fix lint/build issues surfaced after transcript ingester merge"
```

---

## Task 10: Live browser verification (Claude for Chrome)

Per `CLAUDE.md`: the project relies on live browser testing after major changes.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (leave running in a separate process).

- [ ] **Step 2: Prepare a test transcript file**

Create a file `/tmp/test-transcript.txt` with this content (mix of annotated, partially-annotated, raw, and a deliberately garbage line):

```
55:07 Teacher-CurlyHair [teacher|claim]: We're going to watch the light...
55:12 Teacher-CurlyHair: ...stays green, makes its four sides, four rotations.
55:18 Students (chorus) [student|claim]: Rectangle! Square! Square!
55:25 Students (chorus): I think it's a square.
55:30 Ms. Johnson [joint|warrant]: Both shapes have four equal sides here.
garbage line with no timestamp
56:02 Teacher-X [teacher|question]: What makes a square a square?
```

- [ ] **Step 3: Walk the verification checklist via Claude for Chrome**

Tick each item live:

1. **Toolbar buttons appear.** Two new buttons in the View Options group of the toolbar (file-input icon and panel-right icon).
2. **Load transcript.** Click the file-input icon, pick `/tmp/test-transcript.txt`. Panel opens on the right; 6 lines visible; header shows `test-transcript.txt` with `6 lines · 1 skipped`.
3. **Contributor inference.** Lines 1–4 show `teacher`/`teacher`/`student`/`student` auto-filled. Line 5 shows `joint` (from explicit tag, not inferred). Line 7 (`Teacher-X`) shows `teacher` inferred.
4. **Object type from tags.** Lines 1, 3, 5, 7 show `claim`/`claim`/`warrant`/`question`. Lines 2, 4 show `—`.
5. **Drag blocked when either field is `—`.** Hover a line with `—` in object type — cursor is `not-allowed`, tooltip says "Set contributor and object type first."
6. **Set object type via dropdown.** On line 2 change objectType to `data`. Drag is now allowed (cursor: `grab`).
7. **Drag to canvas creates element.** Drag line 1 onto canvas. A claim box appears at the drop location with text "We're going to watch the light..." and attribution "Teacher-CurlyHair @ 55:07". Panel line 1 shows `✓ used` and dims.
8. **Delete element un-marks the line.** Delete that element on the canvas. Panel line 1 returns to unused.
9. **Support incompatibility.** On line 5 (currently `joint / warrant`), change object type to `question`. A red warning appears; drag is blocked. Tooltip reads "Support elements require teacher or student contributor."
10. **Save/reload round-trip.** Drop a few more lines onto the canvas. Click Save (toolbar). Load the resulting JSON via Load diagram. Transcript re-appears in the panel; used-state re-derives correctly; previously-dragged elements retain their `sourceTranscript` back-reference.
11. **Orphan-confirm dialog.** With elements still on the canvas that reference the loaded transcript, click Load transcript again and pick a different `.txt`. A confirm dialog appears: "Loading a new transcript will orphan N existing element reference(s). Proceed?" Cancel leaves state unchanged. Accept loads the new transcript; existing elements stay but their `✓ used` link to the new transcript is gone.
12. **Close transcript.** Click the `×` in the panel header. Transcript state clears; panel shows empty state with a "Load transcript (.txt)" button.
13. **Toggle panel off/on.** Click the panel-right toolbar icon. Panel hides and the canvas reclaims the space. Click again to reopen.
14. **Clear diagram preserves transcript.** Load a transcript, drop a couple of elements, then click Clear. Elements are wiped but the transcript panel still shows its content, all lines marked unused.

- [ ] **Step 4: Deploy per `CLAUDE.md`**

Only after the user signs off on the live test:

```bash
npm run build
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: add transcript ingester"
git push
```

Wait for user approval before pushing to the public-facing site. Deploy is a user-approved action per CLAUDE.md.

---

## Self-Review Notes (from plan author)

**Spec coverage:** Each spec section maps to at least one task:
- File format & parser rules → Task 2
- Transcript state data model → Task 3
- `sourceTranscript` on elements → Task 1
- Panel UI (layout, item, dropdowns, used state) → Tasks 5 + 6
- Drag rules (both-set, support incompat) → Task 5 (panel enforces) + Task 7 (canvas defense-in-depth)
- Drag creates element with attribution → Task 7
- Toolbar buttons → Task 8
- Save/load persistence → Task 4
- Orphan-confirm on replace → Task 6 (panel-initiated) + Task 8 (toolbar-initiated; same logic, duplicated for the two entry points)
- Clear preserves transcript → Task 3 (store behavior)
- Browser verification → Task 10

**Placeholder scan:** None present. Each code step contains final code.

**Type consistency:** `Transcript`, `TranscriptLine`, `TranscriptObjectType` are used consistently across parser → store → panel → canvas. `sourceTranscript` shape `{ transcriptId, lineIndex }` used consistently. Drag payload `application/x-etd-transcript-line` MIME type used by both the panel (setData) and canvas (getData).

**Known duplication:** The orphan-confirm logic is implemented twice (in `TranscriptPanel` for in-panel re-load, in `App.tsx` for toolbar re-load). This is tolerable given they're the only two entry points; if a third entry point emerges, lift the check into a shared utility or into `setTranscript` itself.
