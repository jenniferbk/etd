# Qualifier-on-Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the qualifier-on-connection + rebuttal-to-qualifier feature per `docs/superpowers/specs/2026-05-25-qualifier-on-connection-design.md`. Qualifiers live on connection lines; rebuttals (and warrants/backings/implicit) attach to the qualifier when one is present at the click point.

**Architecture:** Add `attachedTo?: { connectionId, position }` to `ArgumentElement`. Palette drags qualifier directly onto a connection's polyline; Canvas hit-tests, computes position-along-polyline (0–1), creates the attached element. Render the qualifier as a small auto-sized box centered on the polyline at `position`. Orphan qualifiers (no `attachedTo`) render with dashed red border + ⚠ until dragged onto a line. Rebuttal target resolution checks for nearby qualifier and points `Connection.to` at the qualifier element id; render with a vertical line that visually passes through the qualifier to the parent connection (no arrowhead).

**Tech Stack:** TypeScript + React 18 + Konva (react-konva) + Zustand. Tests via vitest. Existing geometry in `src/utils/orthogonalRouting.ts` (especially `getPointOnPolyline`, `getEffectiveWaypoints`, `getOrthogonalPath`).

---

## File Structure Overview

**Modified:**
- `src/types/elements.ts` — add `attachedTo` field
- `src/utils/schema.ts` — bump 1.5 → 1.6
- `src/utils/orthogonalRouting.ts` — new helpers: `tForPointOnPolyline`, `hitTestPolyline`
- `src/utils/orthogonalRouting.test.ts` — tests for new helpers
- `src/store/diagramStore.ts` — cascade delete, argumentType change, load-time sweep
- `src/store/diagramStore.test.ts` — tests for new lifecycle behavior
- `src/components/Palette/Palette.tsx` — qualifier drag payload + click-to-create hint
- `src/components/Canvas/Canvas.tsx` — drop branch for qualifier; orphan drag-to-attach; rebuttal-target resolution; `computePolylineFor` helper
- `src/components/Canvas/shapes/Arrow.tsx` — export `getConnectionPathPoints`; new render branch for rebuttal-to-qualifier (vertical through qualifier, no arrowhead, reposition hint)
- `src/components/Canvas/shapes/ArgumentShape.tsx` — qualifier rendering branches (attached/orphan); drag-along-line behavior
- `src/utils/svgExport.ts` — match new rendering
- `src/utils/diagramxExport.ts` — drop `attachedTo`, emit warning

**Created:** none — all changes land in existing files.

---

## Task 1: Add `attachedTo` field to ArgumentElement; bump schema 1.5 → 1.6

**Files:**
- Modify: `src/types/elements.ts:80-86`
- Modify: `src/utils/schema.ts:4`

- [ ] **Step 1: Add the optional field**

In `src/types/elements.ts`, modify the `ArgumentElement` interface:

```ts
export interface ArgumentElement extends BaseElement {
  type: 'argument';
  argumentType: ArgumentType;
  contributor: ContributorType;
  label: string; // e.g., "Claim 1", "Warrant/Data 2"
  /**
   * Only meaningful when argumentType === 'qualifier'.
   * Pins the qualifier to a parent connection at a fractional position along
   * its polyline (0..1, same convention as ConnectionTarget.position).
   * Undefined → orphan/legacy qualifier (renders with dashed red + ⚠).
   */
  attachedTo?: { connectionId: string; position: number };
}
```

- [ ] **Step 2: Bump schema version**

In `src/utils/schema.ts`:

```ts
export const SAVE_SCHEMA_VERSION = '1.6';
```

- [ ] **Step 3: Verify typecheck still clean**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/elements.ts src/utils/schema.ts
git commit -m "feat(schema): add ArgumentElement.attachedTo for qualifier-on-connection (1.6)"
```

---

## Task 2: Add polyline geometry helpers — `tForPointOnPolyline` and `hitTestPolyline`

**Files:**
- Modify: `src/utils/orthogonalRouting.ts` (append near `getPointOnPolyline` at line 351)
- Modify: `src/utils/orthogonalRouting.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/utils/orthogonalRouting.test.ts`:

```ts
import { tForPointOnPolyline, hitTestPolyline } from './orthogonalRouting';

describe('tForPointOnPolyline', () => {
  it('returns 0 for a point at the polyline start', () => {
    const points = [0, 0, 100, 0]; // single horizontal segment
    expect(tForPointOnPolyline({ x: 0, y: 0 }, points)).toBeCloseTo(0, 5);
  });

  it('returns 1 for a point at the polyline end', () => {
    const points = [0, 0, 100, 0];
    expect(tForPointOnPolyline({ x: 100, y: 0 }, points)).toBeCloseTo(1, 5);
  });

  it('returns 0.5 for the midpoint of a single segment', () => {
    const points = [0, 0, 100, 0];
    expect(tForPointOnPolyline({ x: 50, y: 0 }, points)).toBeCloseTo(0.5, 5);
  });

  it('handles a two-segment L-shape: midpoint of total length', () => {
    // 0,0 → 100,0 → 100,100. Total length 200. t=0.5 is at (100,0).
    const points = [0, 0, 100, 0, 100, 100];
    expect(tForPointOnPolyline({ x: 100, y: 0 }, points)).toBeCloseTo(0.5, 5);
  });

  it('projects an off-line point to the nearest polyline point', () => {
    const points = [0, 0, 100, 0];
    // Point (50, 20) projects onto the segment at (50, 0), t=0.5.
    expect(tForPointOnPolyline({ x: 50, y: 20 }, points)).toBeCloseTo(0.5, 5);
  });

  it('clamps to [0,1]', () => {
    const points = [0, 0, 100, 0];
    expect(tForPointOnPolyline({ x: -50, y: 0 }, points)).toBe(0);
    expect(tForPointOnPolyline({ x: 200, y: 0 }, points)).toBe(1);
  });
});

describe('hitTestPolyline', () => {
  it('returns true for a point ON the line', () => {
    expect(hitTestPolyline({ x: 50, y: 0 }, [0, 0, 100, 0], 12)).toBe(true);
  });

  it('returns true for a point within tolerance perpendicular to the line', () => {
    expect(hitTestPolyline({ x: 50, y: 10 }, [0, 0, 100, 0], 12)).toBe(true);
  });

  it('returns false for a point outside tolerance', () => {
    expect(hitTestPolyline({ x: 50, y: 20 }, [0, 0, 100, 0], 12)).toBe(false);
  });

  it('returns false for a point past the endpoints (beyond segment range)', () => {
    expect(hitTestPolyline({ x: 200, y: 0 }, [0, 0, 100, 0], 12)).toBe(false);
  });

  it('hits the second segment of an L-shape', () => {
    const points = [0, 0, 100, 0, 100, 100];
    expect(hitTestPolyline({ x: 100, y: 50 }, points, 12)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/orthogonalRouting.test.ts`
Expected: failures for `tForPointOnPolyline is not a function` / `hitTestPolyline is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/utils/orthogonalRouting.ts`:

```ts
/**
 * For a given point P and a polyline, find the parameter t in [0,1] of the
 * point on the polyline closest to P. Used by qualifier drop/drag to compute
 * "where along this line does the qualifier sit".
 */
export function tForPointOnPolyline(
  p: { x: number; y: number },
  points: number[],
): number {
  if (points.length < 4) return 0;

  let totalLength = 0;
  const segments: { ax: number; ay: number; bx: number; by: number; length: number }[] = [];
  for (let i = 0; i < points.length - 2; i += 2) {
    const ax = points[i], ay = points[i + 1];
    const bx = points[i + 2], by = points[i + 3];
    const length = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
    segments.push({ ax, ay, bx, by, length });
    totalLength += length;
  }
  if (totalLength === 0) return 0;

  let bestT = 0;
  let bestDistSq = Infinity;
  let accLength = 0;
  for (const s of segments) {
    if (s.length === 0) {
      accLength += s.length;
      continue;
    }
    // Project P onto segment, clamp to [0,1] of the segment.
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    let segT = ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / (s.length * s.length);
    segT = Math.max(0, Math.min(1, segT));
    const projX = s.ax + dx * segT;
    const projY = s.ay + dy * segT;
    const distSq = (projX - p.x) ** 2 + (projY - p.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestT = (accLength + segT * s.length) / totalLength;
    }
    accLength += s.length;
  }
  return Math.max(0, Math.min(1, bestT));
}

/**
 * Is point P within `tolerance` pixels of any segment of the polyline?
 * Used by drop hit-test (12px) and rebuttal-target qualifier proximity (20px).
 */
export function hitTestPolyline(
  p: { x: number; y: number },
  points: number[],
  tolerance: number,
): boolean {
  if (points.length < 4) return false;
  const tolSq = tolerance * tolerance;
  for (let i = 0; i < points.length - 2; i += 2) {
    const ax = points[i], ay = points[i + 1];
    const bx = points[i + 2], by = points[i + 3];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((p.x - ax) * dx + (p.y - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + dx * t;
    const projY = ay + dy * t;
    const distSq = (projX - p.x) ** 2 + (projY - p.y) ** 2;
    if (distSq <= tolSq) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/orthogonalRouting.test.ts`
Expected: all 37+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/orthogonalRouting.ts src/utils/orthogonalRouting.test.ts
git commit -m "feat(geometry): add tForPointOnPolyline + hitTestPolyline helpers"
```

---

## Task 3: Store — cascade-delete attached qualifiers when parent connection is removed

**Files:**
- Modify: `src/store/diagramStore.ts` (the `removeConnection` action)
- Modify: `src/store/diagramStore.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/store/diagramStore.test.ts`:

```ts
it('removeConnection cascade-deletes qualifier elements attached to it', () => {
  const store = useDiagramStore.getState();
  store.clearDiagram();

  const dataEl: ArgumentElement = {
    id: 'data-1', type: 'argument', argumentType: 'data', contributor: 'given',
    label: 'Data 1', content: '', position: { x: 0, y: 0 }, size: { width: 100, height: 50 },
  };
  const claimEl: ArgumentElement = {
    id: 'claim-1', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim 1', content: '', position: { x: 300, y: 0 }, size: { width: 100, height: 50 },
  };
  const qualEl: ArgumentElement = {
    id: 'qual-1', type: 'argument', argumentType: 'qualifier', contributor: 'student',
    label: 'Qualifier 1', content: 'probably', position: { x: 200, y: 25 },
    size: { width: 60, height: 24 },
    attachedTo: { connectionId: 'conn-1', position: 0.5 },
  };
  store.addElement(dataEl);
  store.addElement(claimEl);
  store.addElement(qualEl);

  // Manually push a connection (no public 'addConnection' for plain object; use the existing mechanism).
  // Inspect the existing tests to see what's used; if there's a setter, use it. Otherwise, set directly via internal API.
  useDiagramStore.setState({
    connections: [{ id: 'conn-1', from: 'data-1', to: 'claim-1', type: 'support' }],
  });

  store.removeConnection('conn-1');
  const state = useDiagramStore.getState();
  expect(state.connections.find((c) => c.id === 'conn-1')).toBeUndefined();
  expect(state.elements.find((e) => e.id === 'qual-1')).toBeUndefined();
  // Data and claim elements remain.
  expect(state.elements.find((e) => e.id === 'data-1')).toBeDefined();
  expect(state.elements.find((e) => e.id === 'claim-1')).toBeDefined();
});
```

(Check the existing test file for the right way to seed connections — adapt if there's a `addConnection` action or similar. If not, `useDiagramStore.setState({ connections: ... })` is acceptable in tests.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/store/diagramStore.test.ts`
Expected: the new test fails — qualifier element still exists after `removeConnection`.

- [ ] **Step 3: Update `removeConnection` action**

In `src/store/diagramStore.ts`, find the `removeConnection: (id) =>` block and replace with:

```ts
removeConnection: (id) =>
  set((state) => ({
    connections: state.connections.filter((c) => c.id !== id),
    // Cascade-delete qualifier elements attached to this connection.
    elements: state.elements.filter(
      (el) => !(isArgumentElement(el) && el.argumentType === 'qualifier' && el.attachedTo?.connectionId === id),
    ),
  })),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/store/diagramStore.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/diagramStore.ts src/store/diagramStore.test.ts
git commit -m "feat(store): cascade-delete attached qualifiers when parent connection removed"
```

---

## Task 4: Store — load-time orphan sweep + argumentType-change clears `attachedTo`

**Files:**
- Modify: `src/store/diagramStore.ts` (`loadDiagram` and `convertToArgument` actions)
- Modify: `src/store/diagramStore.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/store/diagramStore.test.ts`:

```ts
it('loadDiagram clears attachedTo when its connectionId does not resolve', () => {
  const orphanQual: ArgumentElement = {
    id: 'qual-1', type: 'argument', argumentType: 'qualifier', contributor: 'student',
    label: 'Q1', content: '', position: { x: 0, y: 0 }, size: { width: 60, height: 24 },
    attachedTo: { connectionId: 'ghost-conn', position: 0.5 },
  };
  useDiagramStore.getState().loadDiagram([orphanQual], [], 'Test', null);
  const loaded = useDiagramStore.getState().elements[0] as ArgumentElement;
  expect(loaded.attachedTo).toBeUndefined();
});

it('loadDiagram preserves attachedTo when its connectionId resolves', () => {
  const conn = { id: 'real-conn', from: 'a', to: 'b', type: 'support' as const };
  const qual: ArgumentElement = {
    id: 'qual-1', type: 'argument', argumentType: 'qualifier', contributor: 'student',
    label: 'Q1', content: '', position: { x: 0, y: 0 }, size: { width: 60, height: 24 },
    attachedTo: { connectionId: 'real-conn', position: 0.5 },
  };
  useDiagramStore.getState().loadDiagram([qual], [conn], 'Test', null);
  const loaded = useDiagramStore.getState().elements[0] as ArgumentElement;
  expect(loaded.attachedTo).toEqual({ connectionId: 'real-conn', position: 0.5 });
});

it('convertToArgument clears attachedTo when changing away from qualifier', () => {
  const qual: ArgumentElement = {
    id: 'q1', type: 'argument', argumentType: 'qualifier', contributor: 'student',
    label: 'Q1', content: '', position: { x: 0, y: 0 }, size: { width: 60, height: 24 },
    attachedTo: { connectionId: 'c1', position: 0.5 },
  };
  useDiagramStore.setState({ elements: [qual], connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }] });
  useDiagramStore.getState().convertToArgument('q1', 'claim');
  const after = useDiagramStore.getState().elements[0] as ArgumentElement;
  expect(after.argumentType).toBe('claim');
  expect(after.attachedTo).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/store/diagramStore.test.ts`

- [ ] **Step 3: Implement load-time sweep**

In `src/store/diagramStore.ts`, modify `loadDiagram` (around line 546 — find the `set({ elements: sizedElements, ... })` call) and insert a sweep before the set:

```ts
loadDiagram: (elements, connections, name, transcript, styleConfig) => {
  const connectionIds = new Set(connections.map((c) => c.id));
  // Orphan sweep: clear attachedTo when its connectionId doesn't resolve.
  const sweptElements = elements.map((el) => {
    if (
      isArgumentElement(el) &&
      el.argumentType === 'qualifier' &&
      el.attachedTo &&
      !connectionIds.has(el.attachedTo.connectionId)
    ) {
      const { attachedTo: _drop, ...rest } = el;
      void _drop;
      return rest as ArgumentElement;
    }
    return el;
  });

  // Auto-size all elements on load to ensure content fits
  const sizedElements = sweptElements.map((el) => {
    const autoSize = getAutoSize(el);
    return { ...el, size: autoSize };
  });
  set({
    elements: sizedElements,
    connections,
    selectedIds: [],
    diagramName: name || 'Untitled Diagram',
    transcript: transcript ?? null,
    styleConfig: styleConfig ? normalizeStyleConfig(styleConfig) : createV1_2_MigrationDefaults(),
  });
},
```

- [ ] **Step 4: Implement convertToArgument change**

In `src/store/diagramStore.ts`, find `convertToArgument: (id, argumentType) =>` and ensure the result clears `attachedTo` when argumentType is changing away from qualifier OR setting to qualifier (the second case is just safety — caller may set it later):

```ts
convertToArgument: (id, argumentType) =>
  set((state) => {
    const existingCount = state.elements.filter(
      (el) => isArgumentElement(el) && el.argumentType === argumentType,
    ).length;
    const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${existingCount + 1}`;
    return {
      elements: state.elements.map((el) => {
        if (el.id !== id) return el;
        // Strip attachedTo on any argumentType change. Setting attachedTo for a
        // newly-created qualifier is done at drop time, not by this action.
        const { attachedTo: _drop, ...rest } = el as ArgumentElement;
        void _drop;
        return { ...rest, argumentType, label, type: 'argument' as const, contributor: rest.contributor ?? 'student' };
      }),
    };
  }),
```

(Adapt the exact rebuild logic to match the existing `convertToArgument` body — the key insertion is the strip of `attachedTo`.)

- [ ] **Step 5: Run to verify all tests pass**

Run: `npx vitest run src/store/diagramStore.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/store/diagramStore.ts src/store/diagramStore.test.ts
git commit -m "feat(store): orphan sweep on load + clear attachedTo on argumentType change"
```

---

## Task 5: Palette — qualifier drag payload + remove click-to-create

**Files:**
- Modify: `src/components/Palette/Palette.tsx`

- [ ] **Step 1: Add drag handlers and conditional disable to the Qualifier button**

In `src/components/Palette/Palette.tsx`, find the button(s) for qualifier (likely rendered from ARGUMENT_TYPES map). For the `qualifier` type specifically, set:

```tsx
<button
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('application/x-etd-qualifier', '1');
    e.dataTransfer.effectAllowed = 'copy';
  }}
  onClick={() => addToast('info', 'Drag onto a connection line to place a qualifier.')}
  // ...existing styling
>
  {styleConfig.argumentTypes.qualifier.label}
</button>
```

If the existing render is a generic map, branch on `type === 'qualifier'` inside the map to apply the drag handlers and replace the click handler with the toast. Keep visual styling identical to the other argument buttons.

- [ ] **Step 2: Manual sanity check via dev server**

Run: `npm run dev` (or rely on running instance)
Action: open the app, click the Qualifier button — should show toast "Drag onto a connection line to place a qualifier."

- [ ] **Step 3: Commit**

```bash
git add src/components/Palette/Palette.tsx
git commit -m "feat(palette): qualifier draggable with x-etd-qualifier payload; click shows hint toast"
```

---

## Task 6: Canvas — handle drop of `application/x-etd-qualifier`

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx` (`handleDragOver`, `handleDrop`)

- [ ] **Step 1: Update handleDragOver to accept the new MIME**

Find `handleDragOver`:

```tsx
const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
  if (
    e.dataTransfer.types.includes('application/x-etd-transcript-line') ||
    e.dataTransfer.types.includes('application/x-etd-qualifier')
  ) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
}, []);
```

- [ ] **Step 2: Export `getConnectionPathPoints` from Arrow.tsx**

The function `getConnectionPathPoints(connection, elements, connections)` already exists in `src/components/Canvas/shapes/Arrow.tsx` (around line 103) as a module-local function. Several tasks below (drop handler, qualifier rendering, rebuttal rendering, SVG export) need to call it. Add the `export` keyword:

```ts
// Was: function getConnectionPathPoints(...
export function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): { points: number[]; attachmentStyle?: 'normal' | 'warning' } | null {
  // (existing body unchanged)
}
```

Verify nothing else breaks: `npx tsc --noEmit` exit 0.

- [ ] **Step 3: Add imports + `computePolylineFor` wrapper to Canvas.tsx**

At the top of Canvas.tsx:

```tsx
import { hitTestPolyline, tForPointOnPolyline, getPointOnPolyline } from '../../utils/orthogonalRouting';
import { getConnectionPathPoints } from './shapes/Arrow';
```

And add this tiny wrapper near the other top-level helpers in Canvas.tsx (used by Tasks 6, 7, 9, 10, 11). It returns the flat points array or null when the connection can't be resolved (dangling target, missing element, etc.):

```tsx
function computePolylineFor(
  conn: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): number[] | null {
  const result = getConnectionPathPoints(conn, elements, connections);
  return result?.points ?? null;
}
```

(`getConnectionPathPoints` also handles the arrow-attachment recursion case where `conn.to` is a `ConnectionTarget` — it calls itself on the target connection. So `computePolylineFor` works for all connection shapes.)

- [ ] **Step 4: Add a qualifier branch in handleDrop**

In `handleDrop`, before the transcript-line path, insert:

```tsx
// Qualifier-on-connection drop.
const qualifierFlag = e.dataTransfer.getData('application/x-etd-qualifier');
if (qualifierFlag === '1') {
  e.preventDefault();
  const pos = clientPointToCanvas(e.clientX, e.clientY);

  // Find a connection whose polyline is within 12px of the drop point.
  let hit: { connectionId: string; t: number; polyline: number[] } | null = null;
  for (const conn of connections) {
    const polyline = computePolylineFor(conn, elements, connections);
    if (!polyline) continue;
    if (hitTestPolyline(pos, polyline, 12)) {
      hit = { connectionId: conn.id, t: tForPointOnPolyline(pos, polyline), polyline };
      break;
    }
  }

  if (!hit) {
    addToast('warning', 'Qualifiers must be dropped onto a connection line.');
    return;
  }

  const center = getPointOnPolyline(hit.polyline, hit.t);

  const existingCount = elements.filter(
    (el) => el.type === 'argument' && (el as ArgumentElement).argumentType === 'qualifier',
  ).length;

  const newElement: ArgumentElement = {
    id: generateId(),
    type: 'argument',
    argumentType: 'qualifier',
    contributor: 'student',
    label: `Qualifier ${existingCount + 1}`,
    content: '',
    position: { x: center.x - 30, y: center.y - 12 }, // top-left for a default 60×24 box
    size: { width: 60, height: 24 },
    attachedTo: { connectionId: hit.connectionId, position: hit.t },
  };
  addElement(newElement);
  return;
}
```

- [ ] **Step 5: Manual browser verification**

- Drag the Qualifier palette button over the canvas — cursor should show "copy" feedback over connections.
- Drop on a connection line → new qualifier element appears at drop point with default label "Qualifier N".
- Drop NOT on a line → toast appears, no element created.

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/Canvas.tsx src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): drop qualifier on connection line; reject drops off-line with toast"
```

---

## Task 7: ArgumentShape — render attached qualifier as small box on the line

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`

- [ ] **Step 1: Branch the render path for attached qualifier**

At the top of `ArgumentShape`, after the existing styleConfig/store reads, add:

```tsx
const isAttachedQualifier =
  element.argumentType === 'qualifier' && element.attachedTo !== undefined;
const isOrphanQualifier =
  element.argumentType === 'qualifier' && element.attachedTo === undefined;
```

Compute the geometric center for attached qualifiers from the parent connection's polyline:

```tsx
const attachedCenter = useMemo(() => {
  if (!isAttachedQualifier || !element.attachedTo) return null;
  const parentConn = connections.find((c) => c.id === element.attachedTo!.connectionId);
  if (!parentConn) return null;
  const polyline = computePolylineFor(parentConn, elements, connections);
  if (!polyline) return null;
  return getPointOnPolyline(polyline, element.attachedTo.position);
}, [isAttachedQualifier, element.attachedTo, connections, elements]);
```

(Reuse the `computePolylineFor` helper from Task 6.)

In the render JSX, for `isAttachedQualifier && attachedCenter`, replace the default rect with a small auto-sized box:

```tsx
if (isAttachedQualifier && attachedCenter) {
  const text = element.content || element.label || 'qualifier';
  const measuredWidth = Math.max(40, text.length * 7 + 16); // rough auto-size; tune in browser
  const measuredHeight = 24;
  return (
    <Group
      ref={shapeRef}
      x={attachedCenter.x - measuredWidth / 2}
      y={attachedCenter.y - measuredHeight / 2}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDoubleClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
    >
      <Rect
        width={measuredWidth}
        height={measuredHeight}
        fill={style.backgroundColor}
        stroke={style.borderColor}
        strokeWidth={2}
      />
      <Text
        x={8}
        y={6}
        width={measuredWidth - 16}
        text={text}
        fontSize={11}
        fontStyle="italic"
        fill="#000000"
        align="center"
      />
      {isSelected && (
        <Rect
          width={measuredWidth + 6}
          height={measuredHeight + 6}
          x={-3}
          y={-3}
          stroke="#4A90D9"
          strokeWidth={2}
          fill="transparent"
          dash={[5, 3]}
        />
      )}
    </Group>
  );
}
```

(Konva text-measure is the proper way to compute width — for now the rough formula works; refine if needed during browser verification.)

- [ ] **Step 2: Manual browser verification**

- Drop a qualifier on a data→claim connection.
- Verify the qualifier renders as a small box centered on the line, with auto-sized width.
- Verify the connection line is occluded behind the box.

- [ ] **Step 3: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx
git commit -m "feat(canvas): render attached qualifier as small auto-sized box on parent polyline"
```

---

## Task 8: ArgumentShape — orphan qualifier rendering (dashed red + ⚠)

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`

- [ ] **Step 1: Add orphan branch**

In `ArgumentShape`, before the `isAttachedQualifier` branch:

```tsx
if (isOrphanQualifier) {
  // Falls through to the normal rect render below, but with override styling:
  // dashed red border + ⚠ icon top-right. Implement by passing override props
  // into the existing rect render path, or by an inline early return that
  // mirrors the existing path with style overrides.
}
```

The cleanest implementation: keep the normal render path but compute the border color/style/dash conditionally:

```tsx
const orphanOverride = isOrphanQualifier
  ? { borderColor: '#CC0000', borderStyle: 'dashed' as const, borderWidth: 2 }
  : null;
const effectiveBorderColor = orphanOverride?.borderColor ?? style.borderColor;
const effectiveBorderWidth = orphanOverride?.borderWidth ?? style.borderWidth;
const effectiveDashArray = orphanOverride
  ? [6, 4]
  : dashArrayForBorderStyle(style.borderStyle);
```

Use `effectiveBorderColor`, `effectiveBorderWidth`, `effectiveDashArray` in the existing Rect/Path/etc render.

Then add a ⚠ marker in the existing Group, conditional on `isOrphanQualifier`:

```tsx
{isOrphanQualifier && (
  <Text
    x={size.width - 16}
    y={4}
    text="⚠"
    fontSize={14}
    fill="#CC0000"
  />
)}
```

- [ ] **Step 2: Add a PropertiesPanel banner (optional, can be a follow-up if scope creeps)**

Skip this if it expands the task too much. If included, in `PropertiesPanel.tsx`, when selected element is `argumentType === 'qualifier' && attachedTo === undefined`, render a small banner at the top:

```tsx
{isOrphanQualifier && (
  <div style={{ padding: '8px', background: '#FFEBEB', border: '1px solid #CC0000', borderRadius: 4, fontSize: 12, color: '#9B0000' }}>
    Unattached qualifier — drag onto a connection line to attach.
  </div>
)}
```

- [ ] **Step 3: Manual browser verification**

- Create a legacy qualifier (load a 1.5 file with a standalone qualifier, OR manually create one via Properties-panel convert).
- Verify it renders with dashed red border + ⚠ at top-right.

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(canvas): orphan qualifier renders dashed red + ⚠ marker"
```

---

## Task 9: Drag-along-line + orphan drag-to-attach

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx` (or Canvas.tsx wherever drag handlers route)
- Modify: `src/components/Canvas/Canvas.tsx` (likely the drag-end handler that updates positions)

- [ ] **Step 1: For attached qualifier, snap drag along the parent polyline**

In `ArgumentShape` (or wherever onDragMove for argument elements lives), special-case `isAttachedQualifier`:

```tsx
const handleQualifierDragMove = (e: KonvaEventObject<DragEvent>) => {
  if (!isAttachedQualifier || !element.attachedTo) return;
  const node = e.target as Konva.Group;
  const cursor = { x: node.x() + measuredWidth / 2, y: node.y() + measuredHeight / 2 };
  const parentConn = connections.find((c) => c.id === element.attachedTo!.connectionId);
  if (!parentConn) return;
  const polyline = computePolylineFor(parentConn, elements, connections);
  if (!polyline) return;

  // Distance check: if cursor is > 40px from the polyline, snap back (don't update).
  if (!hitTestPolyline(cursor, polyline, 40)) {
    // Snap back: force node back to last-known good position
    node.position({ x: attachedCenter!.x - measuredWidth / 2, y: attachedCenter!.y - measuredHeight / 2 });
    return;
  }

  const newT = tForPointOnPolyline(cursor, polyline);
  const newCenter = getPointOnPolyline(polyline, newT);
  // Update node position visually during drag
  node.position({ x: newCenter.x - measuredWidth / 2, y: newCenter.y - measuredHeight / 2 });
};

const handleQualifierDragEnd = (e: KonvaEventObject<DragEvent>) => {
  if (!isAttachedQualifier || !element.attachedTo) return;
  const node = e.target as Konva.Group;
  const cursor = { x: node.x() + measuredWidth / 2, y: node.y() + measuredHeight / 2 };
  const parentConn = connections.find((c) => c.id === element.attachedTo!.connectionId);
  if (!parentConn) return;
  const polyline = computePolylineFor(parentConn, elements, connections);
  if (!polyline) return;
  const newT = tForPointOnPolyline(cursor, polyline);
  updateElement(element.id, {
    attachedTo: { connectionId: element.attachedTo.connectionId, position: newT },
  } as Partial<DiagramElement>);
};
```

Wire `onDragMove={handleQualifierDragMove}` and `onDragEnd={handleQualifierDragEnd}` on the attached-qualifier Group.

- [ ] **Step 2: For orphan qualifier, allow free drag + auto-attach on drop**

In the orphan render branch, on `onDragEnd`:

```tsx
const handleOrphanDragEnd = (e: KonvaEventObject<DragEvent>) => {
  if (!isOrphanQualifier) return;
  const node = e.target;
  const cursor = { x: node.x() + size.width / 2, y: node.y() + size.height / 2 };

  for (const conn of connections) {
    const polyline = computePolylineFor(conn, elements, connections);
    if (!polyline) continue;
    if (hitTestPolyline(cursor, polyline, 12)) {
      const t = tForPointOnPolyline(cursor, polyline);
      const center = getPointOnPolyline(polyline, t);
      updateElement(element.id, {
        attachedTo: { connectionId: conn.id, position: t },
        position: { x: center.x - 30, y: center.y - 12 },
      } as Partial<DiagramElement>);
      return;
    }
  }

  // Miss — free reposition (existing behavior for orphans)
  updateElement(element.id, { position: { x: node.x(), y: node.y() } } as Partial<DiagramElement>);
};
```

- [ ] **Step 3: Manual browser verification**

- Attached qualifier: drag along the line — slides smoothly; cursor far off the line → snaps back.
- Orphan qualifier: drag onto a line → attaches with proper position; drag elsewhere → stays orphan, new position.

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): drag-along-line for attached qualifier; orphan drag-to-attach"
```

---

## Task 10: Canvas — rebuttal/warrant target resolution checks for qualifier

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Find the existing rebuttal/warrant arrow-attachment code**

Search Canvas.tsx for the click handler that resolves a target click to a `ConnectionTarget` (look for `connectingFrom`, `isArrowAttachment`, or where `Connection.to` is set to an object with `connectionId`).

- [ ] **Step 2: Insert qualifier proximity check**

Where the code currently sets `to: { connectionId, position }`, wrap that decision:

```ts
// Before: directly construct ConnectionTarget.
// After: check if a qualifier is on this connection near the click point.
const clickedPoint = pos; // canvas coords
const tOnLine = /* existing math */;
const NEAR_QUALIFIER_PX = 20;

const qualifier = elements.find(
  (el) =>
    isArgumentElement(el) &&
    el.argumentType === 'qualifier' &&
    el.attachedTo?.connectionId === hitConnectionId &&
    Math.abs(getPointOnPolyline(polyline, el.attachedTo.position).x - clickedPoint.x) <= NEAR_QUALIFIER_PX,
);

const newConnection: Connection = {
  id: generateId(),
  from: connectingFromId,
  to: qualifier
    ? qualifier.id  // string element-id target
    : { connectionId: hitConnectionId, position: tOnLine },
  type: 'support',
};
```

This applies to any source element that uses arrow-attachment (warrant, backing, implicit-warrant, rebuttal — they all share the same flow).

- [ ] **Step 3: Manual browser verification**

- Place a qualifier on a data→claim connection.
- Add a rebuttal element on the canvas.
- Enter Connect Mode (C), click rebuttal as source, click connection at the qualifier's position → inspect the resulting Connection.to — should be the qualifier's element id (not a ConnectionTarget).

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): retarget arrow-attachment to qualifier when one is at click point"
```

---

## Task 11: Canvas — render rebuttal-to-qualifier line (vertical through qualifier, no arrowhead)

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (the `ConnectionArrow` component — connections are rendered here, not in Canvas.tsx)

- [ ] **Step 1: Locate the render output of `ConnectionArrow`**

Open `src/components/Canvas/shapes/Arrow.tsx` and find the return statement inside `ConnectionArrow` (around line 149 onward). The component currently computes `pathResult` via `getConnectionPathPoints` (or the dragging override) and renders `<Line points={pathResult.points} … />` plus an arrowhead marker.

- [ ] **Step 2: Branch when `Connection.to` is a qualifier element id**

Near the top of `ConnectionArrow`'s render body — after the source/target elements are resolved, before the path computation — add a check. When the target is a qualifier with `attachedTo`, return the special vertical-through-qualifier rendering and skip the normal path computation:

```tsx
const targetEl = typeof conn.to === 'string'
  ? elements.find((e) => e.id === conn.to)
  : null;

const isTargetQualifier =
  targetEl && targetEl.type === 'argument' &&
  (targetEl as ArgumentElement).argumentType === 'qualifier' &&
  (targetEl as ArgumentElement).attachedTo !== undefined;

if (isTargetQualifier) {
  // Render vertical line from source (rebuttal) down to parent connection line.
  const qual = targetEl as ArgumentElement;
  const parentConn = connections.find((c) => c.id === qual.attachedTo!.connectionId);
  const polyline = parentConn ? computePolylineFor(parentConn, elements, connections) : null;
  if (!polyline) return null;
  const qualCenter = getPointOnPolyline(polyline, qual.attachedTo!.position);

  const sourceEl = elements.find((e) => e.id === conn.from);
  if (!sourceEl) return null;
  const sourceCenter = {
    x: sourceEl.position.x + sourceEl.size.width / 2,
    y: sourceEl.position.y + sourceEl.size.height / 2,
  };

  const X_TOLERANCE = 4;
  const aligned = Math.abs(sourceCenter.x - qualCenter.x) <= X_TOLERANCE;

  if (!aligned) {
    // Render a faint dashed gray "reposition me" hint
    return (
      <Line
        key={conn.id}
        points={[sourceCenter.x, sourceCenter.y, qualCenter.x, qualCenter.y]}
        stroke="#999"
        strokeWidth={1}
        dash={[4, 4]}
      />
    );
  }

  // Vertical line: from source bottom edge straight down to parent polyline y.
  return (
    <Line
      key={conn.id}
      points={[qualCenter.x, sourceEl.position.y + sourceEl.size.height, qualCenter.x, qualCenter.y]}
      stroke="#000000"
      strokeWidth={1.5}
      // No arrowhead.
    />
  );
}

// otherwise: existing render path
```

- [ ] **Step 3: Manual browser verification**

- With qualifier on a connection and rebuttal targeting it (from Task 10), verify:
  - Vertical line from rebuttal down through the qualifier to the connection line.
  - No arrowhead.
  - If rebuttal is dragged horizontally off the qualifier's x, the line becomes a faint dashed gray diagonal.

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): render rebuttal-to-qualifier line vertically through qualifier"
```

---

## Task 12: SVG export — match new rendering

**Files:**
- Modify: `src/utils/svgExport.ts`

- [ ] **Step 1: Branch the argument-svg renderer for attached qualifier**

In `renderArgumentSvg`, before the default rect render, check `attachedTo`:

```ts
if (el.argumentType === 'qualifier' && el.attachedTo) {
  const parentConn = connections.find((c) => c.id === el.attachedTo!.connectionId);
  const polyline = parentConn ? computePolylineFor(parentConn, elements, connections) : null;
  if (polyline) {
    const center = getPointOnPolyline(polyline, el.attachedTo.position);
    const text = el.content || el.label || 'qualifier';
    const w = Math.max(40, text.length * 7 + 16);
    const h = 24;
    return `<g>
      <rect x="${center.x - w/2 + offsetX}" y="${center.y - h/2 + offsetY}" width="${w}" height="${h}"
        fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="2"/>
      <text x="${center.x + offsetX}" y="${center.y + 4 + offsetY}" text-anchor="middle"
        font-size="11" font-style="italic">${escapeXml(text)}</text>
    </g>`;
  }
}
// orphan or non-qualifier: existing path
```

`renderArgumentSvg` will need `connections` + `elements` + `offsetX/offsetY` in scope — they're already passed to the file's top-level helpers from prior tasks.

- [ ] **Step 2: Branch the connection-svg renderer for rebuttal-to-qualifier**

In `renderConnectionSvg`, check `conn.to`:

```ts
const targetEl = typeof conn.to === 'string' ? elements.find((e) => e.id === conn.to) : null;
const isTargetQualifier = targetEl && (targetEl as ArgumentElement).attachedTo !== undefined &&
  (targetEl as ArgumentElement).argumentType === 'qualifier';

if (isTargetQualifier) {
  const qual = targetEl as ArgumentElement;
  const parentConn = connections.find((c) => c.id === qual.attachedTo!.connectionId);
  const polyline = parentConn ? computePolylineFor(parentConn, elements, connections) : null;
  if (!polyline) return '';
  const qualCenter = getPointOnPolyline(polyline, qual.attachedTo!.position);
  const sourceEl = elements.find((e) => e.id === conn.from);
  if (!sourceEl) return '';
  return `<line
    x1="${qualCenter.x + offsetX}" y1="${sourceEl.position.y + sourceEl.size.height + offsetY}"
    x2="${qualCenter.x + offsetX}" y2="${qualCenter.y + offsetY}"
    stroke="#000000" stroke-width="1.5"/>`;
}
// otherwise: existing render path
```

- [ ] **Step 3: Manual verification**

Export an SVG with an attached qualifier + rebuttal targeting it. Open the file. Visually compare against the canvas — both should match.

- [ ] **Step 4: Commit**

```bash
git add src/utils/svgExport.ts
git commit -m "feat(export): SVG render matches qualifier-on-connection + rebuttal-to-qualifier"
```

---

## Task 13: DiagramX export — drop `attachedTo`, emit warning toast

**Files:**
- Modify: `src/utils/diagramxExport.ts`
- Modify: `src/components/Toolbar/Toolbar.tsx` (the .diagramx export button's toast logic)

- [ ] **Step 1: Strip `attachedTo` from elements during diagramxExport**

In `src/utils/diagramxExport.ts`, where elements are serialized, omit `attachedTo`:

```ts
// When building the .diagramx element list:
const serializableEl = { ...el };
if ('attachedTo' in serializableEl) delete (serializableEl as Partial<ArgumentElement>).attachedTo;
```

- [ ] **Step 2: Detect-and-warn**

Export a helper or expose detection:

```ts
export function hasAttachedQualifiers(elements: DiagramElement[]): boolean {
  return elements.some(
    (el) => el.type === 'argument' &&
            (el as ArgumentElement).argumentType === 'qualifier' &&
            (el as ArgumentElement).attachedTo !== undefined,
  );
}
```

In `Toolbar.tsx`'s `handleExportDiagramx`, after the existing `hasEmbeddedImages` toast:

```ts
if (hasAttachedQualifiers(elements)) {
  addToast('warning', 'Qualifier-on-connection positions were dropped — DiagramMix does not support inline qualifiers.');
}
```

- [ ] **Step 3: Manual verification**

- Add an attached qualifier, export .diagramx, observe warning toast.
- Open the exported file in a JSON viewer — confirm `attachedTo` is absent.

- [ ] **Step 4: Commit**

```bash
git add src/utils/diagramxExport.ts src/components/Toolbar/Toolbar.tsx
git commit -m "feat(export): .diagramx drops attachedTo with warning toast"
```

---

## Task 14: Browser end-to-end verification + commit

**Files:**
- None (verification only); fix any regressions found.

- [ ] **Step 1: Run the full check suite**

```bash
npm run build && npm test && npm run lint
```

Expected:
- Build clean.
- All tests pass (existing 101 + new ones from Tasks 2–4).
- Lint regression-free.

- [ ] **Step 2: Browser scenarios at localhost:5173**

For each, observe and verify behavior:

1. **Drop on connection** — drag Qualifier from Palette onto a data→claim arrow → qualifier appears centered on the arrow with auto-sized box.
2. **Drop off connection** — drag Qualifier off any line → toast "Qualifiers must be dropped onto a connection line." No element created.
3. **Drag along line** — drag the qualifier; it slides along the connection; cursor far off (40px+) → snaps back.
4. **Rebuttal target** — connect-mode, click rebuttal, click connection at qualifier's x → rebuttal connects via vertical line through qualifier, no arrowhead.
5. **Rebuttal alignment hint** — manually move rebuttal so its x differs from qualifier's x → line becomes faint dashed gray hint.
6. **Cascade delete** — delete the parent data→claim connection → qualifier element is removed in the same operation; undo restores both.
7. **Load legacy** — load a 1.5 JSON file with a qualifier element → renders with dashed red + ⚠. Drag it onto a connection → attaches.
8. **Load bad attachedTo** — manually edit a saved JSON so a qualifier's `attachedTo.connectionId` points at a non-existent connection → on load, qualifier appears as orphan (sweep cleared attachedTo).
9. **Save and reload** — save with attached qualifier, reload, verify the qualifier is still attached at the right position.
10. **SVG export** — export and inspect; matches canvas.
11. **DiagramX export** — warning toast appears; `attachedTo` absent in exported file.

- [ ] **Step 3: If any browser scenario fails**

Diagnose and fix inline. Do not advance until all 11 scenarios pass.

- [ ] **Step 4: Final commit (only if fix-ups needed)**

```bash
git add <files-touched>
git commit -m "fix(qualifier): <one-line description of the fix>"
```

---

## Done

The qualifier-on-connection feature is complete when all 11 browser scenarios pass. Push and deploy via the standard workflow (see CLAUDE.md): `git push`, `npm run build`, copy `dist/` to `~/Documents/GitHub/jenkleiman.com/public/tools/etd/`, commit + push that repo. Netlify auto-deploys.
