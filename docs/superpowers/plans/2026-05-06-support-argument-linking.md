# Support → argument linking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit `associatedWith` link on `SupportElement` plus visual cluster halos (drag + selection) and sticky-group movement when dragging an argument.

**Architecture:** A pure `clusters.ts` module computes clusters by BFS over the overlap graph, with arguments acting as walls. A `<ClusterHalo>` Konva component renders the halo. Canvas integration wires sticky-group drag (suppressed during multi-select) and a single-BFS auto-suggest on support drop. Two new Zustand actions (`moveCluster`, `moveAndLink`) batch related writes into one zundo entry; `removeElement` is modified to scrub dangling refs atomically.

**Tech Stack:** TypeScript, React 19, react-konva, Zustand + zundo, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-06-support-argument-linking-design.md`

---

## Task 1: Add `associatedWith` to SupportElement

**Files:**
- Modify: `src/types/elements.ts:87-92`

- [ ] **Step 1: Add the optional field**

In `src/types/elements.ts`, change the `SupportElement` interface from:

```ts
export interface SupportElement extends BaseElement {
  type: 'support';
  contributor: SupportContributor;
  supportType: SupportType;
  subtype?: SupportSubtype;
}
```

to:

```ts
export interface SupportElement extends BaseElement {
  type: 'support';
  contributor: SupportContributor;
  supportType: SupportType;
  subtype?: SupportSubtype;
  associatedWith?: string;   // argument element id; sticky after first auto-suggest
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. The new optional field is forward-compatible — no existing code reads or writes it yet.

- [ ] **Step 3: Commit**

```bash
git add src/types/elements.ts
git commit -m "feat(support): add associatedWith field to SupportElement"
```

---

## Task 2: Failing tests for clusters utility

TDD red phase: define the contract for `bboxesOverlap`, `computeCluster`, and `unionBbox`.

**Files:**
- Create: `src/utils/clusters.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/utils/clusters.test.ts` with this exact content:

```ts
import { describe, it, expect } from 'vitest';
import {
  bboxesOverlap,
  computeCluster,
  unionBbox,
} from './clusters';
import type {
  ArgumentElement,
  SupportElement,
  DiagramElement,
} from '../types';

function arg(id: string, x: number, y: number, w = 100, h = 60): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

function sup(id: string, x: number, y: number, w = 80, h = 40): SupportElement {
  return {
    id, type: 'support', contributor: 'teacher',
    supportType: 'question', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

describe('bboxesOverlap', () => {
  it('returns false for fully disjoint rects', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 50, 50), arg('b', 100, 100, 50, 50))).toBe(false);
  });
  it('returns true for overlapping rects', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 100, 100), arg('b', 50, 50, 100, 100))).toBe(true);
  });
  it('returns true when one rect contains another', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 200, 200), arg('b', 50, 50, 50, 50))).toBe(true);
  });
  it('treats edge-touching as no overlap', () => {
    // rect a ends at x=100; rect b starts at x=100 — share zero area
    expect(bboxesOverlap(arg('a', 0, 0, 100, 100), arg('b', 100, 0, 100, 100))).toBe(false);
  });
  it('returns true for identical rects', () => {
    expect(bboxesOverlap(arg('a', 10, 20, 30, 40), arg('b', 10, 20, 30, 40))).toBe(true);
  });
});

describe('computeCluster', () => {
  it('returns null when argumentId is not found', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0)];
    expect(computeCluster(elements, 'nonexistent')).toBeNull();
  });

  it('returns null when argumentId refers to a non-argument element', () => {
    const elements: DiagramElement[] = [sup('s', 0, 0)];
    expect(computeCluster(elements, 's')).toBeNull();
  });

  it('returns the argument with empty supports when nothing overlaps', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0), sup('s', 500, 500)];
    const cluster = computeCluster(elements, 'a');
    expect(cluster).not.toBeNull();
    expect(cluster!.argument.id).toBe('a');
    expect(cluster!.supports).toEqual([]);
  });

  it('includes a directly-overlapping support', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0, 100, 100), sup('s', 50, 50)];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id)).toEqual(['s']);
  });

  it('walks transitively: support B overlaps support A which overlaps argument', () => {
    const elements: DiagramElement[] = [
      arg('a', 0, 0, 100, 100),
      sup('sA', 80, 50, 80, 40),    // overlaps a
      sup('sB', 150, 60, 80, 40),   // overlaps sA only, not a
    ];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id).sort()).toEqual(['sA', 'sB']);
  });

  it('respects argument walls — does not cross through another argument', () => {
    const elements: DiagramElement[] = [
      arg('a1', 0, 0, 100, 100),
      sup('sBridge', 80, 50, 100, 40),   // overlaps both a1 and a2
      arg('a2', 160, 50, 100, 100),
      sup('sIsland', 250, 60, 80, 40),   // overlaps a2 only
    ];
    const c1 = computeCluster(elements, 'a1')!;
    expect(c1.supports.map(s => s.id).sort()).toEqual(['sBridge']);
    expect(c1.supports.find(s => s.id === 'sIsland')).toBeUndefined();

    const c2 = computeCluster(elements, 'a2')!;
    expect(c2.supports.map(s => s.id).sort()).toEqual(['sBridge', 'sIsland']);
  });

  it('terminates on cycles in the overlap graph', () => {
    const elements: DiagramElement[] = [
      arg('a', 0, 0, 100, 100),
      sup('s1', 90, 50),
      sup('s2', 95, 55),  // overlaps s1 and s3
      sup('s3', 100, 60), // overlaps s2 and s1 (back to s1 from a different angle)
    ];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id).sort()).toEqual(['s1', 's2', 's3']);
  });
});

describe('unionBbox', () => {
  it('returns the element rect for a single element', () => {
    const result = unionBbox([arg('a', 10, 20, 30, 40)]);
    expect(result).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('returns the smallest enclosing rect for multiple elements', () => {
    const result = unionBbox([
      arg('a', 0, 0, 50, 50),
      arg('b', 100, 80, 30, 30),
    ]);
    expect(result).toEqual({ x: 0, y: 0, width: 130, height: 110 });
  });
});
```

- [ ] **Step 2: Run tests, verify they all fail**

Run: `npm test`
Expected: all tests fail with `Failed to load url ./clusters` — module doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
git add src/utils/clusters.test.ts
git commit -m "test(clusters): add failing tests for cluster geometry"
```

---

## Task 3: Implement clusters utility

**Files:**
- Create: `src/utils/clusters.ts`
- Test: `src/utils/clusters.test.ts` (already in place)

- [ ] **Step 1: Create the module**

Create `src/utils/clusters.ts` with this exact content:

```ts
// Cluster geometry for support→argument linking.
// Pure functions — no React, no Konva.

import type {
  ArgumentElement,
  BaseElement,
  DiagramElement,
  SupportElement,
} from '../types';
import { isArgumentElement, isSupportElement } from '../types';

export interface Cluster {
  argument: ArgumentElement;
  supports: SupportElement[];
}

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard axis-aligned rect intersection. Edge-touching returns false. */
export function bboxesOverlap(a: BaseElement, b: BaseElement): boolean {
  return (
    a.position.x < b.position.x + b.size.width &&
    a.position.x + a.size.width > b.position.x &&
    a.position.y < b.position.y + b.size.height &&
    a.position.y + a.size.height > b.position.y
  );
}

/**
 * BFS over overlap graph from the anchor argument.
 * Walls at non-anchor arguments — the cluster only walks through supports.
 * Returns null if argumentId is missing or not an argument.
 */
export function computeCluster(
  elements: DiagramElement[],
  argumentId: string,
): Cluster | null {
  const anchor = elements.find((el) => el.id === argumentId);
  if (!anchor || !isArgumentElement(anchor)) return null;

  const visited = new Set<string>([anchor.id]);
  const queue: DiagramElement[] = [anchor];
  const supports: SupportElement[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of elements) {
      if (visited.has(candidate.id)) continue;
      if (!bboxesOverlap(current, candidate)) continue;
      // Wall: another argument blocks traversal (it's still marked visited
      // so we don't re-check it, but we don't queue it and don't add to supports).
      if (isArgumentElement(candidate) && candidate.id !== anchor.id) {
        visited.add(candidate.id);
        continue;
      }
      visited.add(candidate.id);
      if (isSupportElement(candidate)) {
        supports.push(candidate);
        queue.push(candidate);
      }
      // Other element types (InfoBox, deprecated TeacherSupport) are absorbed
      // into visited but neither added to supports nor walked from.
    }
  }

  return { argument: anchor, supports };
}

/** Smallest axis-aligned rect enclosing all elements. Assumes non-empty input. */
export function unionBbox(elements: BaseElement[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + el.size.width);
    maxY = Math.max(maxY, el.position.y + el.size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
```

- [ ] **Step 2: Run tests, verify all pass**

Run: `npm test`
Expected: all 14 tests in `clusters.test.ts` pass (5 bboxesOverlap + 7 computeCluster + 2 unionBbox).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds with no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/clusters.ts
git commit -m "feat(clusters): add cluster geometry utilities"
```

---

## Task 4: Failing tests for store actions

TDD red phase: define the contract for `moveCluster`, `moveAndLink`, and the modified `removeElement`.

**Files:**
- Create: `src/store/diagramStore.test.ts`

- [ ] **Step 1: Read the existing store to understand its shape**

Read `src/store/diagramStore.ts` (especially the action signatures and how `set` is called) so the test file matches the existing import path and store-creation pattern.

- [ ] **Step 2: Create the test file**

Create `src/store/diagramStore.test.ts` with this exact content:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDiagramStore } from './diagramStore';
import type { ArgumentElement, SupportElement } from '../types';

function arg(id: string, x = 0, y = 0): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: 100, height: 60 },
  };
}

function sup(id: string, x = 0, y = 0, associatedWith?: string): SupportElement {
  return {
    id, type: 'support', contributor: 'teacher',
    supportType: 'question', content: '',
    position: { x, y }, size: { width: 80, height: 40 },
    ...(associatedWith ? { associatedWith } : {}),
  };
}

beforeEach(() => {
  useDiagramStore.setState({
    elements: [],
    connections: [],
    selectedIds: [],
  });
});

describe('moveCluster', () => {
  it('updates positions for every id in startPositions', () => {
    useDiagramStore.setState({
      elements: [arg('a', 10, 20), sup('s1', 30, 40), sup('s2', 50, 60)],
    });
    const startPositions = new Map([
      ['a', { x: 10, y: 20 }],
      ['s1', { x: 30, y: 40 }],
      ['s2', { x: 50, y: 60 }],
    ]);
    useDiagramStore.getState().moveCluster(startPositions, { x: 5, y: 7 });
    const els = useDiagramStore.getState().elements;
    expect(els.find(e => e.id === 'a')!.position).toEqual({ x: 15, y: 27 });
    expect(els.find(e => e.id === 's1')!.position).toEqual({ x: 35, y: 47 });
    expect(els.find(e => e.id === 's2')!.position).toEqual({ x: 55, y: 67 });
  });

  it('leaves elements not in startPositions untouched', () => {
    useDiagramStore.setState({
      elements: [arg('a', 10, 20), sup('outside', 200, 200)],
    });
    const startPositions = new Map([['a', { x: 10, y: 20 }]]);
    useDiagramStore.getState().moveCluster(startPositions, { x: 5, y: 5 });
    expect(useDiagramStore.getState().elements.find(e => e.id === 'outside')!.position)
      .toEqual({ x: 200, y: 200 });
  });
});

describe('moveAndLink', () => {
  it('updates position and associatedWith in one transition', () => {
    useDiagramStore.setState({ elements: [sup('s', 0, 0)] });
    useDiagramStore.getState().moveAndLink('s', { x: 100, y: 50 }, 'argA');
    const s = useDiagramStore.getState().elements.find(e => e.id === 's') as SupportElement;
    expect(s.position).toEqual({ x: 100, y: 50 });
    expect(s.associatedWith).toBe('argA');
  });

  it('clears associatedWith when passed null', () => {
    useDiagramStore.setState({ elements: [sup('s', 0, 0, 'argA')] });
    useDiagramStore.getState().moveAndLink('s', { x: 5, y: 5 }, null);
    const s = useDiagramStore.getState().elements.find(e => e.id === 's') as SupportElement;
    expect(s.position).toEqual({ x: 5, y: 5 });
    expect(s.associatedWith).toBeUndefined();
  });

  it('does nothing if id is not a support', () => {
    useDiagramStore.setState({ elements: [arg('a', 0, 0)] });
    // Type-wise ok at runtime; behaviorally a no-op or no-throw — assert no crash.
    useDiagramStore.getState().moveAndLink('a', { x: 50, y: 50 }, 'other');
    const a = useDiagramStore.getState().elements.find(e => e.id === 'a')!;
    // Position should not change (non-support not handled by this action), or
    // at minimum the call should not throw. Both behaviors are acceptable; we
    // only assert that the support-link semantics don't accidentally pollute
    // an argument element. The implementation should explicitly skip non-supports.
    expect((a as ArgumentElement).type).toBe('argument');
  });
});

describe('removeElement scrub', () => {
  it('clears associatedWith on supports linked to a removed argument', () => {
    useDiagramStore.setState({
      elements: [
        arg('argA'),
        sup('s1', 0, 0, 'argA'),
        sup('s2', 0, 0, 'argA'),
        sup('s3', 0, 0, 'argB'),  // linked to a different arg, should not be touched
      ],
    });
    useDiagramStore.getState().removeElement('argA');
    const els = useDiagramStore.getState().elements;
    expect(els.find(e => e.id === 'argA')).toBeUndefined();
    expect((els.find(e => e.id === 's1') as SupportElement).associatedWith).toBeUndefined();
    expect((els.find(e => e.id === 's2') as SupportElement).associatedWith).toBeUndefined();
    expect((els.find(e => e.id === 's3') as SupportElement).associatedWith).toBe('argB');
  });

  it('does NOT scrub associatedWith when removing a support', () => {
    useDiagramStore.setState({
      elements: [arg('argA'), sup('s1', 0, 0, 'argA'), sup('toRemove')],
    });
    useDiagramStore.getState().removeElement('toRemove');
    const els = useDiagramStore.getState().elements;
    expect((els.find(e => e.id === 's1') as SupportElement).associatedWith).toBe('argA');
  });
});
```

- [ ] **Step 3: Run tests, verify failures**

Run: `npm test`
Expected: failures in `diagramStore.test.ts` — `moveCluster` and `moveAndLink` are not yet defined; the `removeElement` scrub test fails because the existing implementation doesn't scrub.

- [ ] **Step 4: Commit**

```bash
git add src/store/diagramStore.test.ts
git commit -m "test(store): failing tests for moveCluster, moveAndLink, removeElement scrub"
```

---

## Task 5: Implement store actions

**Files:**
- Modify: `src/store/diagramStore.ts`

- [ ] **Step 1: Add the new action signatures to the store interface**

In `src/store/diagramStore.ts`, find the existing actions interface block (around line 77-100, where `moveElement`, `resizeElement`, etc. are declared as method signatures). Add these two signatures next to them (preserve the existing style — type the params explicitly):

```ts
  moveCluster: (startPositions: Map<string, Position>, delta: Position) => void;
  moveAndLink: (id: string, position: Position, associatedArgumentId: string | null) => void;
```

- [ ] **Step 2: Implement `moveCluster` and `moveAndLink`**

In the same file, find the existing implementations block (around line 187 where `moveElement` is implemented). Add these two implementations (keep the project's `set((state) => ({ ... }))` pattern):

```ts
      moveCluster: (startPositions, delta) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            const start = startPositions.get(el.id);
            if (!start) return el;
            return { ...el, position: { x: start.x + delta.x, y: start.y + delta.y } };
          }),
        })),

      moveAndLink: (id, position, associatedArgumentId) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            if (el.type !== 'support') return el;  // no-op for non-supports
            const supEl = el as SupportElement;
            if (associatedArgumentId === null) {
              const { associatedWith: _omit, ...rest } = supEl;
              void _omit;
              return { ...rest, position };
            }
            return { ...supEl, position, associatedWith: associatedArgumentId };
          }),
        })),
```

- [ ] **Step 3: Modify `removeElement` to scrub dangling refs**

Replace the existing `removeElement` implementation (around line 178-185) with:

```ts
      removeElement: (id) =>
        set((state) => {
          const removed = state.elements.find((el) => el.id === id);
          const isArg = removed?.type === 'argument';
          return {
            elements: state.elements
              .filter((el) => el.id !== id)
              .map((el) => {
                if (!isArg) return el;
                if (el.type !== 'support') return el;
                const supEl = el as SupportElement;
                if (supEl.associatedWith !== id) return el;
                const { associatedWith: _omit, ...rest } = supEl;
                void _omit;
                return rest as SupportElement;
              }),
            connections: state.connections.filter(
              (conn) => conn.from !== id && conn.to !== id
            ),
            selectedIds: state.selectedIds.filter((sid) => sid !== id),
          };
        }),
```

If `SupportElement` is not already imported at the top of the file, add it to the existing type imports.

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test`
Expected: all tests in `diagramStore.test.ts` pass plus all previously-passing tests (clusters, cloudPath) still green.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/store/diagramStore.ts
git commit -m "feat(store): moveCluster + moveAndLink actions; removeElement scrubs associatedWith"
```

---

## Task 6: ClusterHalo component

Pure visual component — no Canvas integration yet. Renders a rounded blue rectangle behind a cluster's union bbox.

**Files:**
- Create: `src/components/Canvas/shapes/ClusterHalo.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/Canvas/shapes/ClusterHalo.tsx` with this exact content:

```tsx
import { Rect } from 'react-konva';
import type { Cluster } from '../../../utils/clusters';
import { unionBbox } from '../../../utils/clusters';

interface ClusterHaloProps {
  cluster: Cluster;
  mode: 'drag' | 'select';
}

const PAD = 8;
const CORNER_RADIUS = 12;
const STROKE = '#4A90D9';

export function ClusterHalo({ cluster, mode }: ClusterHaloProps) {
  const bbox = unionBbox([cluster.argument, ...cluster.supports]);
  const isDrag = mode === 'drag';
  return (
    <Rect
      x={bbox.x - PAD}
      y={bbox.y - PAD}
      width={bbox.width + 2 * PAD}
      height={bbox.height + 2 * PAD}
      cornerRadius={CORNER_RADIUS}
      fill={isDrag ? 'rgba(74, 144, 217, 0.10)' : 'rgba(74, 144, 217, 0.06)'}
      stroke={STROKE}
      strokeWidth={isDrag ? 2 : 1.5}
      dash={isDrag ? undefined : [6, 4]}
      listening={false}
    />
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds. (No tests for this component — it's pure presentation; verified visually in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Canvas/shapes/ClusterHalo.tsx
git commit -m "feat(canvas): ClusterHalo component"
```

---

## Task 7: Add `onDragMove` prop to shape components

Sticky-group drag needs to update sibling Konva nodes during the drag — that means the dragged shape needs to call back into the Canvas during `dragmove`, not only `dragend`.

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`
- Modify: `src/components/Canvas/shapes/SupportShape.tsx`

- [ ] **Step 1: Add `onDragMove` to ArgumentShape props**

In `src/components/Canvas/shapes/ArgumentShape.tsx`, find the `ArgumentShapeProps` interface (around line 9) and the destructuring block (around line 26).

Add `onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;` to the interface:

```ts
interface ArgumentShapeProps {
  // ... existing fields ...
  onDragStart?: () => void;
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  // ... rest ...
}
```

Add `onDragMove` to the destructured props in the function signature:

```ts
export function ArgumentShape({
  // ... existing destructured props ...
  onDragStart,
  onDragMove,
  onDragEnd,
  // ... rest ...
}: ArgumentShapeProps) {
```

Find every `<Group>` (or `<Ellipse>` / other Konva node) that already passes `onDragStart` / `onDragEnd` (around lines 65-66 and 146-147). Add `onDragMove={onDragMove}` next to each of those.

- [ ] **Step 2: Same change in SupportShape**

In `src/components/Canvas/shapes/SupportShape.tsx`, repeat the same change: add `onDragMove?: (e: Konva.KonvaEventObject<DragEvent>) => void;` to `SupportShapeProps`, destructure it, and pass it to the underlying `<Group>` (around line 121-122).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds. (Optional prop, no call sites broken.)

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx src/components/Canvas/shapes/SupportShape.tsx
git commit -m "feat(canvas): add onDragMove prop to ArgumentShape and SupportShape"
```

---

## Task 8: Render selection-mode halos in Canvas

Wire `<ClusterHalo>` into the canvas. Halos render behind connections and elements, driven by selection state.

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Add imports**

In `src/components/Canvas/Canvas.tsx`, add to the existing imports near the top:

```ts
import { ClusterHalo } from './shapes/ClusterHalo';
import { computeCluster } from '../../utils/clusters';
import type { Cluster } from '../../utils/clusters';
```

- [ ] **Step 2: Compute the halo set on every render**

Inside the `Canvas` function body, after the existing hooks but before the return JSX, add this block:

```ts
  // Cluster halos. Map keyed by argument id so each argument's halo renders at
  // most once. Drag mode wins on tie with select mode.
  const halosToRender = (() => {
    const map = new Map<string, { cluster: Cluster; mode: 'drag' | 'select' }>();

    // Selection halos: for each selected element, identify anchor argument(s).
    for (const selId of selectedIds) {
      const sel = elements.find((e) => e.id === selId);
      if (!sel) continue;
      if (isArgumentElement(sel)) {
        const c = computeCluster(elements, sel.id);
        if (c) map.set(sel.id, { cluster: c, mode: 'select' });
      } else if (isSupportElement(sel)) {
        // (i) sticky link target
        if (sel.associatedWith) {
          const c = computeCluster(elements, sel.associatedWith);
          if (c && !map.has(sel.associatedWith)) {
            map.set(sel.associatedWith, { cluster: c, mode: 'select' });
          }
        }
        // (ii) every argument whose cluster currently overlaps this support
        for (const el of elements) {
          if (!isArgumentElement(el)) continue;
          if (map.has(el.id)) continue;
          const c = computeCluster(elements, el.id);
          if (!c) continue;
          if (c.supports.some((s) => s.id === sel.id)) {
            map.set(el.id, { cluster: c, mode: 'select' });
          }
        }
      }
    }

    return map;
  })();
```

- [ ] **Step 3: Render halos as the first child of the main Layer**

Find the existing `<Layer>` containing element shapes (around `Canvas.tsx:622` after the connections render). Insert the halo render at the **start** of that layer (before connections, before elements):

```tsx
          <Layer>
            {/* Cluster halos render first → drawn behind everything else */}
            {Array.from(halosToRender.entries()).map(([argId, { cluster, mode }]) => (
              <ClusterHalo key={`halo-${argId}-${mode}`} cluster={cluster} mode={mode} />
            ))}
            {/* ... existing connection and element renders unchanged ... */}
          </Layer>
```

If connections and elements are in the *same* `<Layer>` already, halos must come first inside that layer. If they're in separate layers, halos go in their own layer mounted before the connections layer. Either way: halos must be drawn before connections and elements in mount order.

- [ ] **Step 4: Build and run dev server**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev` and open the app. Drop a Claim and a Question, drag the Question onto the Claim (don't release yet — Task 9/10 wires drag halos), then release. Click the Claim. Expected: dashed blue halo appears around just the Claim (no support is in its cluster yet because `associatedWith` auto-suggest isn't wired until Task 10).

For now: drop a Claim, then drop a Question that overlaps it. Click the Claim. Expected: halo around both (the Question is in the Claim's cluster because they overlap, regardless of `associatedWith`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): render selection-mode cluster halos behind elements"
```

---

## Task 9: Sticky-group argument drag

Cache the cluster on `dragstart`, move support Konva nodes imperatively on each `dragmove`, commit via `moveCluster` on `dragend`. Suppressed during multi-select.

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Add a ref for the drag cache**

Inside the `Canvas` function body, near the other refs (around line 36-39), add:

```ts
  const stickyDragRef = useRef<{
    cluster: Cluster;
    startPositions: Map<string, { x: number; y: number }>;
    supportNodes: Map<string, Konva.Node>;
  } | null>(null);
```

You may need to import the Konva type at the top: `import type Konva from 'konva';` (already present).

Make sure `moveCluster` is destructured from `useDiagramStore`:

```ts
  const { ..., moveCluster, ... } = useDiagramStore();
```

(Add it to the existing destructure list around lines 96-110.)

- [ ] **Step 2: Add three handlers for argument drag**

Add these three callbacks inside the `Canvas` function, alongside the existing `handleElementDragEnd` (around line 352):

```ts
  const handleArgumentDragStart = useCallback(
    (id: string) => {
      // Suppress sticky-group when this argument is part of a multi-selection.
      if (selectedIds.length > 1 && selectedIds.includes(id)) {
        stickyDragRef.current = null;
        return;
      }
      const cluster = computeCluster(elements, id);
      if (!cluster) {
        stickyDragRef.current = null;
        return;
      }
      const startPositions = new Map<string, { x: number; y: number }>();
      startPositions.set(cluster.argument.id, { ...cluster.argument.position });
      for (const s of cluster.supports) {
        startPositions.set(s.id, { ...s.position });
      }
      const supportNodes = new Map<string, Konva.Node>();
      for (const s of cluster.supports) {
        const node = shapeRefs.current.get(s.id);
        if (node) supportNodes.set(s.id, node);
      }
      stickyDragRef.current = { cluster, startPositions, supportNodes };
    },
    [elements, selectedIds]
  );

  const handleArgumentDragMove = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const cache = stickyDragRef.current;
      if (!cache) return;
      const argStart = cache.startPositions.get(id);
      if (!argStart) return;
      const delta = { x: e.target.x() - argStart.x, y: e.target.y() - argStart.y };
      for (const [supId, node] of cache.supportNodes) {
        const start = cache.startPositions.get(supId);
        if (!start) continue;
        node.position({ x: start.x + delta.x, y: start.y + delta.y });
      }
      e.target.getLayer()?.batchDraw();
    },
    []
  );

  const handleArgumentDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const cache = stickyDragRef.current;
      const finalArg = { x: e.target.x(), y: e.target.y() };
      if (!cache) {
        // Fallback to single-element move (multi-select case or no cluster).
        moveElement(id, finalArg);
        return;
      }
      const argStart = cache.startPositions.get(id)!;
      const delta = { x: finalArg.x - argStart.x, y: finalArg.y - argStart.y };
      moveCluster(cache.startPositions, delta);
      stickyDragRef.current = null;
    },
    [moveElement, moveCluster]
  );
```

- [ ] **Step 3: Wire the new handlers into argument shape mount points**

Find the existing render loop that mounts `<ArgumentShape>` (around lines 644-650). It currently passes `onDragEnd={(e) => handleElementDragEnd(element.id, e)}`. Replace that for arguments only:

```tsx
                  onDragStart={() => handleArgumentDragStart(element.id)}
                  onDragMove={(e) => handleArgumentDragMove(element.id, e)}
                  onDragEnd={(e) => handleArgumentDragEnd(element.id, e)}
```

Keep `handleElementDragEnd` for non-argument shapes (Support, TeacherSupport, InfoBox) — they still use the simple per-element move.

- [ ] **Step 4: Build and verify in browser**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`. Drop a Claim, drop a Question overlapping it, then drag the Claim. Expected: the Question moves with the Claim, keeping its relative offset. `Cmd+Z` reverts the entire move in one step.

Marquee-select both elements, then drag the Claim. Expected: Konva's built-in multi-select drag fires for both — sticky-group doesn't double-move the Question.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): sticky-group drag for arguments (suppressed during multi-select)"
```

---

## Task 10: Support drag — auto-suggest + drag-mode/sticky-link halos

Single BFS auto-suggest at `dragend`, plus drag-tracked halo state for live feedback.

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Add drag-state for the dragged support**

Inside the `Canvas` function body, near the other `useState` calls, add:

```ts
  const [draggingSupportId, setDraggingSupportId] = useState<string | null>(null);
  // Live position of the dragged support during drag (Konva node position,
  // not yet committed to the store). Drives drag-halo recompute on each frame.
  const [draggingSupportPos, setDraggingSupportPos] = useState<{ x: number; y: number } | null>(null);
```

Make sure `moveAndLink` is destructured from the store. Check the existing destructure list and add it if missing.

- [ ] **Step 2: Add support drag handlers**

Add these three callbacks inside the `Canvas` function:

```ts
  const handleSupportDragStart = useCallback((id: string) => {
    const sup = elements.find((e) => e.id === id);
    if (!sup) return;
    setDraggingSupportId(id);
    setDraggingSupportPos({ ...sup.position });
  }, [elements]);

  const handleSupportDragMove = useCallback((_id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    setDraggingSupportPos({ x: e.target.x(), y: e.target.y() });
  }, []);

  const handleSupportDragEnd = useCallback((id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const finalPos = { x: e.target.x(), y: e.target.y() };
    setDraggingSupportId(null);
    setDraggingSupportPos(null);

    const support = elements.find((el) => el.id === id);
    if (!support || support.type !== 'support') {
      moveElement(id, finalPos);
      return;
    }

    // Sticky link: do not auto-suggest if already linked.
    if ((support as SupportElement).associatedWith) {
      moveElement(id, finalPos);
      return;
    }

    // Single BFS from the dropped support's would-be position. Walls at arguments.
    // Build a hypothetical element list with the support at its final position.
    const hypothetical: DiagramElement[] = elements.map((el) =>
      el.id === id ? { ...el, position: finalPos } : el
    );
    const startSupport = hypothetical.find((e) => e.id === id)!;
    const visited = new Set<string>([id]);
    const queue: DiagramElement[] = [startSupport];
    const overlappedArgIds = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const candidate of hypothetical) {
        if (visited.has(candidate.id)) continue;
        if (!bboxesOverlap(current, candidate)) continue;
        visited.add(candidate.id);
        if (isArgumentElement(candidate)) {
          overlappedArgIds.add(candidate.id);
          // wall: do not queue
        } else if (isSupportElement(candidate)) {
          queue.push(candidate);
        }
      }
    }

    if (overlappedArgIds.size === 1) {
      const argId = overlappedArgIds.values().next().value as string;
      moveAndLink(id, finalPos, argId);
    } else {
      moveElement(id, finalPos);
    }
  }, [elements, moveElement, moveAndLink]);
```

Add `bboxesOverlap` to the existing import from `'../../utils/clusters'`:

```ts
import { computeCluster, bboxesOverlap } from '../../utils/clusters';
```

- [ ] **Step 3: Extend the halo computation block to include drag halos**

Find the `halosToRender` block from Task 8 and extend it with two more passes after the selection pass. Replace the IIFE with:

```ts
  const halosToRender = (() => {
    const map = new Map<string, { cluster: Cluster; mode: 'drag' | 'select' }>();

    // 1. Selection halos.
    for (const selId of selectedIds) {
      const sel = elements.find((e) => e.id === selId);
      if (!sel) continue;
      if (isArgumentElement(sel)) {
        const c = computeCluster(elements, sel.id);
        if (c) map.set(sel.id, { cluster: c, mode: 'select' });
      } else if (isSupportElement(sel)) {
        if (sel.associatedWith) {
          const c = computeCluster(elements, sel.associatedWith);
          if (c && !map.has(sel.associatedWith)) {
            map.set(sel.associatedWith, { cluster: c, mode: 'select' });
          }
        }
        for (const el of elements) {
          if (!isArgumentElement(el)) continue;
          if (map.has(el.id)) continue;
          const c = computeCluster(elements, el.id);
          if (!c) continue;
          if (c.supports.some((s) => s.id === sel.id)) {
            map.set(el.id, { cluster: c, mode: 'select' });
          }
        }
      }
    }

    // 2. Sticky-link halo: linked support being dragged.
    if (draggingSupportId) {
      const dragSup = elements.find((e) => e.id === draggingSupportId);
      if (dragSup && isSupportElement(dragSup) && dragSup.associatedWith) {
        const c = computeCluster(elements, dragSup.associatedWith);
        if (c && !map.has(dragSup.associatedWith)) {
          map.set(dragSup.associatedWith, { cluster: c, mode: 'select' });
        }
      }
    }

    // 3. Drag halos: unlinked support being dragged → preview every argument
    //    whose cluster the support's current position would join (single BFS).
    if (draggingSupportId && draggingSupportPos) {
      const dragSup = elements.find((e) => e.id === draggingSupportId);
      if (dragSup && isSupportElement(dragSup) && !dragSup.associatedWith) {
        const finalPos = draggingSupportPos;
        const hypothetical = elements.map((el) =>
          el.id === draggingSupportId ? { ...el, position: finalPos } : el
        );
        const start = hypothetical.find((e) => e.id === draggingSupportId)!;
        const visited = new Set<string>([draggingSupportId]);
        const queue: DiagramElement[] = [start];
        const dragArgIds = new Set<string>();
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const candidate of hypothetical) {
            if (visited.has(candidate.id)) continue;
            if (!bboxesOverlap(current, candidate)) continue;
            visited.add(candidate.id);
            if (isArgumentElement(candidate)) {
              dragArgIds.add(candidate.id);
            } else if (isSupportElement(candidate)) {
              queue.push(candidate);
            }
          }
        }
        for (const argId of dragArgIds) {
          // Drag mode wins over select mode on tie.
          const c = computeCluster(elements, argId);
          if (c) map.set(argId, { cluster: c, mode: 'drag' });
        }
      }
    }

    return map;
  })();
```

- [ ] **Step 4: Wire support drag handlers into SupportShape mount points**

Find the existing render loop that mounts `<SupportShape>` (around line 660-665). Replace its drag prop with:

```tsx
                  onDragStart={() => handleSupportDragStart(element.id)}
                  onDragMove={(e) => handleSupportDragMove(element.id, e)}
                  onDragEnd={(e) => handleSupportDragEnd(element.id, e)}
```

Leave TeacherSupport and InfoBox shapes on the simple `handleElementDragEnd` flow.

- [ ] **Step 5: Build and verify in browser**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`. Test scenarios:

1. Drop a Claim, drop a Question. Drag the Question onto the Claim — drag halo (solid blue) appears on the Claim during drag. Release. Question's `associatedWith` is now set (verify by re-clicking the Claim — halo includes the Question).
2. Drop a third element (another Question) directly onto the existing Claim — same drag-halo, release auto-fills.
3. Drag the just-linked Question to a different (empty) area — sticky-link halo (dashed blue) on the original Claim follows it during drag. Release: position changes, link unchanged.
4. `Cmd+Z` after a drop-with-auto-suggest reverts position AND clears the link in one step.

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): support drag with auto-suggest BFS + drag/sticky-link halos"
```

---

## Task 11: Properties panel "Associated with" dropdown

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`

- [ ] **Step 1: Read the existing structure**

Read `src/components/Properties/PropertiesPanel.tsx` to understand the Tailwind class conventions, label/input pattern, and how existing fields like `supportType` are rendered for a selected support.

- [ ] **Step 2: Add the dropdown**

Inside the support-element render branch (the block guarded by `isSupportElement(selectedElement)`, around line 233), add a new field block. Suggested location: directly below the existing support-type / subtype controls.

```tsx
              {/* Associated with — link to an argument element */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Associated with
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={(selectedElement as SupportElement).associatedWith ?? ''}
                  onChange={(e) => {
                    const next = e.target.value;
                    updateElement(selectedElement.id, {
                      associatedWith: next === '' ? undefined : next,
                    });
                  }}
                >
                  <option value="">(none)</option>
                  {[...elements]
                    .filter(isArgumentElement)
                    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
                    .map((arg) => {
                      const preview = arg.content.length > 40
                        ? arg.content.slice(0, 40) + '…'
                        : arg.content;
                      const labelText = preview ? `${arg.label}: "${preview}"` : arg.label;
                      return (
                        <option key={arg.id} value={arg.id}>
                          {labelText}
                        </option>
                      );
                    })}
                </select>
              </div>
```

If the file doesn't already destructure `elements` from the store and `updateElement` (or whatever the existing field-update action is called), add those. Use the same field-mutation action that the existing support controls already use — do NOT introduce a new action.

If the existing action is `setElement` (not `updateElement`), use `setElement(selectedElement.id, { associatedWith: ... })`. Match the existing pattern in the file.

- [ ] **Step 3: Build and verify in browser**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`. Select a Question that's linked to a Claim. Expected: the dropdown shows the Claim's label + content preview.

Pick a different argument from the dropdown → halo flips to the new argument when re-selected. Pick `(none)` → halo disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(properties): Associated with dropdown for SupportElement"
```

---

## Task 12: Manual browser verification + deploy

Visual sign-off against the spec's "Manual verification" section. Programmatic work is done; this task is final QA + deploy.

**Files:** none modified (unless a regression is found, in which case the fix gets its own commit and loops back to the relevant task).

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Vite serves at `http://localhost:5173/tools/etd/`. Open in browser.

- [ ] **Step 2: Walk the spec's Manual Verification list (steps 1-14)**

Open `docs/superpowers/specs/2026-05-06-support-argument-linking-design.md`, find the "Manual verification (browser)" section. Walk each numbered step in order:

1. Drop Claim + Question, drag Question onto Claim, release. Properties shows Claim.
2. Drop second Question onto first Question. Auto-fills via transitive overlap.
3. Click Claim → halo around Claim + both Questions.
4. Click off, click one Question → same halo.
5. Drag Claim → both Questions move with it. Single Cmd+Z reverts.
6. Drag one Question out of overlap → moves alone, link stays.
7. Drop third Question overlapping two Claims → Properties shows `(none)` (ambiguous), both halos visible while selected.
8. Pick second Claim from dropdown → save → reopen → link survives.
9. Drag second Claim → third Question moves with it.
10. Drag a linked Question → original argument's halo (dashed blue) follows the support during drag.
11. Drop fresh Question on a Claim → Cmd+Z reverts both move and link atomically.
12. Marquee-select a Claim and one Question → drag the Claim → only those two move (multi-select wins).
13. Delete the Claim → linked Questions show `(none)`. Cmd+Z restores both.
14. Select the bridge Question → both Claims' halos render simultaneously.

If anything fails: stop, investigate, fix in the relevant earlier task, re-run that task's tests, then return to this step. Don't paper over with one-off patches.

- [ ] **Step 3: Run the test suite once more**

Run: `npm test`
Expected: all tests green (clusters, store, plus pre-existing cloudPath).

- [ ] **Step 4: Final build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Deploy to jenkleiman.com**

Per the project's CLAUDE.md deployment workflow. **This step requires user approval — confirm with the user before pushing.**

```bash
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: support→argument linking with cluster halos"
git push
```

Also push the etd repo if it's ahead of origin:

```bash
cd /Users/jenniferkleiman/Documents/GitHub/etd
git push origin main
```

---

## Notes for the implementer

- **Key invariant for cluster computation:** `computeCluster` is a pure function of `(elements, argumentId)`. It's recomputed on every render that touches the halo block. For Anna's diagrams (tens of elements) this is trivial; if profiling ever shows it's hot, memoize per `(elements identity, argumentId)`.

- **Why imperative Konva moves during sticky-group drag:** writing to the store every `dragmove` would either flood zundo with N×frames undo entries, or require throttling. Imperative moves on the Konva nodes during the drag + a single `moveCluster` commit at `dragend` produces exactly one undo entry. Standard Konva idiom for grouped drag.

- **Why the single-BFS for auto-suggest:** earlier formulations called `computeCluster` per argument — O(args × elements²). Single BFS from the dropped support naturally walks every reachable argument anchor (with arguments as walls) in one pass.

- **Why halos render in `Canvas.tsx` rather than per-shape:** halos belong to clusters, not individual elements. Rendering them centrally avoids each shape having to know about the cluster it's in, and keeps the render-order rule ("halos go first") in one place.

- **`onDragMove` is optional in shape props.** TeacherSupport and InfoBox shapes don't need it. Only ArgumentShape and SupportShape are wired up.

- **Multi-select drag suppression check** is `selectedIds.length > 1 && selectedIds.includes(argument.id)`. Both conditions matter — a single-element "selection" of just the dragged argument shouldn't suppress sticky-group.

- **JSON load tolerance for unknown fields:** existing loaders already accept arbitrary optional fields on elements (verified by `attribution`, `image`, `imageSettings` all being optional). The new `associatedWith` field flows through with no special handling. If a loaded `associatedWith` references a non-existent argument id (e.g., from a partially-edited file), the Properties dropdown will show `(none)` because the option list won't contain that id — graceful degradation.
