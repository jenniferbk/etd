# Simplify Connectors & Remove Swimlanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orthogonal auto-routing arrow logic with straight, edge-to-edge lines clipped to each shape's silhouette, and remove the swimlane snap and lane-line drag overlay. Waypoint-on-arrow attachment for warrants is preserved unchanged.

**Architecture:** Two independent code changes in two files: rewrite the path-computation helpers in `src/components/Canvas/shapes/Arrow.tsx` to produce straight 2-point paths via line-rectangle and line-ellipse intersection; delete the lane configuration, snap helper, drag-end snap call, and lane-line rendering in `src/components/Canvas/Canvas.tsx`. The `Connection` / `ConnectionTarget` data model and the `ConnectionArrow` component itself are untouched.

**Tech Stack:** React 19, TypeScript, react-konva, Vite. No test framework — verification is `npm run lint`, `npm run build` (which runs `tsc -b`), and manual browser testing per `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-04-26-simplify-connectors-and-remove-swimlanes-design.md`

---

## Task 1: Replace orthogonal arrow routing with straight edge-to-edge lines

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (replace helpers in approximately lines 1-252; component body lines 254-418 unchanged)

- [ ] **Step 1: Open `src/components/Canvas/shapes/Arrow.tsx` and replace the import block plus the entire helper section (everything from line 1 through line 252, inclusive — i.e. up to but not including `export function ConnectionArrow`) with the block below.**

The rest of the file (`ConnectionArrow` from line 254 onward) stays exactly as-is — it consumes `pathPoints` from `getConnectionPathPoints` and is shape-of-path agnostic, so the closest-point-on-polyline math in `handleArrowClick` keeps working unchanged on a 2-point polyline.

```typescript
import { Circle, Line } from 'react-konva';
import type Konva from 'konva';
import type { Connection, DiagramElement } from '../../../types';
import {
  isArgumentElement,
  isSupportElement,
  isTeacherSupportElement,
  isArrowAttachment,
} from '../../../types';

interface ArrowProps {
  connection: Connection;
  elements: DiagramElement[];
  connections: Connection[];
  isSelected: boolean;
  isHovered: boolean;
  connectModeActive: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onArrowClick?: (connectionId: string, position: number, point: { x: number; y: number }) => void;
  onHover?: (connectionId: string | null) => void;
}

// Get center point of an element
function getElementCenter(el: DiagramElement): { x: number; y: number } {
  return {
    x: el.position.x + el.size.width / 2,
    y: el.position.y + el.size.height / 2,
  };
}

// Calculate point along a polyline at position t (0-1).
// Works on any polyline including a single 2-point segment.
function getPointOnPolyline(
  points: number[],
  t: number
): { x: number; y: number } {
  if (points.length < 4) {
    return { x: points[0] || 0, y: points[1] || 0 };
  }

  let totalLength = 0;
  const segments: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    length: number;
  }[] = [];

  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    segments.push({ start, end, length });
    totalLength += length;
  }

  const targetLength = t * totalLength;
  let accLength = 0;

  for (const seg of segments) {
    if (accLength + seg.length >= targetLength) {
      const segT = (targetLength - accLength) / seg.length;
      return {
        x: seg.start.x + (seg.end.x - seg.start.x) * segT,
        y: seg.start.y + (seg.end.y - seg.start.y) * segT,
      };
    }
    accLength += seg.length;
  }

  return { x: points[points.length - 2], y: points[points.length - 1] };
}

// Decide which silhouette to clip a connector against for a given element.
// 'ellipse' = action support shapes and the cloud "implicit" argument shape
// (clipped to its bounding-box ellipse — the bezier bumps reach roughly to
// that envelope, so the line ends at the cloud's outer edge).
// 'rect' = everything else: axis-aligned bounding box.
type ShapeKind = 'rect' | 'ellipse';
function getShapeKind(el: DiagramElement): ShapeKind {
  if (isArgumentElement(el) && el.contributor === 'implicit') return 'ellipse';
  if (isSupportElement(el) && el.supportType === 'action') return 'ellipse';
  if (isTeacherSupportElement(el) && el.supportType === 'action') return 'ellipse';
  return 'rect';
}

// Find the point where a line from `center` toward `target` exits an
// axis-aligned rectangle of half-width hw and half-height hh centered on `center`.
function lineRectEdgePoint(
  center: { x: number; y: number },
  hw: number,
  hh: number,
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y };
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: center.x + t * dx, y: center.y + t * dy };
}

// Find the point where a line from `center` toward `target` exits an ellipse
// centered on `center` with semi-axes (rx, ry). Closed-form solution.
function lineEllipseEdgePoint(
  center: { x: number; y: number },
  rx: number,
  ry: number,
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: center.x, y: center.y };
  const ux = dx / len;
  const uy = dy / len;
  const s = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
  return { x: center.x + s * ux, y: center.y + s * uy };
}

// Boundary point of an element along the line from its center toward `target`.
// Picks rectangle or ellipse silhouette based on element type.
function getEdgePoint(
  el: DiagramElement,
  target: { x: number; y: number }
): { x: number; y: number } {
  const center = getElementCenter(el);
  const hw = el.size.width / 2;
  const hh = el.size.height / 2;
  if (getShapeKind(el) === 'ellipse') {
    return lineEllipseEdgePoint(center, hw, hh, target);
  }
  return lineRectEdgePoint(center, hw, hh, target);
}

// Build a straight 2-point path between two elements. Both endpoints lie on
// each element's silhouette along the source-center → target-center line.
function getStraightPath(
  fromEl: DiagramElement,
  toEl: DiagramElement
): { points: number[] } {
  const fromCenter = getElementCenter(fromEl);
  const toCenter = getElementCenter(toEl);
  const fromEdge = getEdgePoint(fromEl, toCenter);
  const toEdge = getEdgePoint(toEl, fromCenter);
  return { points: [fromEdge.x, fromEdge.y, toEdge.x, toEdge.y] };
}

// Build a straight 2-point path from an element to a point on another
// connection. Source side is clipped to the element's silhouette; the
// attachment side terminates exactly at the attachment point.
function getStraightPathToArrow(
  fromEl: DiagramElement,
  attachPoint: { x: number; y: number }
): { points: number[] } {
  const fromEdge = getEdgePoint(fromEl, attachPoint);
  return { points: [fromEdge.x, fromEdge.y, attachPoint.x, attachPoint.y] };
}

// Resolve a connection to its rendered polyline points. Recursively resolves
// arrow-attachment connections by computing the parent's path first.
function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[]
): { points: number[] } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const attachPoint = getPointOnPolyline(targetResult.points, connection.to.position);
    return getStraightPathToArrow(fromEl, attachPoint);
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;
  return getStraightPath(fromEl, toEl);
}
```

Notes for the engineer doing the replacement:

- The old code defined `EdgeSide`, `isYWithinElement`, `isXWithinElement`, `getBestEdgePoint`, `getOrthogonalPath`, and `getOrthogonalPathToArrow`. None of those are needed any more — they are deleted as part of this replacement (i.e. they do not appear in the block above).
- `getElementCenter`, `getPointOnPolyline`, and `getConnectionPathPoints` are kept (with `getConnectionPathPoints` updated to call the new `getStraightPath` / `getStraightPathToArrow` instead of the orthogonal versions).
- The import line gains three new type-guard imports (`isArgumentElement`, `isSupportElement`, `isTeacherSupportElement`) alongside the existing `isArrowAttachment`. All four are re-exported through `src/types/index.ts`.
- Do not touch `ConnectionArrow` itself (the `export function` block from line 254 to end of file). It already works correctly with any polyline shape.

- [ ] **Step 2: Run lint and verify no errors**

```bash
npm run lint
```

Expected: clean exit, no ESLint errors. If unused-variable warnings appear for symbols you removed, they are bugs in the deletion — re-check that you removed everything listed in the notes above (`EdgeSide`, `isYWithinElement`, `isXWithinElement`, `getBestEdgePoint`, `getOrthogonalPath`, `getOrthogonalPathToArrow`).

- [ ] **Step 3: Run TypeScript build to verify types**

```bash
npm run build
```

Expected: clean `tsc -b` pass followed by a successful Vite production build. If type errors appear, the most likely cause is a missing import — confirm `isArgumentElement`, `isSupportElement`, `isTeacherSupportElement`, `isArrowAttachment` are all imported from `../../../types`.

- [ ] **Step 4: Browser verification — straight lines and shape clipping**

Start the dev server and verify visually with Claude for Chrome:

```bash
npm run dev
```

In the browser at the dev URL:

1. Create a Data element (rectangle, given/student/teacher contributor) and a Claim element. Connect them with an arrow. Confirm: a single straight diagonal line connects them, terminating cleanly at each box edge with an arrowhead at the Claim. No Z-shape, no L-shape, no horizontal "lane-aligned" routing.
2. Drag Data and Claim into all four directional configurations relative to each other (NE, NW, SE, SW). Confirm the straight line follows in real time and always terminates on each rectangle's edge.
3. Create an Implicit (cloud) argument element and connect a Data to it. Confirm the line terminates on the cloud's outer envelope (visually at the bumps' approximate outer edge, not at the bounding-box corner and not deep inside the cloud).
4. Create a teacher Support element of type "action" (ellipse). Connect it to a Claim. Confirm the line terminates on the ellipse boundary, not at the bounding-box corners.
5. Create a Warrant element. Use connect mode to attach it to the Data → Claim arrow at roughly the midpoint. Confirm: a straight line from the Warrant's edge to a point on the Data → Claim line, terminating with a small black dot (no arrowhead).
6. Drag Data and Claim around. The Warrant's attachment point should slide along the Data → Claim line at the same fractional `position`, and the Warrant's incoming line should re-clip to its source edge correctly.
7. Add a second Warrant to the same Data → Claim arrow at a different position (e.g. ~0.2 vs ~0.8). Confirm both warrants attach at distinct points on the same arrow.

Report any case that looks broken before proceeding to commit.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "$(cat <<'EOF'
Replace orthogonal arrow routing with straight edge-to-edge lines

Connectors are now single straight segments clipped to each element's
silhouette: line-rectangle intersection for rectangular shapes,
closed-form line-ellipse intersection for action support shapes and the
underlying ellipse of cloud "implicit" argument shapes. Removes the
auto Z/L-shape routing and lane-aligned exit logic that produced
unpredictable arrow paths.

Waypoint-on-arrow attachment is preserved: ConnectionTarget.position
along a 2-point polyline is just linear interpolation, and
handleArrowClick's closest-point projection works identically on a
single segment.
EOF
)"
```

---

## Task 2: Remove swimlane snap and lane-line drag overlay

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx`

- [ ] **Step 1: Delete the `LANE_CONFIG` constant and the `getLanePositions` and `snapToLane` helpers (currently lines 21-52, the block beginning with `// Lane configuration` through the closing brace of `snapToLane`).**

Locate this block at the top of the file:

```typescript
// Lane configuration
const LANE_CONFIG = {
  startY: 50,           // First lane Y position
  spacing: 150,         // Distance between lanes
  count: 6,             // Number of lanes
  snapThreshold: 40,    // Snap to lane if within this distance
  width: 3000,          // Lane guide line width
};

// Calculate lane Y positions
const getLanePositions = () => {
  const lanes: number[] = [];
  for (let i = 0; i < LANE_CONFIG.count; i++) {
    lanes.push(LANE_CONFIG.startY + i * LANE_CONFIG.spacing);
  }
  return lanes;
};

// Snap to nearest lane if within threshold
const snapToLane = (y: number, elementHeight: number): number => {
  const lanes = getLanePositions();
  const elementCenterY = y + elementHeight / 2;

  for (const laneY of lanes) {
    if (Math.abs(elementCenterY - laneY) < LANE_CONFIG.snapThreshold) {
      // Snap element center to lane
      return laneY - elementHeight / 2;
    }
  }

  return y; // No snap, return original
};
```

Delete it entirely. Leave the surrounding `import` statements and the `interface ContextMenuState` declaration that follows it intact.

- [ ] **Step 2: Update `handleElementDragEnd` to remove the snap call.**

Find the current implementation (around lines 390-408):

```typescript
  // Handle element drag end with snap-to-lane
  const handleElementDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      setIsDragging(false);

      const element = elements.find((el) => el.id === id);
      const x = e.target.x();
      let y = e.target.y();

      // Snap to lane if close enough
      if (element) {
        y = snapToLane(y, element.size.height);
        e.target.y(y); // Update visual position immediately
      }

      moveElement(id, { x, y });
    },
    [moveElement, elements]
  );
```

Replace with:

```typescript
  // Handle element drag end
  const handleElementDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      setIsDragging(false);
      const x = e.target.x();
      const y = e.target.y();
      moveElement(id, { x, y });
    },
    [moveElement]
  );
```

Notes:
- `let y` becomes `const y` (no longer reassigned).
- The `elements.find` lookup is no longer needed because the element height was only used for snapping.
- Remove `elements` from the `useCallback` dependency array.
- `setIsDragging(false)` stays — it controls drag state used elsewhere (e.g. for cursor or selection visuals); leave it alone.

- [ ] **Step 3: Delete the lane-line drag-overlay rendering.**

Find this block inside the `<Layer>` (currently lines 671-683):

```tsx
        <Layer>
          {/* Lane guides - shown when dragging elements */}
          {isDragging && getLanePositions().map((laneY, index) => (
            <Line
              key={`lane-${index}`}
              points={[-500, laneY, LANE_CONFIG.width, laneY]}
              stroke="#4A90D9"
              strokeWidth={1}
              dash={[10, 5]}
              opacity={0.4}
              listening={false}
            />
          ))}

          {/* Render connections first (behind elements) */}
```

Delete the comment line, the entire `{isDragging && getLanePositions().map(...)}` expression, and the blank line that follows. Leave the `<Layer>` opening tag and the `{/* Render connections first ... */}` comment in place. The result should look like:

```tsx
        <Layer>
          {/* Render connections first (behind elements) */}
```

- [ ] **Step 4: Remove the now-unused `Line` import from `react-konva`.**

The `Line` symbol from `react-konva` was only used by the lane-line block deleted in Step 3. Confirm by running:

```bash
grep -n "Line" src/components/Canvas/Canvas.tsx
```

Expected: only one match remains, on the import line (`import { Stage, Layer, Transformer, Line } from 'react-konva';`). If so, edit that line to drop `Line`:

```typescript
import { Stage, Layer, Transformer } from 'react-konva';
```

If there are unexpected additional matches, investigate before deleting the import.

- [ ] **Step 5: Confirm `isDragging` is still used elsewhere in the file.**

```bash
grep -n "isDragging\|setIsDragging" src/components/Canvas/Canvas.tsx
```

Expected: at least the `useState` declaration and the two setters in drag start/end. The `isDragging` state may also gate other UI affordances — leave it alone. Only the lane-line overlay used it; nothing here removes the state itself.

- [ ] **Step 6: Run lint and TypeScript build**

```bash
npm run lint && npm run build
```

Expected: clean lint + clean `tsc -b` + successful Vite production build. The most likely error is an unused-variable warning if either `setIsDragging` ends up with no consumer (it should still have consumers — verify) or if the `Line` import was used somewhere unrelated and missed.

- [ ] **Step 7: Browser verification — free dragging, no lane lines, no snap**

```bash
npm run dev
```

In the browser:

1. Drag an element. Confirm: no horizontal dashed blue lines appear during the drag. Drag is fully free, pixel-precise.
2. Slowly drag an element near a Y position that *would* have been a lane (Y ≈ 50, 200, 350, 500, 650, 800). Confirm there is no snap — the element follows the cursor exactly.
3. Load a previously-saved diagram (any `.json` from the user's collection, or one freshly saved before this change). Confirm: every element appears at its previously-saved position, unchanged. No migration prompt or position shift.
4. Save the diagram, reload the page, load it back. Confirm round-trip is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "$(cat <<'EOF'
Remove swimlane snap and lane-line drag overlay

Deletes LANE_CONFIG and the snap-to-lane behavior that forced elements
into six fixed horizontal rows on drag end, plus the dashed blue
lane-line guides shown during drag. Element drag is now fully free and
pixel-precise. Existing saved diagrams are unaffected because positions
were already stored as absolute coordinates.
EOF
)"
```

---

## Task 3: Final integration verification

**Files:**
- None modified in this task. This is a verification-only pass against the spec's testing approach.

- [ ] **Step 1: Run a clean lint and build pass on the integrated state**

```bash
npm run lint && npm run build
```

Expected: clean exit on both. Any failure here means a regression in Task 1 or Task 2 — investigate before proceeding.

- [ ] **Step 2: Full browser walkthrough against the spec's testing approach**

```bash
npm run dev
```

Walk through every bullet from the "Testing approach" section of `docs/superpowers/specs/2026-04-26-simplify-connectors-and-remove-swimlanes-design.md`, in order:

1. Element-to-element straight line in all four quadrants (NE/NW/SE/SW).
2. Element-to-element line whose path crosses a third unrelated element — confirm it visibly passes through (this is the accepted tradeoff, not a bug).
3. Line into and out of a cloud "implicit" argument element — visually clean termination on the cloud's outer envelope.
4. Line into and out of an action support element (ellipse) — termination on ellipse boundary, not bounding box.
5. Warrant attached to a Data → Claim connection at varying `position` values along the segment. Drag Data and Claim and confirm both the warrant attachment dot and the warrant's incoming arrow track sensibly.
6. Multiple warrants attached to the same Data → Claim connection at different `position` values — both stay distinct, no flicker, no swap.
7. Free drag — pixel-precise placement, no lane-line overlay during drag, no snap.
8. Load an existing saved JSON diagram — element positions preserved exactly; no migration prompt; no visible shift.

If any step fails, do NOT mark this task complete. Capture which step failed and what the symptom was, and return to the relevant task to fix it.

- [ ] **Step 3: Verify no leftover dead code**

```bash
grep -n "LANE_CONFIG\|getLanePositions\|snapToLane\|getOrthogonalPath\|getBestEdgePoint\|isYWithinElement\|isXWithinElement\|EdgeSide" src/
```

Expected: zero matches across `src/`. Any match indicates an incomplete deletion in Task 1 or Task 2 — go back and remove it.

- [ ] **Step 4: No-op commit if nothing changed; otherwise commit any cleanup**

If steps 1-3 all passed without any further code edits, no commit is needed for this task — simply note the verification passed.

If you found and fixed an issue during this task, commit it:

```bash
git add -A
git commit -m "$(cat <<'EOF'
Final cleanup after connector + swimlane simplification

Captures any leftover deletions or fixes found during the post-
integration verification pass.
EOF
)"
```

---

## Out of scope (queued as separate sub-projects)

These are explicitly NOT addressed by this plan and remain pending:

1. Transcript persistence completeness + per-line dismissed state (autosave fix, panel auto-open, `dismissed` flag, schema 1.1 → 1.2).
2. Configurable support types (deferred work).
3. UI bug review (researcher's list of disallowed actions that should be allowed).

Each will get its own brainstorm → spec → plan cycle.
