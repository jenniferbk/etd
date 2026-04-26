# Configurable Element Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-diagram editable styles for all argument and support element types (display label, border style, border shape, background color) and a fully editable Other-Support subtype list, configured through a Settings modal opened from a toolbar gear icon. Configuration travels in saved diagram JSON; the save schema bumps from 1.2 → 1.3.

**Architecture:** A new `styleConfig` field on the diagram store (mirrored in saved JSON) holds the per-diagram config. A pure `styleResolver` layers contributor visual conventions (`student=dashed`, `joint=dot-dash`, `implicit=cloud`, `given=green tint`) on top of per-type config and returns a `ResolvedStyle` that the existing `ArgumentShape` / `SupportShape` Konva components consume via targeted edits — no shape-engine rewrite. The Settings modal holds a local working copy of `styleConfig` and commits via a single `replaceStyleConfig(config)` action on Apply, producing exactly one undo entry per editing session. Loading a v1.2 diagram applies a frozen `createV1_2_MigrationDefaults()` so existing diagrams render identically; new diagrams use `createCurrentDefaults()` (an independent literal that may evolve).

**Tech Stack:** React 19, TypeScript, Vite, Konva.js (`react-konva`), Zustand, zundo. No test framework — verification is `npm run lint`, `npm run build` (which runs `tsc -b`), and manual browser testing per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-04-26-configurable-element-styles-design.md`

**Branch:** Should be created as `feature/configurable-element-styles` from `main` before Task 1. Working-tree note: `package-lock.json` may have unrelated drift — do NOT include it in any commit.

**Phase map (for orientation; tasks below proceed sequentially):**
- Phase 1 (Tasks 1–4): Foundation — types, defaults, resolver, store. No visible change yet.
- Phase 2 (Tasks 5–7): Renderers consume config via resolver. Visually identical to before.
- Phase 3 (Tasks 8–10): Labels propagate from config across Palette / Properties / TranscriptPanel.
- Phase 4 (Tasks 11–14): Settings modal shell, sidebar, type-style editor, preview pane.
- Phase 5 (Tasks 15–16): Subtype editor + Apply/Cancel + scoped resets.
- Phase 6 (Tasks 17–18): Orphan visual error states (canvas + Properties panel).
- Phase 7 (Tasks 19–21): SVG export, diagramx label propagation, autosave + recovery.
- Phase 8 (Task 22): End-to-end manual verification.

---

## Task 1: Add `StyleConfig` types

**Files:**
- Create: `src/types/styleConfig.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/styleConfig.ts`**

```typescript
import type { ArgumentType, SupportType } from './elements';

export type BorderStyle = 'solid' | 'dashed' | 'dotted';
export type BorderShape = 'rectangle' | 'rounded' | 'ellipse';

export interface TypeStyle {
  label: string;            // display label, e.g. "Claim" or "Conclusion"
  borderStyle: BorderStyle;
  borderShape: BorderShape;
  backgroundColor: string;  // hex, e.g. "#FFFFFF"
}

export interface OtherSubtype {
  id: string;     // stable. Six v1.2 default ids are slugs ("displays" etc.).
                  // ALL new subtypes use crypto.randomUUID() — never slug-from-label.
  label: string;  // display label, e.g. "Displays"
}

export interface StyleConfig {
  argumentTypes: Record<ArgumentType, TypeStyle>;
  supportTypes:  Record<SupportType,  TypeStyle>;
  otherSubtypes: OtherSubtype[];
}
```

- [ ] **Step 2: Re-export from `src/types/index.ts`**

Look at the current contents of `src/types/index.ts` and add this line in the appropriate export block:

```typescript
export type { StyleConfig, TypeStyle, OtherSubtype, BorderStyle, BorderShape } from './styleConfig';
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run build`
Expected: build succeeds (the new types are not yet referenced anywhere, so this just confirms the file parses cleanly).

- [ ] **Step 4: Commit**

```bash
git add src/types/styleConfig.ts src/types/index.ts
git commit -m "feat(styles): add StyleConfig types"
```

---

## Task 2: Add `createV1_2_MigrationDefaults` and `createCurrentDefaults` factories

**Files:**
- Create: `src/utils/styleConfigDefaults.ts`

The two factories MUST be independent literal copies, not pass-throughs. They are identical at launch — diverge only when defaults intentionally change in the future.

- [ ] **Step 1: Create `src/utils/styleConfigDefaults.ts`**

```typescript
import type { StyleConfig } from '../types/styleConfig';

// FROZEN — never modify. Used only for v1.2 → v1.3 load migration.
// If defaults change in the future, change createCurrentDefaults instead.
export function createV1_2_MigrationDefaults(): StyleConfig {
  return {
    argumentTypes: {
      data:      { label: 'Data',      borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      claim:     { label: 'Claim',     borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      warrant:   { label: 'Warrant',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      backing:   { label: 'Backing',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      qualifier: { label: 'Qualifier', borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      rebuttal:  { label: 'Rebuttal',  borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
    },
    supportTypes: {
      action:   { label: 'Action',   borderStyle: 'solid', borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
      question: { label: 'Question', borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#E0FFFF' },
      other:    { label: 'Other',    borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#FFFACD' },
    },
    otherSubtypes: [
      { id: 'displays',   label: 'Displays' },
      { id: 'suggests',   label: 'Suggests' },
      { id: 'summarizes', label: 'Summarizes' },
      { id: 'restates',   label: 'Restates' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'validates',  label: 'Validates' },
    ],
  };
}

// Used for new diagrams, "Reset all type styles", "Reset subtypes to defaults",
// and per-type resets. Safe to evolve in future releases.
//
// IMPORTANT: this function MUST NOT delegate to createV1_2_MigrationDefaults.
// They are intentionally independent literal copies at launch so that future
// edits here cannot accidentally modify the frozen v1.2 contract.
export function createCurrentDefaults(): StyleConfig {
  return {
    argumentTypes: {
      data:      { label: 'Data',      borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      claim:     { label: 'Claim',     borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      warrant:   { label: 'Warrant',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      backing:   { label: 'Backing',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      qualifier: { label: 'Qualifier', borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      rebuttal:  { label: 'Rebuttal',  borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
    },
    supportTypes: {
      action:   { label: 'Action',   borderStyle: 'solid', borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
      question: { label: 'Question', borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#E0FFFF' },
      other:    { label: 'Other',    borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#FFFACD' },
    },
    otherSubtypes: [
      { id: 'displays',   label: 'Displays' },
      { id: 'suggests',   label: 'Suggests' },
      { id: 'summarizes', label: 'Summarizes' },
      { id: 'restates',   label: 'Restates' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'validates',  label: 'Validates' },
    ],
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/styleConfigDefaults.ts
git commit -m "feat(styles): add v1.2 migration + current defaults factories"
```

---

## Task 3: Add `styleResolver` (pure helpers)

**Files:**
- Create: `src/utils/styleResolver.ts`

The resolver layers contributor overlays on top of per-type config. `borderStyle` and `borderShape` use slightly extended unions to encode the contributor-overlay results (`'dotdash'`, `'cloud'`).

- [ ] **Step 1: Create `src/utils/styleResolver.ts`**

```typescript
import type { ArgumentElement, SupportElement } from '../types';
import type { StyleConfig, BorderStyle, BorderShape } from '../types/styleConfig';
import { getContributorColor, getSupportColors } from './colors';

export type ResolvedBorderStyle = BorderStyle | 'dotdash';
export type ResolvedBorderShape = BorderShape | 'cloud';

export interface ResolvedStyle {
  borderColor: string;
  borderStyle: ResolvedBorderStyle;
  borderShape: ResolvedBorderShape;
  backgroundColor: string;
  borderWidth: number;
}

export function resolveArgumentStyle(
  el: ArgumentElement,
  config: StyleConfig,
): ResolvedStyle {
  const typeStyle = config.argumentTypes[el.argumentType];

  // Contributor overlays. Spec: contributor wins for shape/style for arguments.
  const borderStyle: ResolvedBorderStyle =
    el.contributor === 'student' ? 'dashed' :
    el.contributor === 'joint'   ? 'dotdash' :
    typeStyle.borderStyle;

  const borderShape: ResolvedBorderShape =
    el.contributor === 'implicit' ? 'cloud' :
    typeStyle.borderShape;

  // Given-tint overlay. ALWAYS wins for given contributor — see spec Risks.
  // Document the precedence here so future readers don't see this as a bug.
  const backgroundColor =
    el.contributor === 'given' ? '#F0FFF0' :
    typeStyle.backgroundColor;

  return {
    borderColor: getContributorColor(el.contributor),
    borderStyle,
    borderShape,
    backgroundColor,
    borderWidth: el.contributor === 'implicit' ? 2 : 3,
  };
}

export function resolveSupportStyle(
  el: SupportElement,
  config: StyleConfig,
): ResolvedStyle {
  const typeStyle = config.supportTypes[el.supportType];
  // Border color stays contributor-derived (existing getSupportColors logic).
  // We discard the .fill it returns; per-type config now owns background.
  const { border } = getSupportColors(el.supportType, el.contributor);

  // Symmetric with resolveArgumentStyle: student → dashed.
  // SupportContributor only has 'teacher' | 'student' so joint/implicit/given
  // overlays from the argument resolver don't apply here.
  const borderStyle: ResolvedBorderStyle =
    el.contributor === 'student' ? 'dashed' : typeStyle.borderStyle;

  return {
    borderColor: border,
    borderStyle,
    borderShape: typeStyle.borderShape,
    backgroundColor: typeStyle.backgroundColor,
    borderWidth: 2,
  };
}

// Konva dash-array values for each resolved border style.
// Used by both ArgumentShape/SupportShape (Konva) and svgExport.ts.
export function dashArrayForBorderStyle(style: ResolvedBorderStyle): number[] | undefined {
  switch (style) {
    case 'solid':   return undefined;
    case 'dashed':  return [10, 5];
    case 'dotted':  return [2, 4];
    case 'dotdash': return [10, 5, 2, 5];
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/utils/styleResolver.ts
git commit -m "feat(styles): add styleResolver with contributor overlays"
```

---

## Task 4: Add `styleConfig` to the diagram store; bump schema; thread through load/save

**Files:**
- Modify: `src/utils/schema.ts` (bump version)
- Modify: `src/store/diagramStore.ts` (add field, action, partialize, loadDiagram, clearDiagram)
- Modify: `src/components/Toolbar/Toolbar.tsx` (write styleConfig in JSON save; read on load)

This task wires the data model end-to-end. Existing diagrams continue to render identically because the store seeds `createCurrentDefaults()` for new sessions and the loader applies `createV1_2_MigrationDefaults()` when JSON has no `styleConfig` field.

- [ ] **Step 1: Bump save schema version**

Edit `src/utils/schema.ts`:

```typescript
// Save-format schema version stamped into every saved diagram JSON.
// Bump on any breaking schema change. Optional/additive fields don't require a bump,
// but bumping when a new field is added is fine and helps observability.
export const SAVE_SCHEMA_VERSION = '1.3';
```

- [ ] **Step 2: Add `styleConfig` to the store**

In `src/store/diagramStore.ts`, add the import alongside the existing type imports:

```typescript
import type { StyleConfig } from '../types/styleConfig';
import { createCurrentDefaults, createV1_2_MigrationDefaults } from '../utils/styleConfigDefaults';
```

In the `DiagramState` interface, add the field next to `transcript`:

```typescript
  // Style configuration (per-diagram)
  styleConfig: StyleConfig;
```

And add the action declaration alongside the other actions:

```typescript
  // Actions - Style config
  replaceStyleConfig: (config: StyleConfig) => void;
```

In the `useDiagramStore` create call, seed the initial state (after the `transcript: null,` line):

```typescript
      styleConfig: createCurrentDefaults(),
```

Add the action implementation (place it near the other small actions, e.g. after `setTranscript`):

```typescript
      replaceStyleConfig: (config) => set({ styleConfig: config }),
```

Update `loadDiagram` to accept and apply an optional `styleConfig` argument:

```typescript
      loadDiagram: (elements, connections, name, transcript, styleConfig) => {
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
          // v1.2 files have no styleConfig — apply the FROZEN migration defaults.
          // v1.3+ files pass their saved config through.
          styleConfig: styleConfig ?? createV1_2_MigrationDefaults(),
        });
      },
```

Update the `loadDiagram` signature in the `DiagramState` interface to match:

```typescript
  loadDiagram: (
    elements: DiagramElement[],
    connections: Connection[],
    name?: string,
    transcript?: Transcript | null,
    styleConfig?: StyleConfig,
  ) => void;
```

Update `clearDiagram` to seed defaults:

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
          styleConfig: createCurrentDefaults(),
        })),
```

Update the temporal `partialize` to include `styleConfig`:

```typescript
    {
      // Track elements, connections, and styleConfig for undo/redo
      partialize: (state) => ({
        elements: state.elements,
        connections: state.connections,
        styleConfig: state.styleConfig,
      }),
      limit: 50,
    }
```

- [ ] **Step 3: Write `styleConfig` in the JSON save path**

In `src/components/Toolbar/Toolbar.tsx`, the existing `handleSave` callback (around line 73) builds the JSON payload. Find the `data` object literal and add the `styleConfig` field. First add `styleConfig` to the `useDiagramStore` destructuring (look for the existing line that destructures store state and add it):

```typescript
const {
  zoom, setZoom, setPan, fitToView, elements, connections, loadDiagram, clearDiagram,
  styleConfig,
  // ...whatever else is currently destructured
} = useDiagramStore();
```

Then in the save payload build (around line 75):

```typescript
const data = {
  version: SAVE_SCHEMA_VERSION,
  name: diagramName,
  elements,
  connections,
  styleConfig,
  transcript,
  // ...whatever else
};
```

- [ ] **Step 4: Read `styleConfig` on JSON load**

In the same file, find the JSON-load `loadDiagram` call (around line 116):

```typescript
loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null);
```

Change to:

```typescript
loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig);
```

The `data.styleConfig` will be `undefined` for v1.2 files; the store applies migration defaults automatically.

The `.drawing` import path (around line 105) does NOT carry style config; leave it as-is — its 4-arg call lets the store fill in defaults.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds. Type-checking confirms `loadDiagram` signature is consistent.

- [ ] **Step 6: Verify in browser — no visual change**

Run: `npm run dev`. Open the app, create one of each element type, save → reload → recover. Confirm everything still renders identically. The data model is plumbed but no rendering uses it yet.

- [ ] **Step 7: Commit**

```bash
git add src/utils/schema.ts src/store/diagramStore.ts src/components/Toolbar/Toolbar.tsx
git commit -m "feat(styles): wire styleConfig through store, save, load (schema 1.3)"
```

---

## Task 5: `ArgumentShape` consumes `styleConfig` via resolver

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`

This task makes `ArgumentShape` config-aware while preserving today's exact rendering. It also adds the new shape branches (`rounded`, `ellipse`) needed by the eventual editor — these are not exercised yet because defaults all use `'rectangle'` for arguments.

- [ ] **Step 1: Add resolver imports and read `styleConfig` from store**

At the top of `src/components/Canvas/shapes/ArgumentShape.tsx`, add imports:

```typescript
import { useDiagramStore } from '../../../store';
import { resolveArgumentStyle, dashArrayForBorderStyle } from '../../../utils/styleResolver';
```

Inside the `ArgumentShape` function, near the top (right after the destructuring of `element`), add:

```typescript
const styleConfig = useDiagramStore((s) => s.styleConfig);
const style = resolveArgumentStyle(element, styleConfig);
```

Note: do NOT pull a type-display-label here. The element's existing `label` prop (e.g., `"Claim 1"`, `"Warrant 2"`) is the per-element title and should keep rendering as-is. The type-display-label rename (e.g., `"Claim"` → `"Conclusion"`) only affects new elements (created via the Palette in Task 8) and dropdowns in the Properties / Transcript panels (Tasks 9 / 10). Existing element titles already encode the type label as their prefix at creation time and don't auto-update — that's intentional, since renaming a research category shouldn't silently relabel existing elements that may already be referenced in publications.

- [ ] **Step 2: Replace inline contributor-derived values with `style`**

Find the existing block that computes the per-contributor visuals (currently around lines 31–42 of `ArgumentShape.tsx`):

```typescript
const borderColor = getContributorColor(contributor);
// ...
const isDashed = contributor === 'student';
const isDotDash = contributor === 'joint';
const isCloud = contributor === 'implicit';
const strokeWidth = contributor === 'implicit' ? 2 : 3;
```

Replace with:

```typescript
const borderColor = style.borderColor;
const isCloud = style.borderShape === 'cloud';
const strokeWidth = style.borderWidth;
const dashArray = dashArrayForBorderStyle(style.borderStyle);
```

Remove the now-unused `getContributorColor` import line (eslint `no-unused-vars` would flag it on the next build).

- [ ] **Step 3: Update the cloud-shape branch to read from `style`**

The existing `if (isCloud)` block now reads from `style.borderShape === 'cloud'`. The `isCloud` local variable already encodes this — no further change needed inside the cloud branch besides confirming `borderColor` and `strokeWidth` come from `style` (already done in Step 2). The header `<Text text={label} ... />` keeps using the per-element `label` prop unchanged.

- [ ] **Step 4: Add new branch for `borderShape === 'rounded'`**

Currently the non-cloud branch is one big `<Group>` with a `<Rect>` that has `cornerRadius={0}`. Refactor: extract the shape-rendering primitive to honor `style.borderShape`. Replace the existing `<Rect>` (the one whose `fill` is computed from `contributor === 'given'`) with a switch:

```tsx
{style.borderShape === 'ellipse' ? (
  <Ellipse
    x={size.width / 2}
    y={size.height / 2}
    radiusX={size.width / 2}
    radiusY={size.height / 2}
    fill={style.backgroundColor}
    stroke={borderColor}
    strokeWidth={strokeWidth}
    dash={dashArray}
  />
) : (
  <Rect
    width={size.width}
    height={size.height}
    fill={style.backgroundColor}
    stroke={borderColor}
    strokeWidth={strokeWidth}
    dash={dashArray}
    cornerRadius={style.borderShape === 'rounded' ? 8 : 0}
  />
)}
```

Add `Ellipse` to the existing `import { Group, Rect, Text, Line } from 'react-konva';` line:

```typescript
import { Group, Rect, Ellipse, Text, Line } from 'react-konva';
```

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass. (Build runs `tsc -b` which catches type errors from the resolver-shape mismatch.)

- [ ] **Step 6: Verify in browser — visual parity**

Run: `npm run dev`. Open an existing v1.2 diagram or create new arguments with each contributor:
- given (with no other type changes) → solid rectangle, light-green tint
- student → dashed rectangle, blue border
- teacher → solid rectangle, red border
- joint → dot-dash rectangle, purple border
- implicit → cloud, black border

All should look identical to before. If anything looks off, the resolver isn't matching old behavior — fix before moving on.

- [ ] **Step 7: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx
git commit -m "feat(styles): ArgumentShape consumes styleConfig via resolver"
```

---

## Task 6: `SupportShape` consumes `styleConfig` via resolver

**Files:**
- Modify: `src/components/Canvas/shapes/SupportShape.tsx`

`SupportShape` currently has three bespoke per-`supportType` branches (action=ellipse, question=rounded rect, other=rounded rect). They collapse into config-driven branches that switch on `style.borderShape`. The student-dashed overlay is new behavior for supports (per spec v3) — confirm visually.

- [ ] **Step 1: Add resolver imports and read styleConfig**

At the top of `src/components/Canvas/shapes/SupportShape.tsx`, add imports:

```typescript
import { useDiagramStore } from '../../../store';
import { resolveSupportStyle, dashArrayForBorderStyle } from '../../../utils/styleResolver';
```

Inside `SupportShape`, near the top after the existing destructuring:

```typescript
const styleConfig = useDiagramStore((s) => s.styleConfig);
const style = resolveSupportStyle(element, styleConfig);
const dashArray = dashArrayForBorderStyle(style.borderStyle);
```

- [ ] **Step 2: Replace the existing `getSupportColors` call**

Find the existing line near the top of `SupportShape`:

```typescript
const { border, fill } = getSupportColors(supportType, contributor);
```

Delete it (the resolver now provides `style.borderColor` and `style.backgroundColor`). Remove the `getSupportColors` import line if it becomes unused (eslint will flag it).

- [ ] **Step 3: Collapse the three per-supportType branches into shape-driven branches**

The existing function has three `if (supportType === ...)` branches each returning a `<Group>`. Replace ALL THREE with a single shape-aware branch by reading `style.borderShape`:

```tsx
const shapeNode =
  style.borderShape === 'ellipse' ? (
    <>
      <Ellipse
        x={size.width / 2}
        y={size.height / 2}
        radiusX={size.width / 2}
        radiusY={size.height / 2}
        fill={style.backgroundColor}
        stroke={style.borderColor}
        strokeWidth={style.borderWidth}
        dash={dashArray}
      />
      {isSelected && (
        <Ellipse
          x={size.width / 2}
          y={size.height / 2}
          radiusX={size.width / 2 + 4}
          radiusY={size.height / 2 + 4}
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
        />
      )}
    </>
  ) : (
    <>
      <Rect
        width={size.width}
        height={size.height}
        fill={style.backgroundColor}
        stroke={style.borderColor}
        strokeWidth={style.borderWidth}
        dash={dashArray}
        cornerRadius={style.borderShape === 'rounded' ? 8 : 0}
      />
      {isSelected && (
        <Rect
          width={size.width + 6}
          height={size.height + 6}
          x={-3}
          y={-3}
          stroke="#4A90D9"
          strokeWidth={2}
          fill="transparent"
          dash={[5, 3]}
          cornerRadius={style.borderShape === 'rounded' ? 10 : 0}
        />
      )}
    </>
  );
```

Then return ONE `<Group>` that includes:
1. Common drag/select handlers (preserve from existing code)
2. `{shapeNode}`
3. The contributor badge ("T"/"S") — preserved from existing code
4. The label text: for `action` the existing renders no label; for `question` it renders `"[T] Question"` or `"[S] Question"`; for `other` it renders `"[T] Displays"` etc. To preserve this differentiation while moving to config-driven, build the label string inside the function:

```typescript
const supportTypeLabel = styleConfig.supportTypes[element.supportType].label;
const subtypeLabel = element.supportType === 'other' && element.subtype
  ? styleConfig.otherSubtypes.find((s) => s.id === element.subtype)?.label ?? element.subtype
  : null;
const headerLabel =
  element.supportType === 'action' ? '' :
  element.supportType === 'question' ? `[${contributorLabel}] ${supportTypeLabel}` :
  `[${contributorLabel}] ${subtypeLabel ?? supportTypeLabel}`;
```

Render `<Text text={headerLabel} ... />` only when `headerLabel` is non-empty (preserves the existing "action has no header" behavior). The Text styling (positioning, color, fontSize) should match the existing per-branch styling — for now use the most permissive existing values (small bold black text at top-left padding).

Add `Ellipse` to the `react-konva` import:

```typescript
import { Group, Rect, Ellipse, Text } from 'react-konva';
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 5: Verify in browser — visual parity + new student-dashed**

Run: `npm run dev`. Test each support type with each contributor:
- teacher-action → solid red ellipse (unchanged)
- student-action → **dashed** blue ellipse (NEW — student=dashed extended to supports per spec v3)
- teacher-question → solid cyan rounded rect with cyan fill (unchanged)
- student-question → **dashed** cyan rounded rect (NEW)
- teacher-other (e.g. "Displays") → solid goldenrod rounded rect (unchanged)
- student-other → **dashed** goldenrod rounded rect (NEW)

Header text rendering should match prior — action has no header, question shows `[T] Question` / `[S] Question`, other shows `[T] Displays` etc.

If any pre-existing visual is off (e.g. text positioning shifts), revisit Step 3 — the branches may have had slightly different padding/positioning that the unified version needs to encode.

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/shapes/SupportShape.tsx
git commit -m "feat(styles): SupportShape consumes styleConfig + student=dashed overlay"
```

---

## Task 7: `TeacherSupportShape` consumes `styleConfig` (defensive update)

**Files:**
- Modify: `src/components/Canvas/shapes/TeacherSupportShape.tsx`

`TeacherSupportShape` is the deprecated path for legacy `type: 'teacherSupport'` elements. Old saved diagrams may still contain them. Apply the same config-aware treatment so they don't render with stale hardcoded colors after a user customizes the support type styles.

- [ ] **Step 1: Read the current file**

Run: `cat src/components/Canvas/shapes/TeacherSupportShape.tsx | head -50`

The structure mirrors `SupportShape` but reads from `TeacherSupportElement` (no `contributor` field — implicitly teacher).

- [ ] **Step 2: Apply the same resolver pattern**

Add the same resolver imports as Task 6. Since `TeacherSupportElement` has no `contributor` field, synthesize a teacher contributor for the resolver call by constructing a `SupportElement`-shaped value just for resolving:

```typescript
import { useDiagramStore } from '../../../store';
import { resolveSupportStyle, dashArrayForBorderStyle } from '../../../utils/styleResolver';
import type { SupportElement } from '../../../types';
```

Inside `TeacherSupportShape`:

```typescript
const styleConfig = useDiagramStore((s) => s.styleConfig);
// TeacherSupportElement has no contributor field; treat as teacher.
const synthesized: SupportElement = {
  ...element,
  type: 'support',
  contributor: 'teacher',
};
const style = resolveSupportStyle(synthesized, styleConfig);
const dashArray = dashArrayForBorderStyle(style.borderStyle);
```

Then collapse its three per-supportType branches the same way as Task 6 (single shape-aware branch driven by `style.borderShape`).

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 4: Verify in browser — only matters if you have a legacy diagram**

If an old diagram with `type: 'teacherSupport'` elements is available, load it and confirm those elements render without crash and look like teacher-derived supports. If no such diagram exists, this task is purely defensive — note the commit message accordingly.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/TeacherSupportShape.tsx
git commit -m "feat(styles): TeacherSupportShape consumes styleConfig (defensive)"
```

---

## Task 8: Palette derives labels from `styleConfig`

**Files:**
- Modify: `src/components/Palette/Palette.tsx`

The palette's `ARGUMENT_TYPES` and `SUPPORT_SUBTYPES` const arrays bake in the type/subtype labels. With config-driven labels, the palette buttons need to update when the user renames a type. Subtype dropdown also rebuilds from `styleConfig.otherSubtypes`.

- [ ] **Step 1: Read styleConfig and derive arrays**

In `src/components/Palette/Palette.tsx`, add inside the `Palette` function (just after the existing `useDiagramStore` calls):

```typescript
const styleConfig = useDiagramStore((s) => s.styleConfig);
```

Replace the const `ARGUMENT_TYPES` (currently at lines 17–24) with a derived array inside the component. Move the array definition INSIDE the function body, after `styleConfig` is available:

```typescript
const ARGUMENT_TYPES: { type: ArgumentType; label: string }[] = [
  { type: 'data',      label: styleConfig.argumentTypes.data.label },
  { type: 'claim',     label: styleConfig.argumentTypes.claim.label },
  { type: 'warrant',   label: styleConfig.argumentTypes.warrant.label },
  { type: 'backing',   label: styleConfig.argumentTypes.backing.label },
  { type: 'qualifier', label: styleConfig.argumentTypes.qualifier.label },
  { type: 'rebuttal',  label: styleConfig.argumentTypes.rebuttal.label },
];
```

Replace the `SUPPORT_SUBTYPES` const (currently at lines 34–41) with:

```typescript
const SUPPORT_SUBTYPES = styleConfig.otherSubtypes;
```

Update the `<select>` options (around line 393) to use the new shape — `SUPPORT_SUBTYPES` is now `OtherSubtype[]`:

```tsx
{SUPPORT_SUBTYPES.map((subtype) => (
  <option key={subtype.id} value={subtype.id}>
    {subtype.label}
  </option>
))}
```

The `selectedSubtype` state currently holds a string (the legacy hardcoded slug). Initialize it from the first available subtype:

```typescript
const [selectedSubtype, setSelectedSubtype] = useState<string>(
  styleConfig.otherSubtypes[0]?.id ?? 'displays'
);
```

(Update the type from `SupportSubtype` to plain `string` since the id can now be a UUID.)

When `selectedSubtype` is no longer present in the config (e.g., user deleted it after the component mounted), fall back to the first available. Add an effect:

```typescript
useEffect(() => {
  const exists = styleConfig.otherSubtypes.some((s) => s.id === selectedSubtype);
  if (!exists && styleConfig.otherSubtypes[0]) {
    setSelectedSubtype(styleConfig.otherSubtypes[0].id);
  }
}, [styleConfig.otherSubtypes, selectedSubtype]);
```

Add `useEffect` to the React import at the top:

```typescript
import { useState, useEffect } from 'react';
```

In `handleAddSupport`, the new element's `subtype` field uses `selectedSubtype` directly (already a string):

```typescript
subtype: supportType === 'other' ? selectedSubtype : undefined,
```

- [ ] **Step 2: Update label rendering for argument buttons**

The existing argument buttons already render `{label}` from the loop variable, which now comes from `styleConfig`. No further change needed.

- [ ] **Step 3: Update support button labels**

Find the three support buttons (Action / Question / Other) around lines 357–382. Currently they hardcode "Action", "Question", "Other Support". Replace each label text with the configured value:

```tsx
{styleConfig.supportTypes.action.label}
{styleConfig.supportTypes.question.label}
{styleConfig.supportTypes.other.label}
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`. Confirm palette buttons display "Data", "Claim", etc. as before. Subtype dropdown shows the six defaults. New "Other" elements created from the palette use the configured subtype id (test by saving and inspecting the JSON — `subtype: 'displays'` not `subtype: 'Displays'`).

- [ ] **Step 6: Commit**

```bash
git add src/components/Palette/Palette.tsx
git commit -m "feat(styles): Palette derives type labels and subtypes from config"
```

---

## Task 9: PropertiesPanel derives labels from `styleConfig`

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`

Same pattern as Palette — the `ARGUMENT_TYPES`, `SUPPORT_TYPES`, and `SUPPORT_SUBTYPES` const arrays become derived from `styleConfig`. Orphan-subtype handling for the dropdown is added in Task 18; for now just propagate labels.

- [ ] **Step 1: Read styleConfig**

In `src/components/Properties/PropertiesPanel.tsx`, in the `PropertiesPanel` function (after the existing `useDiagramStore` destructuring):

```typescript
const styleConfig = useDiagramStore((s) => s.styleConfig);
```

- [ ] **Step 2: Replace the three module-level const arrays**

Move the three definitions from module scope into the component body. Replace:

```typescript
const ARGUMENT_TYPES: { value: ArgumentType; label: string }[] = [
  { value: 'claim', label: 'Claim' },
  // ...
];
const SUPPORT_TYPES: { value: SupportType; label: string }[] = [
  // ...
];
const SUPPORT_SUBTYPES: { value: SupportSubtype; label: string }[] = [
  // ...
];
```

Inside the function body:

```typescript
const ARGUMENT_TYPES = (
  ['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal'] as const
).map((value) => ({ value, label: styleConfig.argumentTypes[value].label }));

const SUPPORT_TYPES = (
  ['action', 'question', 'other'] as const
).map((value) => ({ value, label: styleConfig.supportTypes[value].label }));

const SUPPORT_SUBTYPES = styleConfig.otherSubtypes.map((s) => ({
  value: s.id,
  label: s.label,
}));
```

Remove the unused `ArgumentType`, `SupportType`, `SupportSubtype` imports if eslint flags them — but check carefully because they're likely still used inside the component for action signatures. Probably safe to leave alone.

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`. Select an argument element. Properties panel shows the type dropdown with the configured labels. Select a support element with subtype "displays" — dropdown shows "Displays" as the current value.

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(styles): PropertiesPanel derives dropdown labels from config"
```

---

## Task 10: TranscriptPanelItem rebuilds `OBJECT_TYPE_OPTIONS` from `styleConfig`

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanelItem.tsx`

The transcript panel's object-type dropdown currently has hardcoded entries like `{ value: 'other:displays', label: 'Other Support: Displays' }`. These need to be derived from the config so renamed types and custom subtypes appear correctly.

- [ ] **Step 1: Read the current `OBJECT_TYPE_OPTIONS` shape**

Run: `grep -n "OBJECT_TYPE_OPTIONS\|ObjectTypeOption" src/components/TranscriptPanel/TranscriptPanelItem.tsx | head -20`. Note the structure — each option has `value`, `label`, `objectType`, `subtype?`.

- [ ] **Step 2: Derive options from styleConfig**

In the `TranscriptPanelItem` function, near the top, add:

```typescript
import { useDiagramStore } from '../../store';
// ...
const styleConfig = useDiagramStore((s) => s.styleConfig);
```

Replace the module-level `OBJECT_TYPE_OPTIONS` const with a function-local derivation. Inside the component:

```typescript
const OBJECT_TYPE_OPTIONS: ObjectTypeOption[] = [
  { value: '', label: '— None —', objectType: '' },
  { value: 'claim',     label: styleConfig.argumentTypes.claim.label,     objectType: 'claim' },
  { value: 'data',      label: styleConfig.argumentTypes.data.label,      objectType: 'data' },
  { value: 'warrant',   label: styleConfig.argumentTypes.warrant.label,   objectType: 'warrant' },
  { value: 'backing',   label: styleConfig.argumentTypes.backing.label,   objectType: 'backing' },
  { value: 'qualifier', label: styleConfig.argumentTypes.qualifier.label, objectType: 'qualifier' },
  { value: 'rebuttal',  label: styleConfig.argumentTypes.rebuttal.label,  objectType: 'rebuttal' },
  { value: 'action',    label: styleConfig.supportTypes.action.label,     objectType: 'action' },
  { value: 'question',  label: styleConfig.supportTypes.question.label,   objectType: 'question' },
  ...styleConfig.otherSubtypes.map((s) => ({
    value: `other:${s.id}`,
    label: `${styleConfig.supportTypes.other.label}: ${s.label}`,
    objectType: 'other' as const,
    subtype: s.id,
  })),
];
```

Adjust the `ObjectTypeOption` type if needed — `value` and `label` and `objectType` are existing strings. The `subtype` field is `string` (no longer narrowed to `SupportSubtype`).

- [ ] **Step 3: Verify the existing `valueFromObjectTypeAndSubtype` helper still works**

The helper at line 46 returns `'other:${subtype ?? "displays"}'` for `other` types. With custom subtypes, this still works because the `subtype` arg is just a string. No change needed.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`. Load a diagram with a transcript. The object-type dropdown for each line should show the configured labels. If you save the diagram, edit `styleConfig.otherSubtypes` directly in localStorage to add a custom subtype, reload — the new subtype appears in the dropdown.

(This is just a smoke test until the Settings UI ships in Tasks 11–16.)

- [ ] **Step 6: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanelItem.tsx
git commit -m "feat(styles): TranscriptPanelItem rebuilds object-type options from config"
```

---

## Task 11: Settings modal shell + toolbar gear icon entry point

**Files:**
- Create: `src/components/Settings/SettingsModal.tsx`
- Create: `src/components/Settings/index.ts`
- Modify: `src/components/Toolbar/Toolbar.tsx` (add gear icon)
- Modify: `src/App.tsx` (mount the modal at app root)

This task adds the modal shell with backdrop, esc-to-close, and the Apply/Cancel button bar. The modal's body is a placeholder until Tasks 12–16 add the sidebar, type editor, and subtype editor.

- [ ] **Step 1: Create `src/components/Settings/SettingsModal.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import type { StyleConfig } from '../../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const committedConfig = useDiagramStore((s) => s.styleConfig);
  const replaceStyleConfig = useDiagramStore((s) => s.replaceStyleConfig);

  // Local working copy. Seeded on each open. Apply commits; Cancel discards.
  const [workingConfig, setWorkingConfig] = useState<StyleConfig>(committedConfig);

  // Reseed whenever the modal opens.
  useEffect(() => {
    if (open) {
      setWorkingConfig(committedConfig);
    }
  }, [open, committedConfig]);

  // Esc cancels.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleApply = () => {
    replaceStyleConfig(workingConfig);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl mx-4 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.sidebar.bg, maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: theme.sidebar.border }}
        >
          <h2 className="text-lg font-semibold" style={{ color: theme.sidebar.text }}>
            Element Style Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Close settings"
          >
            <X size={18} style={{ color: theme.sidebar.muted }} />
          </button>
        </div>

        {/* Body — placeholder until Tasks 12–16 fill this in. */}
        <div className="flex-1 overflow-hidden flex" style={{ color: theme.sidebar.text }}>
          <div className="p-6 text-sm" style={{ color: theme.sidebar.muted }}>
            Settings UI under construction. Working config snapshot of {Object.keys(workingConfig.argumentTypes).length} argument types and {workingConfig.otherSubtypes.length} subtypes is staged.
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t flex justify-end gap-2"
          style={{ borderColor: theme.sidebar.border }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{ backgroundColor: theme.sidebar.surface, color: theme.sidebar.text }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: theme.sidebar.accent, color: theme.colors.void[950] }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/Settings/index.ts`**

```typescript
export { SettingsModal } from './SettingsModal';
```

- [ ] **Step 3: Add the gear icon to the Toolbar**

In `src/components/Toolbar/Toolbar.tsx`, add `Settings` to the lucide-react imports (alphabetical order):

```typescript
import {
  Save,
  // ...existing imports
  Settings,
  // ...rest
} from 'lucide-react';
```

Add a new prop for opening settings to `ToolbarProps`:

```typescript
interface ToolbarProps {
  onLoadTranscript: () => void;
  transcriptPanelOpen: boolean;
  onToggleTranscriptPanel: () => void;
  onOpenSettings: () => void;
}
```

Destructure it:

```typescript
export function Toolbar({ onLoadTranscript, transcriptPanelOpen, onToggleTranscriptPanel, onOpenSettings }: ToolbarProps) {
```

Add a gear button next to the existing icon buttons. Find an appropriate spot (near the About button is reasonable). Pattern to follow — copy the structure of an existing icon button:

```tsx
<Tooltip label="Element styles">
  <button
    onClick={onOpenSettings}
    className="p-2 rounded hover:bg-white/10"
    aria-label="Open element style settings"
  >
    <Settings size={18} style={{ color: theme.toolbar.muted }} />
  </button>
</Tooltip>
```

(Use whatever className / style pattern matches the surrounding icon buttons in the existing toolbar — copy from a neighbor if `theme.toolbar.muted` doesn't match.)

- [ ] **Step 4: Mount the modal in App.tsx**

In `src/App.tsx`, add state for the modal:

```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
```

Add the import:

```typescript
import { SettingsModal } from './components/Settings';
```

Pass `onOpenSettings={() => setSettingsOpen(true)}` to the `<Toolbar>` JSX. Mount the modal near the existing `<RecoveryPrompt>`:

```tsx
<SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
```

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`. Click the gear icon. Modal opens with placeholder body and Apply/Cancel buttons. Esc closes. Backdrop click closes. Apply commits (no-op since no edits) and closes. The toolbar should still look reasonable — see `Risks` in the spec re: toolbar overload.

- [ ] **Step 7: Commit**

```bash
git add src/components/Settings/SettingsModal.tsx src/components/Settings/index.ts src/components/Toolbar/Toolbar.tsx src/App.tsx
git commit -m "feat(styles): add SettingsModal shell + toolbar gear entry point"
```

---

## Task 12: Settings sidebar with section list + initial selection

**Files:**
- Create: `src/components/Settings/SettingsSidebar.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx` (mount sidebar, manage selection state)

The sidebar lists all editable items grouped by section: Arguments (6), Supports (3), Subtypes (1 special entry). Selection state lives in the modal; default is the first argument type (`Data`).

- [ ] **Step 1: Define the selection type in the modal**

In `SettingsModal.tsx`, add this type near the top of the file (after imports):

```typescript
export type SettingsSelection =
  | { kind: 'argument'; type: 'data' | 'claim' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal' }
  | { kind: 'support';  type: 'action' | 'question' | 'other' }
  | { kind: 'subtypes' };
```

Add selection state:

```typescript
const [selection, setSelection] = useState<SettingsSelection>({ kind: 'argument', type: 'data' });

// Reset selection on each open.
useEffect(() => {
  if (open) {
    setSelection({ kind: 'argument', type: 'data' });
  }
}, [open]);
```

- [ ] **Step 2: Create `src/components/Settings/SettingsSidebar.tsx`**

```typescript
import type { StyleConfig } from '../../types';
import type { SettingsSelection } from './SettingsModal';
import { theme } from '../../utils/theme';

interface SettingsSidebarProps {
  config: StyleConfig;
  selection: SettingsSelection;
  onSelect: (sel: SettingsSelection) => void;
}

const ARGUMENT_TYPES = ['data', 'claim', 'warrant', 'backing', 'qualifier', 'rebuttal'] as const;
const SUPPORT_TYPES = ['action', 'question', 'other'] as const;

export function SettingsSidebar({ config, selection, onSelect }: SettingsSidebarProps) {
  const isSelected = (sel: SettingsSelection): boolean => {
    if (sel.kind !== selection.kind) return false;
    if (sel.kind === 'subtypes') return true;
    if (sel.kind === 'argument' && selection.kind === 'argument') return sel.type === selection.type;
    if (sel.kind === 'support'  && selection.kind === 'support')  return sel.type === selection.type;
    return false;
  };

  const rowClass = (active: boolean) =>
    `w-full text-left px-3 py-2 text-sm rounded ${active ? '' : 'hover:bg-white/5'}`;

  const rowStyle = (active: boolean) => ({
    backgroundColor: active ? theme.sidebar.surfaceHover : 'transparent',
    color: active ? theme.sidebar.text : theme.sidebar.textSecondary,
  });

  return (
    <div
      className="w-56 border-r overflow-y-auto py-4"
      style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.bg }}
    >
      <div className="px-3 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Arguments
        </span>
      </div>
      {ARGUMENT_TYPES.map((type) => {
        const sel: SettingsSelection = { kind: 'argument', type };
        const active = isSelected(sel);
        return (
          <button
            key={type}
            onClick={() => onSelect(sel)}
            className={rowClass(active)}
            style={rowStyle(active)}
          >
            {config.argumentTypes[type].label}
          </button>
        );
      })}

      <div className="px-3 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Supports
        </span>
      </div>
      {SUPPORT_TYPES.map((type) => {
        const sel: SettingsSelection = { kind: 'support', type };
        const active = isSelected(sel);
        return (
          <button
            key={type}
            onClick={() => onSelect(sel)}
            className={rowClass(active)}
            style={rowStyle(active)}
          >
            {config.supportTypes[type].label}
          </button>
        );
      })}

      <div className="px-3 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Other
        </span>
      </div>
      {(() => {
        const sel: SettingsSelection = { kind: 'subtypes' };
        const active = isSelected(sel);
        return (
          <button onClick={() => onSelect(sel)} className={rowClass(active)} style={rowStyle(active)}>
            Other-Support Subtypes
          </button>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 3: Mount the sidebar in the modal**

Replace the placeholder `<div>` body in `SettingsModal.tsx` with:

```tsx
<div className="flex-1 overflow-hidden flex" style={{ color: theme.sidebar.text }}>
  <SettingsSidebar
    config={workingConfig}
    selection={selection}
    onSelect={setSelection}
  />
  <div className="flex-1 p-6 overflow-y-auto">
    {/* Right pane — populated in Tasks 13–16 */}
    <div className="text-sm" style={{ color: theme.sidebar.muted }}>
      Editor for: {selection.kind === 'subtypes' ? 'subtypes' : `${selection.kind}: ${selection.type}`} (UI in upcoming tasks)
    </div>
  </div>
</div>
```

Add the import:

```typescript
import { SettingsSidebar } from './SettingsSidebar';
```

- [ ] **Step 4: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Browser: open settings, see sidebar with `Data` highlighted by default. Click each row → selection updates. Reopening the modal resets selection to `Data`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Settings/SettingsSidebar.tsx src/components/Settings/SettingsModal.tsx
git commit -m "feat(styles): add SettingsSidebar with default Data selection"
```

---

## Task 13: TypeStyleEditor — controls for label, border style, border shape, background

**Files:**
- Create: `src/components/Settings/TypeStyleEditor.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx` (mount editor for argument/support selections)

Renders the four controls for one selected argument or support type. Edits update the modal's `workingConfig`. Text input commits on `onBlur`; color picker commits on `onChange`. Includes a per-type "Reset" link.

- [ ] **Step 1: Create `src/components/Settings/TypeStyleEditor.tsx`**

```typescript
import { useState, useEffect } from 'react';
import type { StyleConfig, TypeStyle, BorderStyle, BorderShape } from '../../types';
import { theme } from '../../utils/theme';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';

interface TypeStyleEditorProps {
  kind: 'argument' | 'support';
  typeKey: string; // e.g. 'claim' or 'action'
  config: StyleConfig;
  onChange: (next: StyleConfig) => void;
}

const BORDER_STYLES: BorderStyle[] = ['solid', 'dashed', 'dotted'];
const BORDER_SHAPES: BorderShape[] = ['rectangle', 'rounded', 'ellipse'];

export function TypeStyleEditor({ kind, typeKey, config, onChange }: TypeStyleEditorProps) {
  const current: TypeStyle =
    kind === 'argument'
      ? config.argumentTypes[typeKey as keyof StyleConfig['argumentTypes']]
      : config.supportTypes[typeKey as keyof StyleConfig['supportTypes']];

  // Local label state for onBlur commit.
  const [labelDraft, setLabelDraft] = useState(current.label);
  useEffect(() => {
    setLabelDraft(current.label);
  }, [current.label]);

  const updateField = (patch: Partial<TypeStyle>) => {
    if (kind === 'argument') {
      const k = typeKey as keyof StyleConfig['argumentTypes'];
      onChange({
        ...config,
        argumentTypes: { ...config.argumentTypes, [k]: { ...current, ...patch } },
      });
    } else {
      const k = typeKey as keyof StyleConfig['supportTypes'];
      onChange({
        ...config,
        supportTypes: { ...config.supportTypes, [k]: { ...current, ...patch } },
      });
    }
  };

  const handleReset = () => {
    const defaults = createCurrentDefaults();
    if (kind === 'argument') {
      const k = typeKey as keyof StyleConfig['argumentTypes'];
      onChange({
        ...config,
        argumentTypes: { ...config.argumentTypes, [k]: defaults.argumentTypes[k] },
      });
    } else {
      const k = typeKey as keyof StyleConfig['supportTypes'];
      onChange({
        ...config,
        supportTypes: { ...config.supportTypes, [k]: defaults.supportTypes[k] },
      });
    }
  };

  const fieldStyle = {
    backgroundColor: theme.sidebar.surface,
    color: theme.sidebar.text,
    border: `1px solid ${theme.sidebar.border}`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          {kind === 'argument' ? 'Argument Type' : 'Support Type'}: {typeKey}
        </h3>
        <button
          onClick={handleReset}
          className="text-xs underline"
          style={{ color: theme.sidebar.muted }}
        >
          Reset
        </button>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Display label</span>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => updateField({ label: labelDraft })}
          className="mt-1 w-full px-3 py-2 text-sm rounded"
          style={fieldStyle}
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Border style</span>
        <select
          value={current.borderStyle}
          onChange={(e) => updateField({ borderStyle: e.target.value as BorderStyle })}
          className="mt-1 w-full px-3 py-2 text-sm rounded"
          style={fieldStyle}
        >
          {BORDER_STYLES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Border shape</span>
        <select
          value={current.borderShape}
          onChange={(e) => updateField({ borderShape: e.target.value as BorderShape })}
          className="mt-1 w-full px-3 py-2 text-sm rounded"
          style={fieldStyle}
        >
          {BORDER_SHAPES.map((s) => (
            <option key={s} value={s}>
              {s === 'rounded' ? 'Rounded rectangle' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Background color</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={current.backgroundColor}
            onChange={(e) => updateField({ backgroundColor: e.target.value })}
            className="w-10 h-10 rounded cursor-pointer"
            style={{ backgroundColor: 'transparent' }}
          />
          <input
            type="text"
            value={current.backgroundColor}
            onChange={(e) => updateField({ backgroundColor: e.target.value })}
            className="px-3 py-2 text-sm rounded font-mono"
            style={{ ...fieldStyle, width: '100px' }}
          />
        </div>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the modal for argument/support selections**

In `SettingsModal.tsx`, replace the right-pane placeholder:

```tsx
<div className="flex-1 p-6 overflow-y-auto">
  {selection.kind === 'argument' && (
    <TypeStyleEditor
      kind="argument"
      typeKey={selection.type}
      config={workingConfig}
      onChange={setWorkingConfig}
    />
  )}
  {selection.kind === 'support' && (
    <TypeStyleEditor
      kind="support"
      typeKey={selection.type}
      config={workingConfig}
      onChange={setWorkingConfig}
    />
  )}
  {selection.kind === 'subtypes' && (
    <div className="text-sm" style={{ color: theme.sidebar.muted }}>Subtype editor — Task 15</div>
  )}
</div>
```

Add the import:

```typescript
import { TypeStyleEditor } from './TypeStyleEditor';
```

- [ ] **Step 3: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Open Settings → Claim. Edit the label, blur the input — `workingConfig` updates (verify by clicking another row and back: label persists). Click Apply → main canvas now shows the renamed label everywhere. Cancel discards.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/TypeStyleEditor.tsx src/components/Settings/SettingsModal.tsx
git commit -m "feat(styles): add TypeStyleEditor for argument/support types"
```

---

## Task 14: StylePreview pane with contributor toggle

**Files:**
- Create: `src/components/Settings/StylePreview.tsx`
- Modify: `src/components/Settings/TypeStyleEditor.tsx` (mount preview)

Renders a small Konva `<Stage>` showing the actual `ArgumentShape` or `SupportShape` for a representative element. A contributor toggle above lets the user see how each contributor overlay composes with the chosen type style.

- [ ] **Step 1: Create `src/components/Settings/StylePreview.tsx`**

```typescript
import { useState } from 'react';
import { Stage, Layer } from 'react-konva';
import type { StyleConfig, ArgumentElement, SupportElement, ContributorType, SupportContributor } from '../../types';
import { ArgumentShape } from '../Canvas/shapes/ArgumentShape';
import { SupportShape } from '../Canvas/shapes/SupportShape';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';

interface StylePreviewProps {
  kind: 'argument' | 'support';
  typeKey: string;
  config: StyleConfig;
}

const ARGUMENT_CONTRIBUTORS: ContributorType[] = ['given', 'student', 'teacher', 'joint', 'implicit'];
const SUPPORT_CONTRIBUTORS: SupportContributor[] = ['teacher', 'student'];

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 140;
const ELEMENT_WIDTH = 180;
const ELEMENT_HEIGHT = 80;

export function StylePreview({ kind, typeKey, config }: StylePreviewProps) {
  const [argContributor, setArgContributor] = useState<ContributorType>('given');
  const [supContributor, setSupContributor] = useState<SupportContributor>('teacher');

  // Replace the live store config briefly so the preview shapes resolve against `config`,
  // not the committed store. Done by passing config down via a temporary store-replace — but
  // that mutates real state. Instead: temporarily swap the store using its own setter.
  //
  // Simpler approach: shape components read styleConfig from the store. We can't override
  // per-render without a context. Solution: call replaceStyleConfig with the working config
  // when the modal opens, and restore on close. BUT — the spec is explicit that the canvas
  // BEHIND the modal stays on committed config until Apply.
  //
  // Practical solution for the preview: render a self-contained mini ArgumentShape that
  // reads from `config` directly, NOT from the store. We do that by inlining a lightweight
  // version of the shape rendering driven by resolveArgumentStyle(el, config) directly.
  // Since the preview is fixed-content, we render it manually here using the resolver
  // output, not the full ArgumentShape component.

  // For Task 14 simplicity, render a manual preview using react-konva primitives driven by
  // the resolver. Anything that drifts from canvas reality must be addressed by the
  // verification step in Task 22.

  return (
    <PreviewImpl
      kind={kind}
      typeKey={typeKey}
      config={config}
      contributor={kind === 'argument' ? argContributor : supContributor}
      onContributorChange={(c) => kind === 'argument' ? setArgContributor(c as ContributorType) : setSupContributor(c as SupportContributor)}
    />
  );
}

// Internal: contributor toggle + Konva stage rendering the resolved style.
import { Group, Rect, Ellipse, Text, Line } from 'react-konva';
import { resolveArgumentStyle, resolveSupportStyle, dashArrayForBorderStyle } from '../../utils/styleResolver';

interface PreviewImplProps {
  kind: 'argument' | 'support';
  typeKey: string;
  config: StyleConfig;
  contributor: string;
  onContributorChange: (c: string) => void;
}

function PreviewImpl({ kind, typeKey, config, contributor, onContributorChange }: PreviewImplProps) {
  const contributors = kind === 'argument' ? ARGUMENT_CONTRIBUTORS : SUPPORT_CONTRIBUTORS;

  // Build a representative element for resolving.
  const resolved = (() => {
    if (kind === 'argument') {
      const el = {
        id: 'preview',
        type: 'argument',
        argumentType: typeKey,
        contributor: contributor as ContributorType,
        label: 'Sample',
        content: 'Sample content',
        position: { x: 0, y: 0 },
        size: { width: ELEMENT_WIDTH, height: ELEMENT_HEIGHT },
      } as ArgumentElement;
      return resolveArgumentStyle(el, config);
    } else {
      const el = {
        id: 'preview',
        type: 'support',
        supportType: typeKey,
        contributor: contributor as SupportContributor,
        content: 'Sample',
        position: { x: 0, y: 0 },
        size: { width: ELEMENT_WIDTH, height: ELEMENT_HEIGHT },
      } as SupportElement;
      return resolveSupportStyle(el, config);
    }
  })();

  const dashArray = dashArrayForBorderStyle(resolved.borderStyle);
  const x = (PREVIEW_WIDTH - ELEMENT_WIDTH) / 2;
  const y = (PREVIEW_HEIGHT - ELEMENT_HEIGHT) / 2;

  return (
    <div className="mt-6 space-y-2">
      <div className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Preview</div>

      {/* Contributor toggle */}
      <div className="flex flex-wrap gap-1">
        {contributors.map((c) => (
          <button
            key={c}
            onClick={() => onContributorChange(c)}
            className="px-2 py-1 text-xs rounded"
            style={{
              backgroundColor: contributor === c ? theme.sidebar.accent : theme.sidebar.surface,
              color: contributor === c ? theme.colors.void[950] : theme.sidebar.text,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Konva stage */}
      <div style={{ border: `1px solid ${theme.sidebar.border}`, borderRadius: 6, backgroundColor: '#FFFFFF', display: 'inline-block' }}>
        <Stage width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT}>
          <Layer>
            <Group x={x} y={y}>
              {resolved.borderShape === 'cloud' ? (
                // Simplified cloud preview — render an ellipse outline as a stand-in
                // and let the verification step confirm the real ArgumentShape on the canvas.
                <Ellipse
                  x={ELEMENT_WIDTH / 2}
                  y={ELEMENT_HEIGHT / 2}
                  radiusX={ELEMENT_WIDTH / 2}
                  radiusY={ELEMENT_HEIGHT / 2}
                  fill={resolved.backgroundColor}
                  stroke={resolved.borderColor}
                  strokeWidth={resolved.borderWidth}
                  dash={dashArray}
                />
              ) : resolved.borderShape === 'ellipse' ? (
                <Ellipse
                  x={ELEMENT_WIDTH / 2}
                  y={ELEMENT_HEIGHT / 2}
                  radiusX={ELEMENT_WIDTH / 2}
                  radiusY={ELEMENT_HEIGHT / 2}
                  fill={resolved.backgroundColor}
                  stroke={resolved.borderColor}
                  strokeWidth={resolved.borderWidth}
                  dash={dashArray}
                />
              ) : (
                <Rect
                  width={ELEMENT_WIDTH}
                  height={ELEMENT_HEIGHT}
                  fill={resolved.backgroundColor}
                  stroke={resolved.borderColor}
                  strokeWidth={resolved.borderWidth}
                  dash={dashArray}
                  cornerRadius={resolved.borderShape === 'rounded' ? 8 : 0}
                />
              )}
              <Text
                x={10}
                y={10}
                width={ELEMENT_WIDTH - 20}
                text={kind === 'argument' ? config.argumentTypes[typeKey as keyof StyleConfig['argumentTypes']].label : config.supportTypes[typeKey as keyof StyleConfig['supportTypes']].label}
                fontSize={14}
                fontStyle="bold"
                textDecoration="underline"
                fill={resolved.borderColor}
              />
              <Text
                x={10}
                y={32}
                width={ELEMENT_WIDTH - 20}
                text="Sample content"
                fontSize={12}
                fill="#000000"
                wrap="word"
              />
            </Group>
          </Layer>
        </Stage>
      </div>
      {resolved.borderShape === 'cloud' && (
        <div className="text-xs italic" style={{ color: theme.sidebar.muted }}>
          (Cloud shape — implicit contributor renders as a cloud on the canvas; preview shows ellipse stand-in.)
        </div>
      )}
    </div>
  );
}
```

The preview is a simplified Konva render driven by the resolver — not the full `ArgumentShape` component, because that component reads `styleConfig` from the store and we want to preview against the *working* config without mutating store state. The fidelity tradeoff: cloud shape is approximated as an ellipse with an italic note. Acceptable per the trade-offs we're making to keep the working-copy state model clean.

Remove the unused `ArgumentShape` and `SupportShape` imports from the file (left over from the earlier sketch in the comments).

- [ ] **Step 2: Mount the preview in `TypeStyleEditor`**

In `src/components/Settings/TypeStyleEditor.tsx`, add the import:

```typescript
import { StylePreview } from './StylePreview';
```

At the bottom of the editor's returned JSX (after the background-color label):

```tsx
<StylePreview kind={kind} typeKey={typeKey} config={config} />
```

- [ ] **Step 3: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Open Settings → Claim. The preview pane shows a sample rectangle with the configured style. Click `student` → preview updates to dashed blue. Click `implicit` → preview shows ellipse stand-in with the italic disclaimer. Change the background color in the controls → preview re-renders immediately.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/StylePreview.tsx src/components/Settings/TypeStyleEditor.tsx
git commit -m "feat(styles): add StylePreview pane with contributor toggle"
```

---

## Task 15: SubtypeListEditor — add / rename / remove / reorder + delete confirmation

**Files:**
- Create: `src/components/Settings/SubtypeListEditor.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx` (mount editor for subtypes selection)

The subtype editor lists subtypes as reorderable rows with a label input (commit on blur), a delete button (with in-use confirmation), and an "+ Add subtype" button. Reordering uses native HTML5 drag-and-drop via the row's drag handle. Includes a "Reset subtypes to defaults" button that's separate from the modal-footer "Reset all type styles".

- [ ] **Step 1: Create `src/components/Settings/SubtypeListEditor.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import type { StyleConfig, OtherSubtype } from '../../types';
import { useDiagramStore } from '../../store';
import { isSupportElement } from '../../types';
import { theme } from '../../utils/theme';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';

interface SubtypeListEditorProps {
  config: StyleConfig;
  onChange: (next: StyleConfig) => void;
}

export function SubtypeListEditor({ config, onChange }: SubtypeListEditorProps) {
  const elements = useDiagramStore((s) => s.elements);

  const updateSubtypes = (next: OtherSubtype[]) => {
    onChange({ ...config, otherSubtypes: next });
  };

  const handleAdd = () => {
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `subtype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    updateSubtypes([...config.otherSubtypes, { id, label: 'New subtype' }]);
  };

  const handleRename = (id: string, label: string) => {
    updateSubtypes(config.otherSubtypes.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const handleRemove = (id: string) => {
    const useCount = elements.filter((el) => isSupportElement(el) && el.subtype === id).length;
    if (useCount > 0) {
      const ok = window.confirm(
        `This subtype is used by ${useCount} element${useCount === 1 ? '' : 's'}. Deleting it will leave them with no assigned subtype. Continue?`
      );
      if (!ok) return;
    }
    updateSubtypes(config.otherSubtypes.filter((s) => s.id !== id));
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const next = [...config.otherSubtypes];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateSubtypes(next);
  };

  const handleResetSubtypes = () => {
    const ok = window.confirm(
      'Replace your custom subtypes with the six defaults? Elements using removed subtypes will be orphaned.'
    );
    if (!ok) return;
    updateSubtypes(createCurrentDefaults().otherSubtypes);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          Other-Support Subtypes
        </h3>
        <button onClick={handleResetSubtypes} className="text-xs underline" style={{ color: theme.sidebar.muted }}>
          Reset subtypes to defaults
        </button>
      </div>

      <div className="text-xs" style={{ color: theme.sidebar.muted }}>
        Subtypes appear in the palette dropdown and the transcript-line object-type selector. Renaming a subtype updates every element that uses it. Deleting one orphans those elements.
      </div>

      <div className="space-y-1">
        {config.otherSubtypes.map((s, idx) => (
          <SubtypeRow
            key={s.id}
            subtype={s}
            index={idx}
            useCount={elements.filter((el) => isSupportElement(el) && el.subtype === s.id).length}
            onRename={handleRename}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded"
        style={{ backgroundColor: theme.sidebar.surface, color: theme.sidebar.text }}
      >
        <Plus size={14} /> Add subtype
      </button>
    </div>
  );
}

interface SubtypeRowProps {
  subtype: OtherSubtype;
  index: number;
  useCount: number;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function SubtypeRow({ subtype, index, useCount, onRename, onRemove, onReorder }: SubtypeRowProps) {
  const [labelDraft, setLabelDraft] = useState(subtype.label);
  const dragSourceIndex = useRef<number | null>(null);

  useEffect(() => {
    setLabelDraft(subtype.label);
  }, [subtype.label]);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded"
      style={{ backgroundColor: theme.sidebar.surface }}
      draggable
      onDragStart={(e) => {
        dragSourceIndex.current = index;
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = dragSourceIndex.current;
        if (from !== null && from !== index) onReorder(from, index);
        dragSourceIndex.current = null;
      }}
    >
      <GripVertical size={14} style={{ color: theme.sidebar.muted, cursor: 'grab' }} />
      <input
        type="text"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={() => {
          if (labelDraft !== subtype.label) onRename(subtype.id, labelDraft);
        }}
        className="flex-1 px-2 py-1 text-sm rounded"
        style={{
          backgroundColor: theme.sidebar.bg,
          color: theme.sidebar.text,
          border: `1px solid ${theme.sidebar.border}`,
        }}
      />
      {useCount > 0 && (
        <span className="text-xs" style={{ color: theme.sidebar.muted }}>
          {useCount} use{useCount === 1 ? '' : 's'}
        </span>
      )}
      <button
        onClick={() => onRemove(subtype.id)}
        className="p-1 rounded hover:bg-white/10"
        aria-label={`Remove subtype ${subtype.label}`}
      >
        <Trash2 size={14} style={{ color: theme.sidebar.muted }} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount in the modal**

In `SettingsModal.tsx`, replace the subtype-selection placeholder:

```tsx
{selection.kind === 'subtypes' && (
  <SubtypeListEditor config={workingConfig} onChange={setWorkingConfig} />
)}
```

Add the import:

```typescript
import { SubtypeListEditor } from './SubtypeListEditor';
```

- [ ] **Step 3: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Open Settings → Other-Support Subtypes. The six defaults appear with drag handles. Try:
- Rename one (blur to commit)
- Add a new subtype → "New subtype" appears at the bottom
- Drag a row to reorder
- Delete an unused subtype → no confirm
- Create a "Other" support element using a subtype, then try to delete that subtype → confirmation dialog with use count
- Click "Reset subtypes to defaults" → confirmation, then six defaults restored

Apply commits the changes.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings/SubtypeListEditor.tsx src/components/Settings/SettingsModal.tsx
git commit -m "feat(styles): add SubtypeListEditor with drag-reorder and delete confirmation"
```

---

## Task 16: Modal-footer "Reset all type styles" (scoped — does not touch subtypes)

**Files:**
- Modify: `src/components/Settings/SettingsModal.tsx`

Adds a "Reset all type styles" button in the modal footer. Confirms before resetting. Per the spec, this scope is **argument types + support types only** — `otherSubtypes` is preserved. The subtype-only reset has its own button inside the SubtypeListEditor (Task 15).

- [ ] **Step 1: Add the reset handler and button to the modal footer**

In `SettingsModal.tsx`, add the imports:

```typescript
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';
```

Add the handler inside the component:

```typescript
const handleResetAllTypeStyles = () => {
  const ok = window.confirm(
    'Reset all argument and support type styles to defaults? This does NOT affect your custom subtypes.'
  );
  if (!ok) return;
  const defaults = createCurrentDefaults();
  setWorkingConfig({
    ...workingConfig,
    argumentTypes: defaults.argumentTypes,
    supportTypes:  defaults.supportTypes,
    // otherSubtypes intentionally preserved
  });
};
```

Add the button to the footer, before the existing Cancel/Apply buttons:

```tsx
<div className="px-6 py-3 border-t flex justify-between items-center" style={{ borderColor: theme.sidebar.border }}>
  <button
    onClick={handleResetAllTypeStyles}
    className="text-xs underline"
    style={{ color: theme.sidebar.muted }}
  >
    Reset all type styles
  </button>
  <div className="flex gap-2">
    <button
      onClick={onClose}
      className="px-4 py-2 text-sm rounded-lg"
      style={{ backgroundColor: theme.sidebar.surface, color: theme.sidebar.text }}
    >
      Cancel
    </button>
    <button
      onClick={handleApply}
      className="px-4 py-2 text-sm rounded-lg font-medium"
      style={{ backgroundColor: theme.sidebar.accent, color: theme.colors.void[950] }}
    >
      Apply
    </button>
  </div>
</div>
```

- [ ] **Step 2: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Open Settings, customize a few argument/support styles AND add a custom subtype. Click "Reset all type styles" → confirmation. After reset, type styles revert to defaults and the custom subtype is still present. Apply → main canvas reflects.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/SettingsModal.tsx
git commit -m "feat(styles): add scoped 'Reset all type styles' (preserves subtypes)"
```

---

## Task 17: Orphan visual marker on canvas

**Files:**
- Modify: `src/components/Canvas/shapes/SupportShape.tsx`
- Modify: `src/components/Canvas/shapes/TeacherSupportShape.tsx`

When an element's `subtype` references an id no longer in `config.otherSubtypes`, render a small warning icon (⚠) at the top-right of the bounding box and use the placeholder label `[deleted subtype]` for the header text. Border/dash/shape/color stay unchanged — no visual collision with student-dashed, joint dot-dash, implicit cloud, or selection highlight.

- [ ] **Step 1: Compute orphan state in `SupportShape`**

In `src/components/Canvas/shapes/SupportShape.tsx`, after the `styleConfig` and `style` computations:

```typescript
const isOrphan = element.supportType === 'other' && element.subtype !== undefined &&
  !styleConfig.otherSubtypes.some((s) => s.id === element.subtype);

const subtypeLabel = element.supportType === 'other' && element.subtype
  ? (styleConfig.otherSubtypes.find((s) => s.id === element.subtype)?.label ?? '[deleted subtype]')
  : null;
```

Update the `headerLabel` derivation from Task 6 to use `subtypeLabel`:

```typescript
const headerLabel =
  element.supportType === 'action' ? '' :
  element.supportType === 'question' ? `[${contributorLabel}] ${supportTypeLabel}` :
  `[${contributorLabel}] ${subtypeLabel ?? supportTypeLabel}`;
```

- [ ] **Step 2: Render warning marker when orphan**

Inside the returned `<Group>`, after the header text, add a conditional warning glyph at the top-right:

```tsx
{isOrphan && (
  <Text
    x={size.width - 16}
    y={4}
    text="⚠"
    fontSize={14}
    fill="#CC0000"
  />
)}
```

- [ ] **Step 3: Apply the same orphan logic to `TeacherSupportShape`**

In `src/components/Canvas/shapes/TeacherSupportShape.tsx`, add the same `isOrphan` computation (using its `element.subtype` field — `TeacherSupportElement` has the same field shape as `SupportElement`'s subtype). Render the same `⚠` glyph when orphaned.

- [ ] **Step 4: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Browser test:
1. Add an "Other" support element using subtype "Displays".
2. Open Settings → Subtypes → delete "Displays" → confirm.
3. Apply.
4. The element on the canvas now shows `[T] [deleted subtype]` in its header and a red ⚠ icon at top-right.
5. Border, dash, shape, color all unchanged — no collisions.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/SupportShape.tsx src/components/Canvas/shapes/TeacherSupportShape.tsx
git commit -m "feat(styles): orphan warning marker for deleted subtypes"
```

---

## Task 18: Properties panel orphan error state for subtype dropdown

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`

When the selected element's subtype id doesn't exist in `styleConfig.otherSubtypes`, the dropdown shows `"[Deleted Subtype — pick a new one]"` as the current value in red text, forcing the user to pick a valid subtype.

- [ ] **Step 1: Compute orphan state for the selected support element**

In `PropertiesPanel.tsx`, near the existing logic that handles support elements, add:

```typescript
const isOrphanedSubtype =
  selectedElement &&
  isSupportElement(selectedElement) &&
  selectedElement.supportType === 'other' &&
  selectedElement.subtype !== undefined &&
  !styleConfig.otherSubtypes.some((s) => s.id === selectedElement.subtype);
```

- [ ] **Step 2: Update the subtype dropdown rendering**

Find the existing subtype `<select>` (around lines 256–268 of `PropertiesPanel.tsx`). Modify it to show the orphan placeholder option when applicable:

```tsx
<select
  value={isOrphanedSubtype ? '__orphan__' : (selectedElement.subtype ?? '')}
  onChange={(e) => changeSupportType(selectedElement.id, 'other', e.target.value)}
  style={{
    color: isOrphanedSubtype ? '#CC0000' : undefined,
    // ...rest of existing styling
  }}
>
  {isOrphanedSubtype && (
    <option value="__orphan__" disabled>
      [Deleted Subtype — pick a new one]
    </option>
  )}
  {SUPPORT_SUBTYPES.map((opt) => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

When the user picks a valid subtype, `changeSupportType` runs with the chosen id and the orphan resolves.

- [ ] **Step 3: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Browser test: orphan an element (per Task 17 verification), then select it. Properties panel shows the dropdown with `[Deleted Subtype — pick a new one]` in red. Choose a valid subtype → orphan state clears (warning icon on canvas disappears).

- [ ] **Step 4: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(styles): Properties panel shows orphan error state for deleted subtypes"
```

---

## Task 19: SVG export uses resolver + handles orphan rendering

**Files:**
- Modify: `src/utils/svgExport.ts`

The SVG renderer is independent of the Konva shape components. It needs full plumbing of `styleConfig` through the resolver and per-shape rendering for the new shape options. The `support` element type (modern, non-deprecated) is currently NOT handled by `svgExport.ts` — only `argument`, `teacherSupport`, and `infoBox`. This task fixes that gap as well.

- [ ] **Step 1: Pull `styleConfig` into the export entry point**

In `src/utils/svgExport.ts`, change the `exportToSvg` signature to accept `styleConfig`:

```typescript
import type { DiagramElement, Connection, ArgumentElement, SupportElement, TeacherSupportElement, InfoBoxElement } from '../types';
import type { StyleConfig } from '../types';
import { resolveArgumentStyle, resolveSupportStyle, dashArrayForBorderStyle } from './styleResolver';

export function exportToSvg(
  elements: DiagramElement[],
  connections: Connection[],
  styleConfig: StyleConfig,
  options: SvgExportOptions = {}
): string {
```

Update callers — find where `exportToSvg(elements, connections)` is called (likely in `Toolbar.tsx`) and add the third argument by reading from the store:

```typescript
const styleConfig = useDiagramStore.getState().styleConfig;
const svgContent = exportToSvg(elements, connections, styleConfig);
```

(If the existing call site already destructures `styleConfig` from the store, just pass it through.)

- [ ] **Step 2: Thread `styleConfig` into `renderElementSvg` and add `support` handling**

Replace the existing `renderElementSvg` with:

```typescript
function renderElementSvg(element: DiagramElement, offsetX: number, offsetY: number, styleConfig: StyleConfig): string {
  const x = element.position.x + offsetX;
  const y = element.position.y + offsetY;
  const { width, height } = element.size;

  if (element.type === 'argument') {
    return renderArgumentSvg(element as ArgumentElement, x, y, width, height, styleConfig);
  } else if (element.type === 'support') {
    return renderSupportSvg(element as SupportElement, x, y, width, height, styleConfig);
  } else if (element.type === 'teacherSupport') {
    return renderTeacherSupportSvg(element as TeacherSupportElement, x, y, width, height, styleConfig);
  } else if (element.type === 'infoBox') {
    return renderInfoBoxSvg(element as InfoBoxElement, x, y, width, height);
  }
  return '';
}
```

Update the loop that calls it (around line 47):

```typescript
elements.forEach((el) => {
  const svg = renderElementSvg(el, offsetX, offsetY, styleConfig);
  if (svg) svgContent.push(svg);
});
```

- [ ] **Step 3: Rewrite `renderArgumentSvg` to use the resolver**

Replace the existing `renderArgumentSvg` (around lines 79–158). Key change: use `resolveArgumentStyle` instead of inline contributor logic. Handle the new `borderShape === 'ellipse'` and `'rounded'` cases.

```typescript
function renderArgumentSvg(el: ArgumentElement, x: number, y: number, width: number, height: number, styleConfig: StyleConfig): string {
  const style = resolveArgumentStyle(el, styleConfig);
  const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
  const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';

  const padding = 10;
  const labelY = y + padding + 14;
  const contentY = y + padding + 30;

  // Image, label, content, attribution sections — preserve from existing implementation.
  // Only the SHAPE element changes based on style.borderShape.

  let shapeElement: string;
  if (style.borderShape === 'cloud') {
    // Approximate the cloud as a thick rounded rect for SVG; the canvas renders a true
    // cloud via Konva paths but exporting that is out of scope.
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" ry="20" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else if (style.borderShape === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    shapeElement = `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else {
    const rx = style.borderShape === 'rounded' ? 8 : 0;
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  }

  // Build label, content, attribution as before — copy from the existing implementation
  // and adjust positioning. Header label uses el.label (the per-element title like "Claim 1"),
  // not the type display label.
  const labelEl = `<text x="${x + padding}" y="${labelY}" class="label" fill="${style.borderColor}">${escapeXml(el.label)}</text>`;
  const contentEl = el.content
    ? `<text x="${x + padding}" y="${contentY}" class="content" fill="#000000">${escapeXml(el.content)}</text>`
    : '';
  // ...attribution and image elements preserved from existing implementation

  return `${shapeElement}\n${labelEl}\n${contentEl}`;
}
```

(Preserve the existing image / attribution rendering — they're not affected by styleConfig.)

Add an `escapeXml` helper if one doesn't exist in this file:

```typescript
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Add `renderSupportSvg`**

```typescript
function renderSupportSvg(el: SupportElement, x: number, y: number, width: number, height: number, styleConfig: StyleConfig): string {
  const style = resolveSupportStyle(el, styleConfig);
  const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
  const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';

  // Orphan detection
  const isOrphan = el.supportType === 'other' && el.subtype !== undefined &&
    !styleConfig.otherSubtypes.some((s) => s.id === el.subtype);
  const subtypeLabel = el.supportType === 'other' && el.subtype
    ? (styleConfig.otherSubtypes.find((s) => s.id === el.subtype)?.label ?? '[deleted subtype]')
    : null;
  const supportTypeLabel = styleConfig.supportTypes[el.supportType].label;
  const contributorLabel = el.contributor === 'teacher' ? 'T' : 'S';
  const headerText =
    el.supportType === 'action' ? '' :
    el.supportType === 'question' ? `[${contributorLabel}] ${supportTypeLabel}` :
    `[${contributorLabel}] ${subtypeLabel ?? supportTypeLabel}`;

  let shapeElement: string;
  if (style.borderShape === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    shapeElement = `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else {
    const rx = style.borderShape === 'rounded' ? 8 : 0;
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  }

  const headerEl = headerText
    ? `<text x="${x + 8}" y="${y + 18}" class="label" fill="${style.borderColor}" style="font-size: 10px;">${escapeXml(headerText)}</text>`
    : '';
  const contentEl = el.content
    ? `<text x="${x + 8}" y="${y + (headerText ? 32 : 20)}" class="content" fill="#000000">${escapeXml(el.content)}</text>`
    : '';
  const orphanMarker = isOrphan
    ? `<text x="${x + width - 16}" y="${y + 14}" fill="#CC0000" style="font-size: 14px;">⚠</text>`
    : '';

  return `${shapeElement}\n${headerEl}\n${contentEl}\n${orphanMarker}`;
}
```

- [ ] **Step 5: Update `renderTeacherSupportSvg` similarly**

Apply the same pattern — synthesize a teacher contributor for the resolver call:

```typescript
function renderTeacherSupportSvg(el: TeacherSupportElement, x: number, y: number, width: number, height: number, styleConfig: StyleConfig): string {
  const synthesized: SupportElement = { ...el, type: 'support', contributor: 'teacher' };
  const style = resolveSupportStyle(synthesized, styleConfig);
  // ...rest mirrors renderSupportSvg
}
```

- [ ] **Step 6: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Browser test:
1. Customize Claim → ellipse, light-blue bg.
2. Add a Claim element.
3. Export SVG. Open the file. Confirm the ellipse with light-blue fill appears.
4. Customize a subtype, create an "Other" element using it, delete the subtype to orphan it, export SVG. Confirm the ⚠ marker appears at top-right of that element.

- [ ] **Step 7: Commit**

```bash
git add src/utils/svgExport.ts src/components/Toolbar/Toolbar.tsx
git commit -m "feat(styles): SVG export uses resolver, supports new shapes, renders orphans"
```

---

## Task 20: `.diagramx` export propagates user-renamed labels

**Files:**
- Modify: `src/utils/diagramxExport.ts`

The `.diagramx` exporter is Level A MVP — exports everything as rectangles regardless of shape config. Per the spec, it should still propagate user-renamed type labels into the exported element text. Per-type shape/style is NOT exported.

- [ ] **Step 1: Find label-using sites in `diagramxExport.ts`**

Run: `grep -n "label\|argumentType\|supportType\|Claim\|Data\|Action" src/utils/diagramxExport.ts | head -30`. Locate the spot(s) where the element's type-derived label is emitted.

- [ ] **Step 2: Pass `styleConfig` through the exporter signature**

Find the `exportToDiagramx` function. Add `styleConfig` as a parameter:

```typescript
export function exportToDiagramx(
  elements: DiagramElement[],
  connections: Connection[],
  diagramName: string,
  styleConfig: StyleConfig,
): /* existing return type */ {
  // ...
}
```

(Update `downloadDiagramx` similarly if it's a wrapper.)

In the implementation, where labels are emitted, replace hardcoded type names (or `el.argumentType` strings) with config-derived values:

```typescript
const argumentLabel = isArgumentElement(el)
  ? styleConfig.argumentTypes[el.argumentType].label
  : null;
```

(The exact code shape depends on the exporter's internals — adjust to match.)

- [ ] **Step 3: Update the caller in `Toolbar.tsx`**

Find the `exportToDiagramx` call. Pass `styleConfig`:

```typescript
const styleConfig = useDiagramStore.getState().styleConfig;
exportToDiagramx(elements, connections, diagramName, styleConfig);
```

- [ ] **Step 4: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Customize "Claim" → "Conclusion". Export `.diagramx`. Open in DiagramMix (if available). Element labels should read "Conclusion" instead of "Claim".

If DiagramMix isn't available locally, inspect the `.diagramx` file (it's a binary plist; use `plutil -p` on macOS to read it) and verify the label string changed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/diagramxExport.ts src/components/Toolbar/Toolbar.tsx
git commit -m "feat(styles): .diagramx export propagates renamed type labels"
```

---

## Task 21: Autosave + RecoveryPrompt + App.tsx wire `styleConfig` through

**Files:**
- Modify: `src/hooks/useAutoSave.ts`
- Modify: `src/components/RecoveryPrompt.tsx` (no direct change — passes through props)
- Modify: `src/App.tsx` (handleRecover passes styleConfig)

Autosave currently saves `elements`, `connections`, and `transcript`. Add `styleConfig` so a customized diagram survives a crash and recovery.

- [ ] **Step 1: Add `styleConfig` to the autosave payload type and write**

In `src/hooks/useAutoSave.ts`, update the `AutoSaveData` interface:

```typescript
interface AutoSaveData {
  elements: ReturnType<typeof useDiagramStore.getState>['elements'];
  connections: ReturnType<typeof useDiagramStore.getState>['connections'];
  transcript: Transcript | null;
  styleConfig: StyleConfig;
  timestamp: number;
}
```

Add the import:

```typescript
import type { StyleConfig } from '../types';
```

In the autosave write block, include the field:

```typescript
const data: AutoSaveData = {
  elements: state.elements,
  connections: state.connections,
  transcript: state.transcript,
  styleConfig: state.styleConfig,
  timestamp: Date.now(),
};
```

The `getAutoSavedData` function (likely returning the parsed JSON) doesn't need changes — `data.styleConfig` is read by the consumer.

- [ ] **Step 2: Pass `styleConfig` on recovery in App.tsx**

In `src/App.tsx`, find `handleRecover` (around line 67):

```typescript
const handleRecover = useCallback(() => {
  const saved = getAutoSavedData();
  if (saved) {
    loadDiagram(saved.elements, saved.connections, undefined /* name: default */, saved.transcript);
    // ...
  }
}, [loadDiagram]);
```

Update to pass `styleConfig`:

```typescript
loadDiagram(saved.elements, saved.connections, undefined, saved.transcript, saved.styleConfig);
```

The fallback (older autosave entries with no `styleConfig`) is handled by `loadDiagram`'s `?? createV1_2_MigrationDefaults()` from Task 4.

- [ ] **Step 3: Verify build, lint, browser**

Run: `npm run build && npm run lint`. Browser test:
1. Open the app, customize Claim's bg color.
2. Wait for autosave (60s) — confirm via console log.
3. Refresh the page → recovery prompt → Recover → customized Claim color is preserved.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAutoSave.ts src/App.tsx
git commit -m "feat(styles): autosave + recovery preserve styleConfig"
```

---

## Task 22: End-to-end manual verification

**Files:** No code changes. This task executes the verification checklist from the spec ("Verification" section).

This is a single-session manual pass. If anything fails, file a follow-up bug rather than rolling back the feature.

- [ ] **Step 1: No-config visual parity**

Open an existing v1.2 saved diagram (one of the .json files in your archive). Every element should render identically to before this feature shipped. Side-by-side compare against a screenshot from a prior session if available.

- [ ] **Step 2: Save/load round-trip**

Create a v1.3 diagram with: 2 customized argument types (different shapes), 1 customized subtype, 1 element using each. Save → reload → confirm config and shapes match.

- [ ] **Step 3: Cross-version load**

Open a v1.2 file that has no `styleConfig`. Confirm defaults applied, no console errors, visually unchanged.

- [ ] **Step 4: Contributor overrides still win**

Set Claim's `borderShape` to `ellipse`. Create:
- A `student` claim → dashed ellipse ✓
- An `implicit` claim → cloud (shape override wins) ✓
- A `given` claim → ellipse with light-green tint (bg override wins) ✓
- A `joint` claim → dot-dash ellipse ✓
- A `teacher` claim → solid ellipse ✓

- [ ] **Step 5: Subtype lifecycle**

- Add a custom subtype "Hedging" → assigns UUID id ✓
- Create an "Other" element using "Hedging" ✓
- Delete "Hedging" from the subtype list → confirmation says "1 element" ✓
- Element on canvas shows ⚠ at top-right and `[T] [deleted subtype]` header ✓
- Properties panel for the element shows red "[Deleted Subtype — pick a new one]" ✓
- Pick "Displays" from the dropdown → ⚠ vanishes, header updates ✓

- [ ] **Step 6: Live preview accuracy**

Open Settings → Claim. Change borderShape to ellipse. Toggle through contributors in the preview pane:
- given → green-tint ellipse
- student → dashed blue ellipse
- teacher → solid red ellipse
- joint → dot-dash purple ellipse
- implicit → ellipse stand-in (with cloud-disclaimer note)

Apply, then create a Claim of each contributor on the canvas. Visual should match the preview (except cloud — which is a true cloud on canvas, not the ellipse stand-in).

- [ ] **Step 7: Undo/redo**

Open settings, change Claim's color, change Backing's borderShape, add a new subtype. Apply. Hit Cmd+Z **once** — all three changes revert together. Hit Cmd+Y, all three return.

- [ ] **Step 7a: Cancel discards**

Open modal, change Data's color, click Cancel. Change is gone. Canvas unaffected. No undo entry created (verified by Cmd+Z reverting an earlier element edit, not the cancelled config edit).

- [ ] **Step 7b: Subtype delete confirmation**

Add 3 elements with subtype "Displays". Open Settings → attempt to delete "Displays". Confirmation says "used by 3 elements". Cancel. Subtype still present.

- [ ] **Step 7c: Reset scoping**

Customize 2 type styles AND add a custom subtype. Apply. Reopen modal → "Reset all type styles" → confirm → type styles revert; custom subtype preserved. Then go to Subtypes tab → "Reset subtypes to defaults" → confirm → custom subtype removed; affected elements orphaned.

- [ ] **Step 8: Palette / Properties / Transcript labels**

Rename "Claim" → "Conclusion" via Settings. Apply. Confirm:
- Palette button shows "Conclusion" ✓
- Selecting a claim element, Properties dropdown shows "Conclusion" ✓
- TranscriptPanel object-type dropdown shows "Conclusion" ✓

- [ ] **Step 9: Export parity**

After customizing styles:
- **PDF:** Export. Open. Verify the customized shape/color appears (snapshot inheritance). ✓
- **SVG:** Export. Open the .svg file in browser/editor. Verify strokes, dash-arrays, fills, shape elements (`<rect>` vs `<ellipse>`). Confirm orphan ⚠ renders if applicable. ✓
- **`.diagramx`:** Export. Renamed labels appear; shape changes do not (acceptable per Level A). ✓

- [ ] **Step 10: Konva dash patterns at typical zoom**

Verify dashed (`[10, 5]`), dotted (`[2, 4]`), and dotdash (`[10, 5, 2, 5]`) render visually distinct at zoom levels 0.75x, 1.0x, 1.5x. Per CLAUDE.md "Critical Rendering Details" — dashed must look dashed, not dotted.

- [ ] **Step 11: Final lint + build**

Run: `npm run lint && npm run build`
Expected: both pass cleanly.

- [ ] **Step 12: Commit verification log**

If any issues found, file follow-ups; if all clean:

```bash
git commit --allow-empty -m "verify: configurable element styles end-to-end pass"
```

---

## Self-review notes

**Spec coverage check:**
- Data model (StyleConfig, TypeStyle, OtherSubtype) → Task 1
- Resolver (resolveArgument/resolveSupport, contributor overlays) → Task 3
- Renderer changes (ArgumentShape, SupportShape, TeacherSupportShape) → Tasks 5–7
- Label propagation (Palette, PropertiesPanel, TranscriptPanelItem) → Tasks 8–10
- Settings UI (modal, sidebar, type editor, preview, subtype editor, scoped resets) → Tasks 11–16
- Orphan handling (canvas marker + Properties error state) → Tasks 17–18
- Export paths (PDF=auto, SVG=plumbed, .diagramx=labels-only) → Tasks 19–20 (PDF needs no code change; verified in Task 22 step 9)
- Defaults (frozen v1.2 + current independent literal) → Task 2
- Migration (loadDiagram applies frozen defaults when absent) → Task 4
- Schema bump (1.2 → 1.3) → Task 4
- Autosave + recovery (styleConfig included) → Task 21
- Apply/Cancel modal pattern (single undo entry per session) → Tasks 11, 16
- Verification checklist → Task 22

All spec sections accounted for.
