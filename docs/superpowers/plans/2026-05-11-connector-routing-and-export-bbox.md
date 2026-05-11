# Connector Routing Improvements + Export Bounding-Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the routing improvements from `docs/superpowers/specs/2026-05-11-connector-routing-and-export-bbox-design.md`: Rule 1 (straight horizontal/vertical line for data→claim when target's center sits inside source's extent), Rule 2 (auto-aligned trunks + spread entries for convergent targets), edge-anchor handles, segment-midpoint discoverability dots, export bounding-box fix for PDF/PNG/SVG, and the contributor dropdown bug fix.

**Architecture:** Pure routing math added as new functions in `src/utils/orthogonalRouting.ts` (no React/Konva deps, fully unit-testable). UI affordances added to `src/components/Canvas/shapes/Arrow.tsx` reusing the existing segment-drag infrastructure. Schema additions to `src/types/connections.ts` are forward-compatible (optional fields). Export bounding-box logic lives in a new `src/utils/exportBounds.ts` shared by PDF, PNG, and SVG export paths.

**Tech Stack:** React 18, TypeScript, Konva.js (`react-konva`), Zustand store, Vitest for unit tests, ESLint, jsPDF for PDF export.

---

## Phase A — Bug fixes (independent, ship first)

### Task 1: Add `teacher` to argument-contributor dropdown

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx:10-15`

- [ ] **Step 1: Open `src/components/Properties/PropertiesPanel.tsx` and locate the `CONTRIBUTOR_TYPES` constant (top of file)**

Current value:

```ts
const CONTRIBUTOR_TYPES: { value: ContributorType; label: string }[] = [
  { value: 'given', label: 'Given' },
  { value: 'student', label: 'Student' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];
```

- [ ] **Step 2: Add the `teacher` entry between `given` and `student`**

```ts
const CONTRIBUTOR_TYPES: { value: ContributorType; label: string }[] = [
  { value: 'given', label: 'Given' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors. `'teacher'` is already a valid `ContributorType` value (`src/types/elements.ts:14`).

- [ ] **Step 4: Manual smoke test**

```
npm run dev
```

In the running app: create a Claim or Warrant element, open Properties Panel, verify the Contributor dropdown now lists "Teacher" and selecting it changes the rendering color (teacher color from `getArgumentColors`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "fix(properties): expose teacher contributor for arguments"
```

---

### Task 2: Add contributor selector for support elements

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx` (support branch starting at line 233)

- [ ] **Step 1: Add a new constant `SUPPORT_CONTRIBUTOR_TYPES` near the top of the file**

Insert below the existing `CONTRIBUTOR_TYPES`:

```ts
const SUPPORT_CONTRIBUTOR_TYPES: { value: SupportContributor; label: string }[] = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
];
```

Update the imports at line 3 to include `SupportContributor`:

```ts
import type {
  DiagramElement, CropArea, ArgumentType, ContributorType,
  SupportType, SupportSubtype, SupportContributor,
} from '../../types';
```

- [ ] **Step 2: In the support branch (the block starting `{(isSupportElement(selectedElement) || isTeacherSupportElement(selectedElement)) && (` around line 233), add a Contributor selector that renders ONLY for `SupportElement` (not `TeacherSupportElement`)**

Insert immediately after the existing `<label style={labelStyle}>Type</label>` block (the one that closes at line 249, after the `</select>` and its `</div>`), BEFORE the existing `{selectedElement.supportType === 'other' && (...)}` block:

```tsx
{isSupportElement(selectedElement) && (
  <div className="flex flex-col gap-1.5">
    <label style={labelStyle}>Contributor</label>
    <select
      value={selectedElement.contributor}
      onChange={(e) =>
        updateElement(selectedElement.id, {
          contributor: e.target.value as SupportContributor,
        } as Partial<DiagramElement>)
      }
      className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus:outline-none focus:ring-2"
      style={selectStyle}
    >
      {SUPPORT_CONTRIBUTOR_TYPES.map((type) => (
        <option key={type.value} value={type.value}>
          {type.label}
        </option>
      ))}
    </select>
  </div>
)}
```

Reasoning: `TeacherSupportElement` doesn't have a `contributor` field (see `TeacherSupportShape.tsx:33`), so the selector is hidden for that legacy type.

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`. Create a Support element (Action) via the Palette as a teacher. Select it. Open Properties Panel. Verify a Contributor dropdown appears with "Teacher" and "Student". Switch to Student and confirm the border color updates (per `getSupportColors` in `src/utils/colors.ts:45`). Save to JSON, reload, confirm the change persists.

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "fix(properties): add contributor selector for support elements"
```

---

### Task 3: Build the export-bounds helper

**Files:**
- Create: `src/utils/exportBounds.ts`
- Create: `src/utils/exportBounds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/exportBounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeExportBounds } from './exportBounds';
import type { ArgumentElement, Connection, DiagramElement } from '../types';

function arg(id: string, x: number, y: number, w = 100, h = 60): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

function conn(id: string, from: string, to: string, waypoints?: { x: number; y: number }[]): Connection {
  return { id, from, to, type: 'support', ...(waypoints ? { waypoints } : {}) };
}

describe('computeExportBounds', () => {
  it('returns 200x200 fallback for empty diagram', () => {
    expect(computeExportBounds([], [])).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('covers all elements with default 40px margin', () => {
    const elements: DiagramElement[] = [
      arg('a', 100, 50, 80, 40),
      arg('b', 300, 200, 100, 60),
    ];
    const b = computeExportBounds(elements, []);
    expect(b.x).toBe(100 - 40);
    expect(b.y).toBe(50 - 40);
    expect(b.width).toBe((300 + 100) - 100 + 80);  // (right of b) - (left of a) + 2*margin
    expect(b.height).toBe((200 + 60) - 50 + 80);
  });

  it('extends bbox to cover connection waypoints beyond element extents', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0), arg('b', 200, 0)];
    // Manually-routed waypoint far above both boxes
    const connections: Connection[] = [conn('c1', 'a', 'b', [{ x: 100, y: -500 }, { x: 100, y: 0 }])];
    const b = computeExportBounds(elements, connections);
    expect(b.y).toBeLessThanOrEqual(-500 - 40);
  });

  it('honors a custom margin', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0, 100, 100)];
    const b = computeExportBounds(elements, [], 10);
    expect(b.x).toBe(-10);
    expect(b.width).toBe(120);
  });

  it('handles a single-element diagram', () => {
    const elements: DiagramElement[] = [arg('a', 50, 50, 40, 30)];
    const b = computeExportBounds(elements, []);
    expect(b).toEqual({ x: 50 - 40, y: 50 - 40, width: 40 + 80, height: 30 + 80 });
  });

  it('runs under 50ms for 200 elements + 150 connections (perf smoke)', () => {
    const elements: DiagramElement[] = [];
    for (let i = 0; i < 200; i++) elements.push(arg(`e${i}`, i * 50, (i % 10) * 80));
    const connections: Connection[] = [];
    for (let i = 0; i < 150; i++) connections.push(conn(`c${i}`, `e${i}`, `e${i + 1}`));
    const t0 = performance.now();
    computeExportBounds(elements, connections);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- exportBounds`
Expected: FAIL — `Cannot find module './exportBounds'`.

- [ ] **Step 3: Implement `computeExportBounds`**

Create `src/utils/exportBounds.ts`:

```ts
import type { DiagramElement, Connection, Position } from '../types';
import { isArrowAttachment } from '../types';
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getVerticalAttachmentPath,
} from './orthogonalRouting';

export interface ExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FALLBACK: ExportBounds = { x: 0, y: 0, width: 200, height: 200 };

// Compute the bounding box covering every element and every rendered connection
// polyline, with `margin` px of padding on all sides. Used by PDF, PNG, and SVG
// export so output is independent of the canvas pan/zoom viewport.
export function computeExportBounds(
  elements: DiagramElement[],
  connections: Connection[],
  margin = 40,
): ExportBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + el.size.width);
    maxY = Math.max(maxY, el.position.y + el.size.height);
  }

  for (const conn of connections) {
    const pts = getRenderedPoints(conn, elements, connections);
    if (!pts) continue;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minX)) return FALLBACK;

  return {
    x: minX - margin,
    y: minY - margin,
    width: (maxX - minX) + margin * 2,
    height: (maxY - minY) + margin * 2,
  };
}

// Resolve a connection to its rendered polyline points. Mirrors the logic in
// Arrow.tsx but lives here so the export path doesn't need to traverse React.
function getRenderedPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): number[] | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const targetConn = connections.find((c) => c.id === connection.to.connectionId);
    if (!targetConn) return null;
    const parent = getRenderedPoints(targetConn, elements, connections);
    if (!parent) return null;
    return getVerticalAttachmentPath(fromEl, parent, connection.to.position).points;
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;

  const waypoints: Position[] = getEffectiveWaypoints(connection, fromEl, toEl);
  return getOrthogonalPath(fromEl, toEl, waypoints);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- exportBounds`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportBounds.ts src/utils/exportBounds.test.ts
git commit -m "feat(export): add computeExportBounds helper for full-content bbox"
```

---

### Task 4: Use bounds in PDF export

**Files:**
- Modify: `src/utils/pdfExport.ts`

- [ ] **Step 1: Read the current implementation**

Current `pdfExport.ts` uses `stage.toDataURL({ pixelRatio })` (no region) and `stage.width()/height()` for PDF format. Result: only the visible canvas is captured.

- [ ] **Step 2: Rewrite `exportToPdf` to take elements + connections and use the bounds**

Replace the body of `exportToPdf` in `src/utils/pdfExport.ts`. The function signature changes to accept the current diagram data:

```ts
import { jsPDF } from 'jspdf';
import Konva from 'konva';
import type { DiagramElement, Connection } from '../types';
import { computeExportBounds } from './exportBounds';

interface PdfExportOptions {
  filename?: string;
  orientation?: 'portrait' | 'landscape';
  quality?: number;
}

export async function exportToPdf(
  elements: DiagramElement[],
  connections: Connection[],
  options: PdfExportOptions = {},
): Promise<void> {
  const {
    filename = `toulmin-diagram-${Date.now()}.pdf`,
    orientation = 'landscape',
    quality = 2,
  } = options;

  const stages = Konva.stages;
  if (stages.length === 0) {
    throw new Error('No canvas found to export');
  }
  const stage = stages[0];

  const bounds = computeExportBounds(elements, connections);

  const dataURL = stage.toDataURL({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    pixelRatio: quality,
    mimeType: 'image/png',
  });

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [bounds.width, bounds.height],
  });

  pdf.addImage(dataURL, 'PNG', 0, 0, bounds.width, bounds.height);
  pdf.save(filename);
}
```

(Leave the existing `downloadPdf` helper at the bottom of the file untouched.)

- [ ] **Step 3: Update the caller in `Toolbar.tsx`**

Find the call to `exportToPdf(...)` in `src/components/Toolbar/Toolbar.tsx` (grep for `exportToPdf`):

```bash
grep -n "exportToPdf" src/components/Toolbar/Toolbar.tsx
```

Update the call site to pass `elements` and `connections` (both available from the store — see how PNG export reads them or pull them via `useDiagramStore`):

```tsx
// At the top of the Toolbar component, alongside the other store reads:
const { elements, connections } = useDiagramStore((s) => ({
  elements: s.elements,
  connections: s.connections,
}));

// At the call site:
await exportToPdf(elements, connections, { filename: `${toFilename(diagramName)}.pdf` });
```

If `useDiagramStore` already returns these in the component, just pass them through.

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. Load `~/Downloads/4math-ava-day1-5741 (4).json` (use "Load diagram"). Pan the canvas so some elements are off-screen. Click Export PDF. Open the downloaded PDF — confirm every element appears, no cropping.

- [ ] **Step 6: Commit**

```bash
git add src/utils/pdfExport.ts src/components/Toolbar/Toolbar.tsx
git commit -m "fix(export): PDF covers full diagram bbox, not just visible canvas"
```

---

### Task 5: Use bounds in PNG export

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx:137-160` (the `handleExportPNG` function)

- [ ] **Step 1: Update `handleExportPNG` to use `computeExportBounds`**

Replace the body of `handleExportPNG` in `src/components/Toolbar/Toolbar.tsx`:

```tsx
import { computeExportBounds } from '../../utils/exportBounds';

// ... inside the component ...

const handleExportPNG = async () => {
  setExporting('png');
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    const stages = Konva.stages;
    if (stages.length === 0) {
      alert('No canvas found to export');
      return;
    }
    const stage = stages[0];
    const bounds = computeExportBounds(elements, connections);
    const dataURL = stage.toDataURL({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio: 2,
      mimeType: 'image/png',
    });
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${toFilename(diagramName)}.png`;
    a.click();
  } finally {
    setExporting(null);
  }
};
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 3: Manual smoke test**

In dev mode: pan the canvas so part is off-screen. Click Export PNG. Open the file — verify all elements are visible, including those that were panned off-screen.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "fix(export): PNG covers full diagram bbox"
```

---

### Task 6: Use bounds in SVG export

**Files:**
- Modify: `src/utils/svgExport.ts` (the existing bbox logic around lines 30-40)

- [ ] **Step 1: Read the existing SVG bbox logic**

Run: `sed -n '20,50p' src/utils/svgExport.ts` (or open the file). The existing code computes minX/minY/maxX/maxY from `el.position` + `el.size` only — it does not consider connection waypoints that extend beyond element bounds.

- [ ] **Step 2: Replace the manual bbox computation with `computeExportBounds`**

Find the section that computes `minX, minY, maxX, maxY, width, height` from elements only. Replace it with:

```ts
import { computeExportBounds } from './exportBounds';

// ... in the exportToSvg function, replace the manual bbox loop with: ...
const bounds = computeExportBounds(elements, connections);
const width = bounds.width;
const height = bounds.height;
const minX = bounds.x;
const minY = bounds.y;
```

Then the `<svg ...>` opening line at line 60 already references `width`, `height`, and `viewBox="0 0 ${width} ${height}"`. We need to shift the contents so that `(minX, minY)` becomes `(0, 0)` in the SVG coordinate space. Wrap the body of the SVG in a `<g transform="translate(${-minX}, ${-minY})">` group, or apply `viewBox="${minX} ${minY} ${width} ${height}"` and leave the body coordinates alone. The viewBox approach is simpler:

```ts
return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
  ...
```

(Adjust the existing template literal in `svgExport.ts` accordingly.)

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

Export the diagram to SVG. Open it in a browser. Verify all elements are visible. Try a diagram with manually-dragged waypoints that extend past element extents (drag a connector segment far out) — verify the SVG includes those segments.

- [ ] **Step 5: Commit**

```bash
git add src/utils/svgExport.ts
git commit -m "fix(export): SVG bbox includes connection extents, not just elements"
```

---

## Phase B — Schema + Rule 1

### Task 7: Add `EdgeAnchor` type and Connection schema fields

**Files:**
- Modify: `src/types/connections.ts`

- [ ] **Step 1: Write the failing test**

Open `src/utils/orthogonalRouting.test.ts` (create it if it doesn't exist alongside `orthogonalRouting.ts`). If it doesn't exist, create a new file:

```ts
import { describe, it, expect } from 'vitest';
import { resolveAnchor } from './orthogonalRouting';
import type { DiagramElement, EdgeAnchor } from '../types';

function box(x: number, y: number, w: number, h: number): DiagramElement {
  return {
    id: 'el', type: 'argument', argumentType: 'data', contributor: 'given',
    label: '', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

describe('resolveAnchor', () => {
  it('resolves left-edge anchor to (left, top + t*height)', () => {
    const a: EdgeAnchor = { edge: 'left', t: 0.5 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 10, y: 60 });
  });

  it('resolves right-edge anchor to (right, top + t*height)', () => {
    const a: EdgeAnchor = { edge: 'right', t: 0.25 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 110, y: 40 });
  });

  it('resolves top-edge anchor to (left + t*width, top)', () => {
    const a: EdgeAnchor = { edge: 'top', t: 0.75 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 85, y: 20 });
  });

  it('resolves bottom-edge anchor to (left + t*width, bottom)', () => {
    const a: EdgeAnchor = { edge: 'bottom', t: 0 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 10, y: 100 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- orthogonalRouting`
Expected: FAIL — `EdgeAnchor` not exported from types, `resolveAnchor` not defined.

- [ ] **Step 3: Add schema types to `src/types/connections.ts`**

Modify the file to add:

```ts
export type BoxEdge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeAnchor {
  edge: BoxEdge;
  t: number;   // 0..1, fraction along the edge from the top-left corner
}

export interface Connection {
  id: string;
  from: string;
  to: string | ConnectionTarget;
  type: ConnectionType;
  waypoints?: Position[];
  fromAnchor?: EdgeAnchor;
  toAnchor?: EdgeAnchor;
}
```

- [ ] **Step 4: Re-export the new types from the types barrel**

Find `src/types/index.ts` and add `EdgeAnchor`, `BoxEdge` to the existing re-export list. (Check what's already re-exported: `grep "export " src/types/index.ts`.) Add:

```ts
export type { BoxEdge, EdgeAnchor } from './connections';
```

if not already covered by a wildcard.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No errors. The new optional fields don't break existing connection construction.

- [ ] **Step 6: Commit**

```bash
git add src/types/connections.ts src/types/index.ts
git commit -m "feat(types): add EdgeAnchor and optional anchor fields to Connection"
```

---

### Task 8: Implement `resolveAnchor` helper

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`

- [ ] **Step 1: Add `resolveAnchor` near the top of `src/utils/orthogonalRouting.ts`** (after the `getCenter` helper, before `computeDefaultZWaypoints`)

```ts
import type { EdgeAnchor } from '../types';

export function resolveAnchor(el: DiagramElement, anchor: EdgeAnchor): Position {
  const left = el.position.x;
  const right = el.position.x + el.size.width;
  const top = el.position.y;
  const bottom = el.position.y + el.size.height;
  const t = Math.max(0, Math.min(1, anchor.t));
  switch (anchor.edge) {
    case 'left':   return { x: left,                 y: top + t * el.size.height };
    case 'right':  return { x: right,                y: top + t * el.size.height };
    case 'top':    return { x: left + t * el.size.width, y: top };
    case 'bottom': return { x: left + t * el.size.width, y: bottom };
  }
}
```

- [ ] **Step 2: Run the failing tests from Task 7**

Run: `npm run test -- orthogonalRouting`
Expected: The 4 `resolveAnchor` tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/utils/orthogonalRouting.ts
git commit -m "feat(routing): add resolveAnchor helper for EdgeAnchor → Position"
```

---

### Task 9: Implement Rule 1 (straight line for data→claim in extent)

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/orthogonalRouting.test.ts`:

```ts
import { computeRule1Path } from './orthogonalRouting';

function dataBox(x: number, y: number, w: number, h: number): DiagramElement {
  return {
    id: 'd', type: 'argument', argumentType: 'data', contributor: 'given',
    label: '', content: '', position: { x, y }, size: { width: w, height: h },
  };
}
function claimBox(x: number, y: number, w = 100, h = 60): DiagramElement {
  return {
    id: 'c', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: '', content: '', position: { x, y }, size: { width: w, height: h },
  };
}

describe('computeRule1Path', () => {
  it('returns a horizontal 2-point line when target.y is inside tall data source extent, target to right', () => {
    const d = dataBox(0, 0, 100, 500);
    const c = claimBox(300, 200, 100, 60);   // center y = 230, inside [0, 500]
    const result = computeRule1Path(d, c);
    expect(result).not.toBeNull();
    expect(result).toEqual([100, 230, 300, 230]);
  });

  it('returns a horizontal 2-point line for target-to-left case', () => {
    const d = dataBox(500, 0, 100, 500);
    const c = claimBox(100, 200, 100, 60);   // center y = 230
    expect(computeRule1Path(d, c)).toEqual([500, 230, 200, 230]);
  });

  it('returns a vertical 2-point line when target.x is inside wide data source extent, target below', () => {
    const d = dataBox(0, 0, 500, 80);
    const c = claimBox(200, 200, 60, 60);    // center x = 230, inside [0, 500]
    expect(computeRule1Path(d, c)).toEqual([230, 80, 230, 200]);
  });

  it('returns null when target.y is outside source extent', () => {
    const d = dataBox(0, 0, 100, 100);
    const c = claimBox(300, 500, 100, 60);   // center y = 530, outside [0, 100]
    expect(computeRule1Path(d, c)).toBeNull();
  });

  it('returns null when source is not data', () => {
    const c1 = { ...claimBox(0, 0, 100, 500), id: 'c1' };
    const c2 = claimBox(300, 200);
    expect(computeRule1Path(c1, c2)).toBeNull();
  });

  it('returns null when target is not claim', () => {
    const d = dataBox(0, 0, 100, 500);
    const otherTarget: DiagramElement = {
      ...claimBox(300, 200), argumentType: 'warrant',
    };
    expect(computeRule1Path(d, otherTarget)).toBeNull();
  });

  it('returns null when source and target overlap on x (no clear side)', () => {
    const d = dataBox(0, 0, 200, 500);
    const c = claimBox(150, 200, 100, 60);   // c.left=150 < d.right=200 — overlap
    expect(computeRule1Path(d, c)).toBeNull();
  });

  it('treats target.center.y exactly on source.top as inside (inclusive)', () => {
    const d = dataBox(0, 100, 100, 100);     // extent [100, 200]
    const c = claimBox(300, 70, 100, 60);    // center y = 100 — exactly on top
    const r = computeRule1Path(d, c);
    expect(r).not.toBeNull();
    expect(r?.[1]).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orthogonalRouting`
Expected: FAIL — `computeRule1Path` not defined.

- [ ] **Step 3: Implement `computeRule1Path` in `src/utils/orthogonalRouting.ts`**

Add a new exported function (after `resolveAnchor`):

```ts
// Rule 1 routing: when source is a `data` argument and target is a `claim`,
// AND target's center falls inside the source's vertical or horizontal extent,
// AND target is fully to one side of source — return a single straight 2-point
// line at target.center.{y|x}. Returns null when conditions don't hold; caller
// should fall through to Rule 2 / default Z.
export function computeRule1Path(
  fromEl: DiagramElement,
  toEl: DiagramElement,
): number[] | null {
  if (fromEl.type !== 'argument' || toEl.type !== 'argument') return null;
  if (fromEl.argumentType !== 'data' || toEl.argumentType !== 'claim') return null;

  const fromLeft = fromEl.position.x;
  const fromRight = fromLeft + fromEl.size.width;
  const fromTop = fromEl.position.y;
  const fromBottom = fromTop + fromEl.size.height;

  const toLeft = toEl.position.x;
  const toRight = toLeft + toEl.size.width;
  const toTop = toEl.position.y;
  const toBottom = toTop + toEl.size.height;
  const toCenterX = toLeft + toEl.size.width / 2;
  const toCenterY = toTop + toEl.size.height / 2;

  // Horizontal case: target.center.y inside source's vertical extent, target fully on one side.
  const yInside = toCenterY >= fromTop && toCenterY <= fromBottom;
  const targetToRight = toLeft >= fromRight;
  const targetToLeft = toRight <= fromLeft;
  if (yInside && (targetToRight || targetToLeft)) {
    const sourceX = targetToRight ? fromRight : fromLeft;
    const targetX = targetToRight ? toLeft : toRight;
    return [sourceX, toCenterY, targetX, toCenterY];
  }

  // Vertical case: target.center.x inside source's horizontal extent, target above/below.
  const xInside = toCenterX >= fromLeft && toCenterX <= fromRight;
  const targetBelow = toTop >= fromBottom;
  const targetAbove = toBottom <= fromTop;
  if (xInside && (targetBelow || targetAbove)) {
    const sourceY = targetBelow ? fromBottom : fromTop;
    const targetY = targetBelow ? toTop : toBottom;
    return [toCenterX, sourceY, toCenterX, targetY];
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orthogonalRouting`
Expected: All `computeRule1Path` tests pass plus the earlier `resolveAnchor` tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(routing): add Rule 1 — straight line for data→claim in source extent"
```

---

### Task 10: Wire Rule 1 into the routing pipeline

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (around line 99 — `getConnectionPathPoints`)

- [ ] **Step 1: Add a `computeConnectionPath` function in `orthogonalRouting.ts`**

This is the new top-level entry point that orchestrates the override hierarchy. Add at the bottom of `src/utils/orthogonalRouting.ts`:

```ts
import type { Connection } from '../types';

// Top-level routing entry. Returns a flattened [x0,y0,x1,y1,...] polyline.
// Applies the override hierarchy from the spec:
//   stored waypoints  >  stored anchors  >  Rule 1  >  Rule 2 (added in Task 13)  >  default Z
//
// `siblings` is the set of OTHER connections also targeting `toEl`. Used by Rule 2.
// Pass [] if Rule 2 isn't wired up yet — falls through to default Z when Rule 1 doesn't apply.
export function computeConnectionPath(
  connection: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
  siblings: { conn: Connection; fromEl: DiagramElement }[] = [],
): number[] {
  // Waypoints win.
  if (connection.waypoints && connection.waypoints.length > 0) {
    return getOrthogonalPath(fromEl, toEl, connection.waypoints);
  }

  // Anchored endpoints — render a Z that respects them (no Rule 1, no Rule 2 for this conn).
  if (connection.fromAnchor || connection.toAnchor) {
    return getOrthogonalPath(fromEl, toEl, anchoredZWaypoints(connection, fromEl, toEl));
  }

  // Rule 1.
  const rule1 = computeRule1Path(fromEl, toEl);
  if (rule1) return rule1;

  // Rule 2 placeholder (filled in Task 13).
  // For now: default Z.
  void siblings;

  return getOrthogonalPath(fromEl, toEl, computeDefaultZWaypoints(fromEl, toEl));
}

// When at least one anchor is set, compute Z-shape waypoints that respect the
// fixed endpoint(s). Falls back to default Z behavior on the unanchored side.
export function anchoredZWaypoints(
  connection: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
): Position[] {
  const fromPoint = connection.fromAnchor
    ? resolveAnchor(fromEl, connection.fromAnchor)
    : getCenter(fromEl);
  const toPoint = connection.toAnchor
    ? resolveAnchor(toEl, connection.toAnchor)
    : getCenter(toEl);

  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (fromPoint.x + toPoint.x) / 2;
    return [{ x: midX, y: fromPoint.y }, { x: midX, y: toPoint.y }];
  } else {
    const midY = (fromPoint.y + toPoint.y) / 2;
    return [{ x: fromPoint.x, y: midY }, { x: toPoint.x, y: midY }];
  }
}
```

`getCenter` is already defined privately at the top of `orthogonalRouting.ts:14` — leave it as-is.

- [ ] **Step 2: Replace `getConnectionPathPoints` body in `Arrow.tsx` to call `computeConnectionPath`**

Locate `getConnectionPathPoints` in `src/components/Canvas/shapes/Arrow.tsx:99-135` (the element-to-element branch, NOT the attachment branch). Replace the `else` branch (everything after the `if (isArrowAttachment(...))` block) with:

```ts
const toEl = elements.find((el) => el.id === connection.to);
if (!toEl) return null;

// Identical-endpoint degeneracy: both elements at exactly the same position with same size.
if (
  fromEl.position.x === toEl.position.x &&
  fromEl.position.y === toEl.position.y &&
  fromEl.size.width === toEl.size.width &&
  fromEl.size.height === toEl.size.height
) {
  return null;
}

// Build siblings list — other connections also targeting toEl.
const siblings: { conn: Connection; fromEl: DiagramElement }[] = [];
for (const c of connections) {
  if (c.id === connection.id) continue;
  if (isArrowAttachment(c.to)) continue;
  if (c.to !== toEl.id) continue;
  const sFrom = elements.find((el) => el.id === c.from);
  if (sFrom) siblings.push({ conn: c, fromEl: sFrom });
}

return { points: computeConnectionPath(connection, fromEl, toEl, siblings) };
```

Add the import at the top of `Arrow.tsx`:

```ts
import {
  // ...existing imports...
  computeConnectionPath,
} from '../../../utils/orthogonalRouting';
```

- [ ] **Step 3: Update the drag-override branch in `Arrow.tsx`**

Find the block in `Arrow.tsx` (around line 300-307) that recomputes the path when `dragOverride` is set:

```ts
if (pathResult && !isAttachment && dragOverride) {
  const fromEl = elements.find((el) => el.id === connection.from);
  const toEl = elements.find((el) => el.id === connection.to);
  if (fromEl && toEl) {
    pathResult = { points: getOrthogonalPath(fromEl, toEl, dragOverride) };
  }
}
```

This stays as-is — drag override always uses `getOrthogonalPath` directly with the in-progress waypoints. No change needed.

- [ ] **Step 4: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: No errors, all tests pass (including any existing `getOrthogonalPath` tests).

- [ ] **Step 5: Manual smoke test — Rule 1 in action**

Run `npm run dev`. Load `~/Downloads/4math-ava-day1-5741 (4).json`. Verify:
- Given → Claim 1: renders as a single horizontal line at Claim 1's y.
- Given → DataClaim 2, DataClaim 3, Claim 4: each is a separate horizontal line at the respective claim's y. No shared "spine."
- `claim → claim` connections (DC2 → Claim 5, DC3 → Claim 5): still render as Z-elbow (Rule 1 only applies to `data → claim`).

- [ ] **Step 6: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(routing): wire Rule 1 + anchor-aware routing into Arrow render path"
```

---

## Phase C — Rule 2

### Task 11: Group convergent siblings by approach side

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/orthogonalRouting.test.ts`:

```ts
import { groupSiblingsByApproachSide } from './orthogonalRouting';

describe('groupSiblingsByApproachSide', () => {
  it('groups sources by left/right based on center.x', () => {
    const target = claimBox(500, 200);  // center x = 550
    const leftA = dataBox(100, 200, 80, 60);   // center x = 140 < 550 → left
    const leftB = dataBox(200, 350, 80, 60);   // center x = 240 < 550 → left
    const rightA = dataBox(800, 200, 80, 60);  // center x = 840 > 550 → right
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: leftA },
       { conn: { id:'2', from:'b', to:'t', type:'support' }, fromEl: leftB },
       { conn: { id:'3', from:'c', to:'t', type:'support' }, fromEl: rightA }],
      target,
    );
    expect(groups.left.length).toBe(2);
    expect(groups.right.length).toBe(1);
    expect(groups.above.length).toBe(0);
    expect(groups.below.length).toBe(0);
  });

  it('groups sources by above/below when center.y differs and center.x matches', () => {
    const target = claimBox(500, 500);   // center (550, 530)
    const above = dataBox(510, 100, 80, 60);   // center (550, 130) — same x, above
    const below = dataBox(510, 900, 80, 60);   // center (550, 930) — same x, below
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: above },
       { conn: { id:'2', from:'b', to:'t', type:'support' }, fromEl: below }],
      target,
    );
    // Equal-x case: tied; spec says exclude from Rule 2 grouping (fall through to default Z).
    expect(groups.left.length + groups.right.length + groups.above.length + groups.below.length).toBe(0);
    expect(groups.excluded.length).toBe(2);
  });

  it('prefers horizontal grouping when both horizontal and vertical separations exist', () => {
    // If a source is both clearly-left AND clearly-above, classify as left (horizontal wins).
    const target = claimBox(500, 500);  // center (550, 530)
    const leftAndAbove = dataBox(100, 100, 80, 60);  // center (140, 130)
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: leftAndAbove }],
      target,
    );
    expect(groups.left.length).toBe(1);
    expect(groups.above.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orthogonalRouting`
Expected: FAIL — `groupSiblingsByApproachSide` not defined.

- [ ] **Step 3: Implement the grouping function in `orthogonalRouting.ts`**

```ts
export interface SiblingApproachGroups {
  left:     { conn: Connection; fromEl: DiagramElement }[];
  right:    { conn: Connection; fromEl: DiagramElement }[];
  above:    { conn: Connection; fromEl: DiagramElement }[];
  below:    { conn: Connection; fromEl: DiagramElement }[];
  excluded: { conn: Connection; fromEl: DiagramElement }[];  // ambiguous side
}

const SIDE_EPSILON = 1;  // px

export function groupSiblingsByApproachSide(
  siblings: { conn: Connection; fromEl: DiagramElement }[],
  target: DiagramElement,
): SiblingApproachGroups {
  const tCenterX = target.position.x + target.size.width / 2;
  const tCenterY = target.position.y + target.size.height / 2;
  const out: SiblingApproachGroups = { left: [], right: [], above: [], below: [], excluded: [] };

  for (const s of siblings) {
    const sCenterX = s.fromEl.position.x + s.fromEl.size.width / 2;
    const sCenterY = s.fromEl.position.y + s.fromEl.size.height / 2;
    const dx = sCenterX - tCenterX;
    const dy = sCenterY - tCenterY;
    // Prefer horizontal grouping if there's clear horizontal separation.
    if (Math.abs(dx) > SIDE_EPSILON) {
      if (dx < 0) out.left.push(s);
      else out.right.push(s);
    } else if (Math.abs(dy) > SIDE_EPSILON) {
      if (dy < 0) out.above.push(s);
      else out.below.push(s);
    } else {
      out.excluded.push(s);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orthogonalRouting`
Expected: All `groupSiblingsByApproachSide` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(routing): group convergent siblings by approach side"
```

---

### Task 12: Compute shared trunk coordinate

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { computeSharedTrunkX } from './orthogonalRouting';

describe('computeSharedTrunkX (left-side sources)', () => {
  it('places trunk 30% of the way from maxSourceRight to target.left', () => {
    const target = claimBox(1000, 200);   // left = 1000
    const sources = [
      dataBox(100, 200, 80, 60),   // right = 180
      dataBox(300, 200, 100, 60),  // right = 400 (max)
    ];
    // maxSourceRight = 400. trunkX = 400 + 0.3 * (1000 - 400) = 580.
    const groups = [
      { conn: { id:'1', from:'a', to:'t', type:'support' as const }, fromEl: sources[0] },
      { conn: { id:'2', from:'b', to:'t', type:'support' as const }, fromEl: sources[1] },
    ];
    expect(computeSharedTrunkX(groups, target, 'left')).toBe(580);
  });

  it('clamps to maxSourceRight + 20 if sources are too close to target', () => {
    const target = claimBox(420, 200);    // left = 420
    const sources = [dataBox(300, 200, 100, 60)];  // right = 400
    const groups = [
      { conn: { id:'1', from:'a', to:'t', type:'support' as const }, fromEl: sources[0] },
    ];
    // 30% of (420 - 400) = 6 < 20px clamp → trunkX = 400 + 20 = 420 → clamped to target.left - 20 = 400
    // Both clamps apply; spec says clamp(trunkX, maxSourceRight + 20, target.left - 20)
    // When the two clamps cross (maxSourceRight + 20 > target.left - 20), prefer the lower bound (closer to sources).
    const result = computeSharedTrunkX(groups, target, 'left');
    expect(result).toBeGreaterThanOrEqual(400);
    expect(result).toBeLessThanOrEqual(420);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orthogonalRouting`
Expected: FAIL — `computeSharedTrunkX` not defined.

- [ ] **Step 3: Implement `computeSharedTrunkX`**

```ts
const TRUNK_RATIO = 0.3;
const TRUNK_PAD_PX = 20;

export function computeSharedTrunkX(
  siblings: { conn: Connection; fromEl: DiagramElement }[],
  target: DiagramElement,
  side: 'left' | 'right',
): number {
  const targetLeft = target.position.x;
  const targetRight = target.position.x + target.size.width;

  if (side === 'left') {
    let maxSourceRight = -Infinity;
    for (const s of siblings) {
      const right = s.fromEl.position.x + s.fromEl.size.width;
      if (right > maxSourceRight) maxSourceRight = right;
    }
    let trunkX = maxSourceRight + TRUNK_RATIO * (targetLeft - maxSourceRight);
    const lower = maxSourceRight + TRUNK_PAD_PX;
    const upper = targetLeft - TRUNK_PAD_PX;
    if (lower > upper) return Math.max(lower, Math.min(targetLeft, upper));
    return Math.max(lower, Math.min(upper, trunkX));
  } else {
    // Right-side: sources to the right of target, target is to their left.
    let minSourceLeft = Infinity;
    for (const s of siblings) {
      if (s.fromEl.position.x < minSourceLeft) minSourceLeft = s.fromEl.position.x;
    }
    let trunkX = minSourceLeft - TRUNK_RATIO * (minSourceLeft - targetRight);
    const upper = minSourceLeft - TRUNK_PAD_PX;
    const lower = targetRight + TRUNK_PAD_PX;
    if (lower > upper) return Math.max(lower, Math.min(targetRight, upper));
    return Math.max(lower, Math.min(upper, trunkX));
  }
}

// Symmetric trunk Y for above/below grouping.
export function computeSharedTrunkY(
  siblings: { conn: Connection; fromEl: DiagramElement }[],
  target: DiagramElement,
  side: 'above' | 'below',
): number {
  const targetTop = target.position.y;
  const targetBottom = target.position.y + target.size.height;

  if (side === 'above') {
    let maxSourceBottom = -Infinity;
    for (const s of siblings) {
      const bot = s.fromEl.position.y + s.fromEl.size.height;
      if (bot > maxSourceBottom) maxSourceBottom = bot;
    }
    let trunkY = maxSourceBottom + TRUNK_RATIO * (targetTop - maxSourceBottom);
    const lower = maxSourceBottom + TRUNK_PAD_PX;
    const upper = targetTop - TRUNK_PAD_PX;
    if (lower > upper) return Math.max(lower, Math.min(targetTop, upper));
    return Math.max(lower, Math.min(upper, trunkY));
  } else {
    let minSourceTop = Infinity;
    for (const s of siblings) {
      if (s.fromEl.position.y < minSourceTop) minSourceTop = s.fromEl.position.y;
    }
    let trunkY = minSourceTop - TRUNK_RATIO * (minSourceTop - targetBottom);
    const upper = minSourceTop - TRUNK_PAD_PX;
    const lower = targetBottom + TRUNK_PAD_PX;
    if (lower > upper) return Math.max(lower, Math.min(targetBottom, upper));
    return Math.max(lower, Math.min(upper, trunkY));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orthogonalRouting`
Expected: All `computeSharedTrunkX` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(routing): compute shared trunk coordinate for convergent siblings"
```

---

### Task 13: Spread entry t values across edge

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { computeEntryTValues } from './orthogonalRouting';

describe('computeEntryTValues', () => {
  it('returns t=0.5 for both connections when N=2 (no spread)', () => {
    const target = claimBox(500, 200);
    const sources = [dataBox(100, 100, 80, 60), dataBox(100, 300, 80, 60)];
    const sibs = [
      { conn: { id:'1', from:'a', to:'t', type:'support' as const }, fromEl: sources[0] },
      { conn: { id:'2', from:'b', to:'t', type:'support' as const }, fromEl: sources[1] },
    ];
    const map = computeEntryTValues(sibs, target);
    expect(map.get('1')).toBe(0.5);
    expect(map.get('2')).toBe(0.5);
  });

  it('returns evenly-spread t values for N=3, ordered by source.center.y', () => {
    const target = claimBox(500, 200);
    const top    = dataBox(100, 50,  80, 60);   // center y = 80
    const middle = dataBox(100, 200, 80, 60);   // center y = 230
    const bottom = dataBox(100, 400, 80, 60);   // center y = 430
    const sibs = [
      // Pass in random order — function should sort.
      { conn: { id:'middle', from:'m', to:'t', type:'support' as const }, fromEl: middle },
      { conn: { id:'top',    from:'a', to:'t', type:'support' as const }, fromEl: top },
      { conn: { id:'bottom', from:'b', to:'t', type:'support' as const }, fromEl: bottom },
    ];
    const map = computeEntryTValues(sibs, target);
    expect(map.get('top')).toBeCloseTo(0.25);
    expect(map.get('middle')).toBeCloseTo(0.5);
    expect(map.get('bottom')).toBeCloseTo(0.75);
  });

  it('returns evenly-spread t values for N=4', () => {
    const target = claimBox(500, 200);
    const ss = [
      dataBox(100, 0,   80, 60),
      dataBox(100, 100, 80, 60),
      dataBox(100, 200, 80, 60),
      dataBox(100, 300, 80, 60),
    ];
    const sibs = ss.map((fromEl, i) => ({
      conn: { id: `s${i}`, from: `e${i}`, to: 't', type: 'support' as const },
      fromEl,
    }));
    const map = computeEntryTValues(sibs, target);
    expect(map.get('s0')).toBeCloseTo(0.2);
    expect(map.get('s1')).toBeCloseTo(0.4);
    expect(map.get('s2')).toBeCloseTo(0.6);
    expect(map.get('s3')).toBeCloseTo(0.8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orthogonalRouting`
Expected: FAIL — `computeEntryTValues` not defined.

- [ ] **Step 3: Implement `computeEntryTValues`**

```ts
// Return a map of connection.id → t (0..1) for entry along the target's edge.
// N=2: both at 0.5 (overlap; spec choice). N >= 3: i+1 / N+1, sorted by source.center.y.
export function computeEntryTValues(
  siblings: { conn: Connection; fromEl: DiagramElement }[],
  _target: DiagramElement,
): Map<string, number> {
  const out = new Map<string, number>();
  const N = siblings.length;
  if (N === 0) return out;

  if (N <= 2) {
    for (const s of siblings) out.set(s.conn.id, 0.5);
    return out;
  }

  const sorted = [...siblings].sort((a, b) => {
    const ay = a.fromEl.position.y + a.fromEl.size.height / 2;
    const by = b.fromEl.position.y + b.fromEl.size.height / 2;
    return ay - by;
  });

  sorted.forEach((s, i) => {
    out.set(s.conn.id, (i + 1) / (N + 1));
  });
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orthogonalRouting`
Expected: All `computeEntryTValues` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(routing): spread convergent entries along target edge (N>=3)"
```

---

### Task 14: Apply Rule 2 in `computeConnectionPath`

**Files:**
- Modify: `src/utils/orthogonalRouting.ts`
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `src/utils/orthogonalRouting.test.ts`:

```ts
import { computeConnectionPath } from './orthogonalRouting';

describe('computeConnectionPath — Rule 2 integration', () => {
  it('aligns 3 left-side convergent trunks to the same x and spreads entries', () => {
    const target: DiagramElement = {
      ...claimBox(1000, 500, 200, 200),  // target spans y=500..700, center y=600
    };
    const s1 = dataBox(100, 100, 80, 60);   // center y = 130
    const s2 = dataBox(100, 400, 80, 60);   // center y = 430
    const s3 = dataBox(100, 700, 80, 60);   // center y = 730
    const conns = [
      { id: 'c1', from: s1.id, to: target.id, type: 'support' as const },
      { id: 'c2', from: s2.id, to: target.id, type: 'support' as const },
      { id: 'c3', from: s3.id, to: target.id, type: 'support' as const },
    ];
    // sibling list excludes self
    const siblingsFor = (selfId: string) =>
      conns.filter((c) => c.id !== selfId).map((c, i) => ({
        conn: c,
        fromEl: [s1, s2, s3].find((s) => s.id === c.from)!,
      }));

    const p1 = computeConnectionPath(conns[0], s1, target, siblingsFor('c1'));
    const p2 = computeConnectionPath(conns[1], s2, target, siblingsFor('c2'));
    const p3 = computeConnectionPath(conns[2], s3, target, siblingsFor('c3'));

    // All three have an interior x = trunkX. Extract waypoint x from each path.
    // Default Z is H-V-H, so the 2nd point and 3rd point share x = trunkX.
    // Polyline layout: [exitX, exitY, w1X, w1Y, w2X, w2Y, entryX, entryY]
    const trunkX1 = p1[4];  // 3rd point x (w2)
    const trunkX2 = p2[4];
    const trunkX3 = p3[4];
    expect(trunkX1).toBe(trunkX2);
    expect(trunkX2).toBe(trunkX3);

    // Entry y values should be spread along target's left edge: target.top=500, height=200.
    // N=3 → t = 0.25, 0.5, 0.75 → y = 550, 600, 650.
    // s1 (top-most center y = 130) gets t=0.25 → y=550
    // s2 (middle center y = 430) gets t=0.5  → y=600
    // s3 (bottom center y = 730) gets t=0.75 → y=650
    const entryY1 = p1[p1.length - 1];
    const entryY2 = p2[p2.length - 1];
    const entryY3 = p3[p3.length - 1];
    expect(entryY1).toBe(550);
    expect(entryY2).toBe(600);
    expect(entryY3).toBe(650);
  });

  it('N=2 convergent: both enter at target.center.y (no spread)', () => {
    const target = claimBox(1000, 500, 200, 200);
    const s1 = dataBox(100, 100, 80, 60);
    const s2 = dataBox(100, 700, 80, 60);
    const conns = [
      { id: 'c1', from: s1.id, to: target.id, type: 'support' as const },
      { id: 'c2', from: s2.id, to: target.id, type: 'support' as const },
    ];
    const p1 = computeConnectionPath(conns[0], s1, target, [{ conn: conns[1], fromEl: s2 }]);
    const p2 = computeConnectionPath(conns[1], s2, target, [{ conn: conns[0], fromEl: s1 }]);
    // Both entries at target.center.y = 600.
    expect(p1[p1.length - 1]).toBe(600);
    expect(p2[p2.length - 1]).toBe(600);
  });

  it('Rule 1 takes precedence over Rule 2 for the connections it matches', () => {
    // Tall data source with target inside extent → Rule 1 wins, returns 2-point straight line.
    const d = dataBox(0, 0, 100, 1000);
    const c1 = claimBox(500, 100, 100, 60);
    const c2 = claimBox(500, 400, 100, 60);
    const conn1 = { id: 'c1', from: d.id, to: c1.id, type: 'support' as const };
    const conn2 = { id: 'c2', from: d.id, to: c2.id, type: 'support' as const };
    // No siblings to c1 (different targets).
    const p = computeConnectionPath(conn1, d, c1, []);
    expect(p.length).toBe(4);  // straight 2-point line
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- orthogonalRouting`
Expected: The N=3 test fails — trunk x values not aligned, entries all at center y.

- [ ] **Step 3: Replace the Rule 2 placeholder in `computeConnectionPath`**

In `src/utils/orthogonalRouting.ts`, replace the body of `computeConnectionPath` (added in Task 10) with:

```ts
export function computeConnectionPath(
  connection: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
  siblings: { conn: Connection; fromEl: DiagramElement }[] = [],
): number[] {
  // Manual routing wins.
  if (connection.waypoints && connection.waypoints.length > 0) {
    return getOrthogonalPath(fromEl, toEl, connection.waypoints);
  }
  if (connection.fromAnchor || connection.toAnchor) {
    return getOrthogonalPath(fromEl, toEl, anchoredZWaypoints(connection, fromEl, toEl));
  }

  // Rule 1.
  const rule1 = computeRule1Path(fromEl, toEl);
  if (rule1) return rule1;

  // Rule 2: only auto-routed siblings (no waypoints, no anchors, no Rule 1 match).
  const autoSiblings = siblings.filter((s) => {
    if (s.conn.waypoints && s.conn.waypoints.length > 0) return false;
    if (s.conn.fromAnchor || s.conn.toAnchor) return false;
    if (computeRule1Path(s.fromEl, toEl)) return false;
    return true;
  });

  // Include self in the convergent set if there are any auto siblings.
  const convergentSet = autoSiblings.length > 0
    ? [{ conn: connection, fromEl }, ...autoSiblings]
    : [];

  if (convergentSet.length >= 2) {
    const groups = groupSiblingsByApproachSide(convergentSet, toEl);
    // Find which side this connection landed in.
    const mySide = (['left','right','above','below'] as const).find((side) =>
      groups[side].some((s) => s.conn.id === connection.id),
    );
    const sideGroup = mySide ? groups[mySide] : [];
    if (mySide && sideGroup.length >= 2) {
      const tMap = computeEntryTValues(sideGroup, toEl);
      const myT = tMap.get(connection.id) ?? 0.5;

      // Apply trunk + entry anchor.
      if (mySide === 'left' || mySide === 'right') {
        const trunkX = computeSharedTrunkX(sideGroup, toEl, mySide);
        const entryEdge: BoxEdge = mySide === 'left' ? 'left' : 'right';
        const entryPoint = resolveAnchor(toEl, { edge: entryEdge, t: myT });
        // Source exit y = fromEl center y; waypoints: (trunkX, fromCy), (trunkX, entryY).
        const fromCy = fromEl.position.y + fromEl.size.height / 2;
        const wps: Position[] = [{ x: trunkX, y: fromCy }, { x: trunkX, y: entryPoint.y }];
        // Reuse getOrthogonalPath but override the toEntry to use entryPoint exactly.
        const exitX = mySide === 'left' ? fromEl.position.x + fromEl.size.width : fromEl.position.x;
        return [exitX, fromCy, wps[0].x, wps[0].y, wps[1].x, wps[1].y, entryPoint.x, entryPoint.y];
      } else {
        const trunkY = computeSharedTrunkY(sideGroup, toEl, mySide);
        const entryEdge: BoxEdge = mySide === 'above' ? 'top' : 'bottom';
        const entryPoint = resolveAnchor(toEl, { edge: entryEdge, t: myT });
        const fromCx = fromEl.position.x + fromEl.size.width / 2;
        const wps: Position[] = [{ x: fromCx, y: trunkY }, { x: entryPoint.x, y: trunkY }];
        const exitY = mySide === 'above' ? fromEl.position.y + fromEl.size.height : fromEl.position.y;
        return [fromCx, exitY, wps[0].x, wps[0].y, wps[1].x, wps[1].y, entryPoint.x, entryPoint.y];
      }
    }
  }

  return getOrthogonalPath(fromEl, toEl, computeDefaultZWaypoints(fromEl, toEl));
}
```

Add `BoxEdge` to the existing type imports at the top of the file:

```ts
import type { Connection, EdgeAnchor, BoxEdge } from '../types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- orthogonalRouting`
Expected: All Rule 2 integration tests pass.

- [ ] **Step 5: Manual smoke test — Rule 2 in action**

Run `npm run dev`. Load the Ava diagram. Verify:
- DC2 → Claim 5, DC3 → Claim 5, Data 2 → Claim 5: all three lines share a single trunk column.
- Their entries on Claim 5's left edge are at roughly 25%, 50%, 75% of Claim 5's height.

- [ ] **Step 6: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(routing): apply Rule 2 — aligned trunks + spread entries on convergent targets"
```

---

## Phase D — UI affordances

### Task 15: Segment-midpoint discoverability handles

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (around the segments-rendering block at line 486)

- [ ] **Step 1: In `Arrow.tsx`, after the existing `segments.map(...)` block that renders each segment line (lines 486-513), add dot handles at each segment midpoint**

Add this block inside the `<>...</>` fragment, after the segments-render section, only when `!isAttachment` AND (`isHovered || isSelected`) AND not in connect mode:

```tsx
{!isAttachment && (isHovered || isSelected) && !connectModeActive &&
  segments.map((seg, idx) => {
    const midX = (seg.start.x + seg.end.x) / 2;
    const midY = (seg.start.y + seg.end.y) / 2;
    return (
      <Circle
        key={`mid-${idx}`}
        x={midX}
        y={midY}
        radius={5}
        fill="#FFFFFF"
        stroke="#333333"
        strokeWidth={1.5}
        onMouseDown={(e) => handleSegmentDragStart(idx, e)}
        onTouchStart={(e) => handleSegmentDragStart(idx, e)}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) {
            stage.container().style.cursor =
              seg.orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
          }
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';
        }}
      />
    );
  })
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 3: Manual smoke test**

`npm run dev`. Click a connection — small white circles appear at the midpoint of each interior segment. Hover a circle — cursor changes to resize arrows. Drag a circle — segment moves (same as dragging the line itself).

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): show segment midpoint handles on hover/select for discoverability"
```

---

### Task 16: Edge-anchor handles (visual + drag start)

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`
- Modify: `src/store/diagramStore.ts`

- [ ] **Step 1: Add `updateConnectionAnchor` action to the store**

Open `src/store/diagramStore.ts`. After the existing `updateConnectionWaypoints` interface declaration around line 95, add:

```ts
updateConnectionAnchor: (id: string, end: 'from' | 'to', anchor: EdgeAnchor | undefined) => void;
```

Add `EdgeAnchor` to the type imports at the top (line 4):

```ts
import type {
  DiagramElement, Connection, Position, Size, ContributorType,
  ImageSettings, SupportType, SupportSubtype, ArgumentType,
  SupportContributor, ArgumentElement, SupportElement,
  Transcript, TranscriptLine, EdgeAnchor,
} from '../types';
```

Then add the implementation after the existing `updateConnectionWaypoints` impl (around line 428):

```ts
updateConnectionAnchor: (id, end, anchor) =>
  set((state) => ({
    connections: state.connections.map((conn) => {
      if (conn.id !== id) return conn;
      const key = end === 'from' ? 'fromAnchor' : 'toAnchor';
      const next = { ...conn };
      if (anchor === undefined) {
        delete next[key];
      } else {
        next[key] = anchor;
      }
      return next;
    }),
  })),
```

- [ ] **Step 2: Render endpoint handles in `Arrow.tsx`**

In `Arrow.tsx`, locate the return block. After the segment-midpoint dots (Task 15), add endpoint handles. The endpoint coordinates are `pathPoints[0..1]` (exit/source) and `pathPoints[last..last-1]` (entry/target):

```tsx
{!isAttachment && (isHovered || isSelected) && !connectModeActive && (
  <>
    {/* Source-side anchor handle */}
    <Circle
      x={pathPoints[0]}
      y={pathPoints[1]}
      radius={5}
      fill="#3B82F6"
      stroke="#FFFFFF"
      strokeWidth={1.5}
      onMouseDown={(e) => handleAnchorDragStart('from', e)}
      onTouchStart={(e) => handleAnchorDragStart('from', e)}
    />
    {/* Target-side anchor handle */}
    <Circle
      x={pathPoints[pathPoints.length - 2]}
      y={pathPoints[pathPoints.length - 1]}
      radius={5}
      fill="#3B82F6"
      stroke="#FFFFFF"
      strokeWidth={1.5}
      onMouseDown={(e) => handleAnchorDragStart('to', e)}
      onTouchStart={(e) => handleAnchorDragStart('to', e)}
    />
  </>
)}
```

- [ ] **Step 3: Add the `handleAnchorDragStart` handler stub**

In `Arrow.tsx`, alongside the existing `handleSegmentDragStart` function (around line 321), add:

```ts
const handleAnchorDragStart = (
  end: 'from' | 'to',
  e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
) => {
  if (connectModeActive || isAttachment) return;
  e.cancelBubble = true;
  // Persist logic added in Task 17.
};
```

(Full drag implementation comes in Task 17. This step just renders the handles and stubs the entry point.)

- [ ] **Step 4: Run typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: No errors.

- [ ] **Step 5: Manual smoke test (visual only)**

Run `npm run dev`. Click a connection. Blue endpoint dots appear at both ends of the line. Dragging them does nothing yet (Task 17).

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx src/store/diagramStore.ts
git commit -m "feat(canvas): render edge-anchor handles + add store action"
```

---

### Task 17: Edge-anchor drag with edge-constrained tracking

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

- [ ] **Step 1: Implement `handleAnchorDragStart` fully and add a sibling effect block to track the drag**

Replace the stub from Task 16:

```ts
const dragAnchorRef = useRef<{
  end: 'from' | 'to';
  element: DiagramElement;
  facingEdge: BoxEdge;
  stage: Konva.Stage;
} | null>(null);

const [anchorDragOverride, setAnchorDragOverride] = useState<EdgeAnchor | null>(null);

const handleAnchorDragStart = (
  end: 'from' | 'to',
  e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
) => {
  if (connectModeActive || isAttachment) return;
  e.cancelBubble = true;
  const stage = e.target.getStage();
  if (!stage) return;
  const el = end === 'from'
    ? elements.find((x) => x.id === connection.from)
    : elements.find((x) => x.id === connection.to);
  if (!el) return;

  // Determine facing edge from current geometry.
  const otherEl = end === 'from'
    ? (typeof connection.to === 'string' ? elements.find((x) => x.id === connection.to) : null)
    : elements.find((x) => x.id === connection.from);
  if (!otherEl) return;
  const facingEdge = determineFacingEdge(el, otherEl);

  dragAnchorRef.current = { end, element: el, facingEdge, stage };

  const move = (_ev: MouseEvent | TouchEvent) => {
    const drag = dragAnchorRef.current;
    if (!drag) return;
    // Use getRelativePointerPosition to get stage/logical coords (accounts for pan + zoom).
    // Element positions in the store are in stage coords, so this is what we need.
    const ptr = drag.stage.getRelativePointerPosition();
    if (!ptr) return;
    const t = pointerToAnchorT(ptr, drag.element, drag.facingEdge);
    setAnchorDragOverride({ edge: drag.facingEdge, t });
  };
  const up = () => {
    const drag = dragAnchorRef.current;
    if (drag && anchorDragOverrideRef.current) {
      updateConnectionAnchor(connection.id, drag.end, anchorDragOverrideRef.current);
    }
    dragAnchorRef.current = null;
    setAnchorDragOverride(null);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('touchmove', move);
  window.addEventListener('touchend', up);
};
```

Add helper functions and a ref for the override (so the closure in `up` sees the latest value):

```ts
const anchorDragOverrideRef = useRef<EdgeAnchor | null>(null);
useEffect(() => {
  anchorDragOverrideRef.current = anchorDragOverride;
}, [anchorDragOverride]);

function determineFacingEdge(self: DiagramElement, other: DiagramElement): BoxEdge {
  const sCx = self.position.x + self.size.width / 2;
  const sCy = self.position.y + self.size.height / 2;
  const oCx = other.position.x + other.size.width / 2;
  const oCy = other.position.y + other.size.height / 2;
  const dx = oCx - sCx;
  const dy = oCy - sCy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function pointerToAnchorT(
  pointer: { x: number; y: number },
  el: DiagramElement,
  edge: BoxEdge,
): number {
  if (edge === 'left' || edge === 'right') {
    const t = (pointer.y - el.position.y) / el.size.height;
    return Math.max(0, Math.min(1, t));
  }
  const t = (pointer.x - el.position.x) / el.size.width;
  return Math.max(0, Math.min(1, t));
}
```

Wire up `updateConnectionAnchor` from the store at the top of the component, alongside `updateConnectionWaypoints`:

```ts
const updateConnectionAnchor = useDiagramStore((s) => s.updateConnectionAnchor);
```

- [ ] **Step 2: Live render the dragged anchor**

When `anchorDragOverride` is non-null, override the resolved endpoint when computing `pathResult`. Modify the existing `pathResult` block in `Arrow.tsx` (around line 300-307) to also consider anchor override:

```ts
let pathResult = getConnectionPathPoints(connection, elements, connections);
if (pathResult && !isAttachment && (dragOverride || anchorDragOverride)) {
  const fromEl = elements.find((el) => el.id === connection.from);
  const toEl = elements.find((el) => el.id === connection.to);
  if (fromEl && toEl) {
    if (anchorDragOverride && dragAnchorRef.current) {
      // Synthesize a temporary connection with the drag override applied.
      const tempConn: Connection = {
        ...connection,
        ...(dragAnchorRef.current.end === 'from'
          ? { fromAnchor: anchorDragOverride }
          : { toAnchor: anchorDragOverride }),
      };
      pathResult = { points: computeConnectionPath(tempConn, fromEl, toEl, []) };
    } else if (dragOverride) {
      pathResult = { points: getOrthogonalPath(fromEl, toEl, dragOverride) };
    }
  }
}
```

- [ ] **Step 3: Run typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Click a connection. Drag the blue endpoint dot up and down along the box's edge — the line endpoint slides along the edge. Drop. Verify the anchor persists (click another connection, click back, anchor still where you put it). Save → reload → anchor persists in JSON.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): drag edge anchors along facing edge with persistence"
```

---

### Task 18: Hover-× reset badge for anchors

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

- [ ] **Step 1: Track hover state per anchor handle**

Add state inside `ConnectionArrow`:

```ts
const [hoveredAnchor, setHoveredAnchor] = useState<'from' | 'to' | null>(null);
```

- [ ] **Step 2: Add `onMouseEnter` / `onMouseLeave` to each anchor handle (from Task 16) and a small × badge**

Modify the anchor handle JSX (added in Task 16) to track hover and show a small × when:
- The anchor handle is hovered, AND
- The corresponding `connection.fromAnchor` (or `toAnchor`) is set (i.e., this isn't an auto endpoint).

```tsx
{/* Source anchor handle */}
<Circle
  x={pathPoints[0]}
  y={pathPoints[1]}
  radius={5}
  fill="#3B82F6"
  stroke="#FFFFFF"
  strokeWidth={1.5}
  onMouseDown={(e) => handleAnchorDragStart('from', e)}
  onTouchStart={(e) => handleAnchorDragStart('from', e)}
  onMouseEnter={() => setHoveredAnchor('from')}
  onMouseLeave={() => setHoveredAnchor(null)}
/>
{hoveredAnchor === 'from' && connection.fromAnchor && (
  <Text
    x={pathPoints[0] + 8}
    y={pathPoints[1] - 14}
    text="×"
    fontSize={14}
    fill="#666666"
    onClick={(e) => {
      e.cancelBubble = true;
      updateConnectionAnchor(connection.id, 'from', undefined);
      setHoveredAnchor(null);
    }}
    onTap={(e) => {
      e.cancelBubble = true;
      updateConnectionAnchor(connection.id, 'from', undefined);
      setHoveredAnchor(null);
    }}
  />
)}
{/* Target anchor handle — mirror with onMouseEnter setHoveredAnchor('to') and × at offset from pathPoints.last */}
```

Repeat the same pattern for the `to` anchor (use `pathPoints[pathPoints.length - 2 / -1]` as the handle position).

Add `Text` to the `react-konva` imports at the top:

```ts
import { Circle, Line, Text } from 'react-konva';
```

- [ ] **Step 3: Run typecheck, lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Drag an anchor to set it. Hover over the anchor — a grey × appears just outside the handle. Click the × — the anchor clears, line returns to its auto-resolved entry point. Hover over an anchor that hasn't been manually set — no × appears (auto endpoint).

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): hover-× badge to reset edge anchors"
```

---

### Task 19: "Reset routing" button in Properties Panel for selected connections

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`
- Modify: `src/store/diagramStore.ts`

- [ ] **Step 1: Add a `resetConnectionRouting` action to the store**

In `src/store/diagramStore.ts`, after `updateConnectionAnchor` (added in Task 16):

Interface (around line 95):

```ts
resetConnectionRouting: (id: string) => void;
```

Implementation (after `updateConnectionAnchor` body):

```ts
resetConnectionRouting: (id) =>
  set((state) => ({
    connections: state.connections.map((conn) => {
      if (conn.id !== id) return conn;
      const next = { ...conn };
      delete next.waypoints;
      delete next.fromAnchor;
      delete next.toAnchor;
      return next;
    }),
  })),
```

- [ ] **Step 2: Check whether `PropertiesPanel` currently shows anything for selected connections**

Run: `grep -n "selectedIds\|selectedConnection" src/components/Properties/PropertiesPanel.tsx`

Currently `PropertiesPanel` selects an element via `elements.find((el) => el.id === selectedIds[0])`. There's no connection-selection branch.

For this v1, add a connection branch: if `selectedIds.length === 1` and the id matches a connection (not an element), render a small Properties Panel with a "Reset routing" button.

Add near the top of the component body:

```ts
const connections = useDiagramStore((s) => s.connections);
const resetConnectionRouting = useDiagramStore((s) => s.resetConnectionRouting);

const selectedConnection = selectedIds.length === 1
  ? connections.find((c) => c.id === selectedIds[0])
  : null;
```

Note: connection IDs and element IDs share the same `selectedIds` array in the store. Verify by reading `Canvas.tsx:354` (`handleConnectionSelect`) — it sets `setSelectedIds([conn.id])`. So the same selection field is reused.

- [ ] **Step 3: Render the connection branch in `PropertiesPanel`**

Below the existing `if (!selectedElement)` early return (or before, whichever comes first in the file), add:

```tsx
if (selectedConnection && !selectedElement) {
  return (
    <div className="..."  /* match existing PropertiesPanel container styling */ >
      <label style={labelStyle}>Connection</label>
      <p className="text-xs text-gray-500">
        {selectedConnection.waypoints || selectedConnection.fromAnchor || selectedConnection.toAnchor
          ? 'Manual routing applied.'
          : 'Auto-routed.'}
      </p>
      <button
        onClick={() => resetConnectionRouting(selectedConnection.id)}
        disabled={!selectedConnection.waypoints && !selectedConnection.fromAnchor && !selectedConnection.toAnchor}
        className="mt-2 px-3 py-1.5 text-sm border rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Reset routing
      </button>
    </div>
  );
}
```

(Match the existing styling conventions in `PropertiesPanel.tsx` — look at the existing return for `selectedElement === null` and copy the container className.)

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors.

- [ ] **Step 5: Manual smoke test**

`npm run dev`. Drag a connector segment to add waypoints. Click the connector — Properties Panel shows "Manual routing applied" and an enabled "Reset routing" button. Click it — waypoints clear, line returns to auto. Click an unedited auto-routed connection — button is disabled.

- [ ] **Step 6: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx src/store/diagramStore.ts
git commit -m "feat(properties): Reset routing button for selected connections"
```

---

### Task 20: Verify Ava diagram and the full Anna feedback scenario

**Files:** none (manual verification).

- [ ] **Step 1: Load the reference diagram**

Run `npm run dev`. Click "Load diagram" and select `~/Downloads/4math-ava-day1-5741 (4).json`.

- [ ] **Step 2: Verify Rule 1 (Given → 4 claims)**

Confirm each of Claim 1, DataClaim 2, DataClaim 3, Claim 4 connects to Given via a single straight horizontal line at the claim's own y. No shared "spine."

- [ ] **Step 3: Verify Rule 2 (DC2, DC3, Data 2 → Claim 5)**

Confirm all three lines share a single trunk column. Entries on Claim 5's left edge are at roughly 25%, 50%, 75% of Claim 5's height. Top-most source enters at the top entry.

- [ ] **Step 4: Verify segment-midpoint handles**

Click a connection — white circles appear at the midpoint of each interior segment. Drag a circle to reshape. Save → reload — reshape persists.

- [ ] **Step 5: Verify edge-anchor handles**

Click a connection — blue dots at both endpoints. Drag a dot along the box edge — the line endpoint slides. Drop. Hover the dot — grey × appears. Click × — reverts to auto.

- [ ] **Step 6: Verify Properties Panel reset button**

Manually reshape a connection. Click it. Properties Panel shows "Manual routing applied" with enabled "Reset routing" button. Click it — connection reverts to auto.

- [ ] **Step 7: Verify export bbox**

Pan canvas so a portion is off-screen. Export PNG and PDF. Open each — verify all elements + connections included, no cropping. Export SVG, open in browser — same.

- [ ] **Step 8: Verify contributor bug fix**

Create a Warrant. Cycle Contributor through Given, Teacher, Student, Joint, Implicit — color updates each time. Create a Support (Action). Verify Contributor dropdown appears, switch Teacher↔Student — color updates. Save → reload — values persist.

- [ ] **Step 9: Verify deployment to jenkleiman.com (per `CLAUDE.md`)**

```bash
npm run build
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: connector routing improvements + export bbox + contributor fix"
git push
```

- [ ] **Step 10: Final commit (if any leftover doc changes)**

```bash
git status
# If anything is uncommitted (docs, etc.), commit it.
```

---

## Notes for the implementer

- **Test discipline:** every routing-logic task is TDD — write tests first, see them fail, implement, see them pass, commit. UI tasks (15-19) don't have unit tests; they require manual verification per the steps.
- **Don't refactor opportunistically:** Phase A bug fixes and Phase B/C/D feature work touch separate concerns. Keep commits scoped — don't reformat unrelated code.
- **If a test passes without your implementation, something is wrong.** That means the test isn't actually checking the right behavior. Adjust the test.
- **Stage drag-override logic in `Arrow.tsx`** is fragile — the `useEffect` that refreshes closures on every render is intentional. Don't try to "fix" it.
- **Style consistency:** `PropertiesPanel.tsx` mixes Tailwind classes with `style={...}` objects. Match what's already there in the file you're editing.
- **The `0.3` trunk-position constant** (`TRUNK_RATIO`) is tweakable. Don't expose it via styleConfig in v1 — Anna sees it first.
