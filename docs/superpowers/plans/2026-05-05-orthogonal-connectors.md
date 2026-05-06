# Orthogonal Connectors with User-Editable Waypoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace straight-diagonal connector rendering with orthogonal (Manhattan) routing where the user owns the bend points via segment-drag, with snap-to-align so trunks emerge naturally when parallel segments line up.

**Architecture:** Pure geometry helpers in a new `src/utils/orthogonalRouting.ts` module (no Konva imports there). `Arrow.tsx` consumes those helpers, renders one Konva `Line` per segment for hit isolation, and runs all drag/snap state in transient React state inside the component — only the final waypoints commit to the Zustand store on `mouseup`. Schema gets one optional field (`Connection.waypoints?: Position[]`) and `SAVE_SCHEMA_VERSION` bumps 1.3 → 1.4.

**Tech Stack:** React 19, TypeScript, Vite, Konva.js (react-konva 19), Zustand 5 with `zundo` temporal middleware. **No unit-test framework is configured in this project** — verification is `npm run typecheck`, `npm run lint`, and manual browser testing on `npm run dev` per `CLAUDE.md`.

**Spec:** [`docs/superpowers/specs/2026-05-05-orthogonal-connectors-design.md`](../specs/2026-05-05-orthogonal-connectors-design.md). Read first; this plan is the literal execution.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/types/connections.ts` | modified | Adds `waypoints?: Position[]` to `Connection`. Re-exports `Position` for callers that import only from `connections.ts`. |
| `src/utils/schema.ts` | modified | Bumps `SAVE_SCHEMA_VERSION` 1.3 → 1.4. |
| `src/utils/orthogonalRouting.ts` | **new** | Pure geometry: `getEffectiveWaypoints`, `clipOrthogonalEndpoint`, `getOrthogonalPath`, `getStraightAttachmentPath`, `getSegments`, segment-orientation inference. Zero React/Konva imports. |
| `src/store/diagramStore.ts` | modified | Adds `updateConnectionWaypoints(id, waypoints)` action; participates in `zundo` undo history. |
| `src/components/Canvas/shapes/Arrow.tsx` | rewritten | Removes ellipse-silhouette math (`lineRectEdgePoint`, `lineEllipseEdgePoint`, `getEdgePoint`, `getShapeKind`, `getStraightPath`, `getStraightPathToArrow`). Renders one `Line` per polyline segment for per-segment hit-test. Implements segment drag (perpendicular only, 4px clamp, `Alt`-suspends-snap, snap-to-align). Renders dashed cyan alignment line during snap. |

Files **explicitly not touched**: shape components (`ArgumentShape`, `SupportShape`, `TeacherSupportShape`, `InfoBoxShape`, `EmbeddedImage`, `Legend`), Properties/Palette/Toolbar components, `styleResolver.ts`, `styleConfig.ts`, `SettingsModal`, `App.tsx` (apart from picking up the bumped `SAVE_SCHEMA_VERSION` via existing import), `diagramxExport.ts`.

---

## Task 1: Schema change — add `waypoints` and bump version

**Files:**
- Modify: `src/types/connections.ts`
- Modify: `src/utils/schema.ts`

- [ ] **Step 1: Add `waypoints?: Position[]` to `Connection`**

Replace the contents of `src/types/connections.ts` with:

```ts
// Connection Types for Extended Toulmin Diagrams

import type { Position } from './elements';

export type { Position };

export type ConnectionType = 'support';

// Target can be an element ID or an attachment to another connection
export interface ConnectionTarget {
  connectionId: string;  // ID of the connection to attach to
  position: number;      // 0-1 position along the connection polyline
}

export interface Connection {
  id: string;
  from: string;  // Element ID
  to: string | ConnectionTarget;  // Element ID or arrow attachment
  type: ConnectionType;
  waypoints?: Position[];  // Interior bend points (orthogonal). Empty/undefined → default Z-elbow at render.
}

// Type guard for arrow attachment
export function isArrowAttachment(to: string | ConnectionTarget): to is ConnectionTarget {
  return typeof to === 'object' && 'connectionId' in to;
}
```

- [ ] **Step 2: Bump `SAVE_SCHEMA_VERSION`**

Edit `src/utils/schema.ts` — change `'1.3'` to `'1.4'`:

```ts
// Save-format schema version stamped into every saved diagram JSON.
// Bump on any breaking schema change. Optional/additive fields don't require a bump,
// but bumping when a new field is added is fine and helps observability.
export const SAVE_SCHEMA_VERSION = '1.4';
```

- [ ] **Step 3: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors. (`Position` was already exported from `elements.ts`; `connections.ts` now re-exports it for callers that import only from `connections.ts`.)

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/connections.ts src/utils/schema.ts
git commit -m "feat(connectors): add Connection.waypoints field, bump schema 1.3 → 1.4"
```

---

## Task 2: Pure geometry helpers — `src/utils/orthogonalRouting.ts`

**Files:**
- Create: `src/utils/orthogonalRouting.ts`

- [ ] **Step 1: Create the module with pure helpers**

Create `src/utils/orthogonalRouting.ts`:

```ts
// Pure geometry for orthogonal (Manhattan) connector routing.
// No React or Konva imports — these are unit-testable functions.

import type { DiagramElement, Position, Connection } from '../types';

export type SegmentOrientation = 'horizontal' | 'vertical';

export interface Segment {
  start: Position;
  end: Position;
  orientation: SegmentOrientation;
}

function getCenter(el: DiagramElement): Position {
  return {
    x: el.position.x + el.size.width / 2,
    y: el.position.y + el.size.height / 2,
  };
}

// Compute the default Z-elbow virtual waypoints for a connection that has no stored waypoints.
// |dx| >= |dy| → vertical trunk (segments alternate H-V-H).
// otherwise   → horizontal trunk (segments alternate V-H-V).
export function computeDefaultZWaypoints(fromEl: DiagramElement, toEl: DiagramElement): Position[] {
  const fromC = getCenter(fromEl);
  const toC = getCenter(toEl);
  const dx = toC.x - fromC.x;
  const dy = toC.y - fromC.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (fromC.x + toC.x) / 2;
    return [
      { x: midX, y: fromC.y },
      { x: midX, y: toC.y },
    ];
  } else {
    const midY = (fromC.y + toC.y) / 2;
    return [
      { x: fromC.x, y: midY },
      { x: toC.x, y: midY },
    ];
  }
}

// Returns stored waypoints if present, else virtual default Z waypoints.
export function getEffectiveWaypoints(
  conn: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
): Position[] {
  if (conn.waypoints && conn.waypoints.length > 0) {
    return conn.waypoints;
  }
  return computeDefaultZWaypoints(fromEl, toEl);
}

// Determine the orientation of the segment going FROM the box edge TO `firstWaypoint`,
// given the next waypoint after that. Required because segment[0]'s orientation can't
// be read from a single point — it's inferred by alternation from segment[1].
//
// secondWaypoint may be undefined for a single-waypoint connection (post-v1, when remove-bend ships).
// In v1, all stored connections have ≥2 waypoints (Z-shape and shapes derived via segment-drag),
// or no waypoints at all (default Z generates 2 waypoints virtually). So secondWaypoint is always defined here.
export function inferEndSegmentOrientation(
  firstWaypoint: Position,
  secondWaypoint: Position | undefined,
): SegmentOrientation {
  if (!secondWaypoint) {
    // Defensive fallback for future single-waypoint case: assume horizontal.
    // v1 never hits this branch.
    return 'horizontal';
  }
  // segment[1] from firstWaypoint to secondWaypoint:
  //   shared y → horizontal segment
  //   shared x → vertical segment
  // segment[0] alternates: horizontal if segment[1] vertical, and vice versa.
  const segment1Horizontal = firstWaypoint.y === secondWaypoint.y;
  return segment1Horizontal ? 'vertical' : 'horizontal';
}

// Compute the box-edge exit point for a first/last segment whose orientation is known
// and whose interior endpoint is `neighborWaypoint`.
export function clipOrthogonalEndpoint(
  el: DiagramElement,
  neighborWaypoint: Position,
  segmentOrientation: SegmentOrientation,
): Position {
  const center = getCenter(el);
  const left = el.position.x;
  const right = el.position.x + el.size.width;
  const top = el.position.y;
  const bottom = el.position.y + el.size.height;

  if (segmentOrientation === 'horizontal') {
    // Segment is horizontal; exits left or right edge at y = neighborWaypoint.y.
    let y = neighborWaypoint.y;
    // Fallback: if y is outside the box's vertical extent, migrate to nearest top/bottom edge midline.
    if (y < top || y > bottom) {
      y = Math.max(top, Math.min(bottom, y));
    }
    const x = neighborWaypoint.x > center.x ? right : left;
    return { x, y };
  } else {
    // Segment is vertical; exits top or bottom edge at x = neighborWaypoint.x.
    let x = neighborWaypoint.x;
    if (x < left || x > right) {
      x = Math.max(left, Math.min(right, x));
    }
    const y = neighborWaypoint.y > center.y ? bottom : top;
    return { x, y };
  }
}

// Build the rendered polyline points for an element-to-element connection.
// Returns flattened [x0, y0, x1, y1, ...] for direct use as Konva Line `points`.
export function getOrthogonalPath(
  fromEl: DiagramElement,
  toEl: DiagramElement,
  waypoints: Position[],
): number[] {
  if (waypoints.length === 0) {
    // Defensive: should never happen — caller should pass effective waypoints.
    waypoints = computeDefaultZWaypoints(fromEl, toEl);
  }

  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];

  const fromOrientation = inferEndSegmentOrientation(firstWp, waypoints[1]);
  const toOrientation = inferEndSegmentOrientation(lastWp, waypoints[waypoints.length - 2]);

  const fromExit = clipOrthogonalEndpoint(fromEl, firstWp, fromOrientation);
  const toEntry = clipOrthogonalEndpoint(toEl, lastWp, toOrientation);

  const out: number[] = [fromExit.x, fromExit.y];
  for (const wp of waypoints) {
    out.push(wp.x, wp.y);
  }
  out.push(toEntry.x, toEntry.y);
  return out;
}

// Warrant-attachment connections stay straight in v1 (see spec §5).
// Source clips to bounding rect; target is the exact attachment point.
export function getStraightAttachmentPath(fromEl: DiagramElement, attachPoint: Position): number[] {
  const center = getCenter(fromEl);
  const dx = attachPoint.x - center.x;
  const dy = attachPoint.y - center.y;
  if (dx === 0 && dy === 0) return [center.x, center.y, attachPoint.x, attachPoint.y];

  const hw = fromEl.size.width / 2;
  const hh = fromEl.size.height / 2;
  // Line-rectangle intersection: scale (dx, dy) until it hits one of the box's half-extents.
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  const exit = { x: center.x + t * dx, y: center.y + t * dy };
  return [exit.x, exit.y, attachPoint.x, attachPoint.y];
}

// Decompose a flat points array (from getOrthogonalPath) into segments with orientation.
// Used by hit-testing and snap-to-align.
export function getSegments(points: number[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    // For an orthogonal polyline, every segment is either horizontal (same y) or vertical (same x).
    // Floating-point safety: compare with tolerance.
    const horizontal = Math.abs(start.y - end.y) < 0.5;
    segs.push({ start, end, orientation: horizontal ? 'horizontal' : 'vertical' });
  }
  return segs;
}
```

- [ ] **Step 2: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Sanity-check helpers in dev console**

Run: `npm run dev`. In the browser at the dev URL, open DevTools console and run:

```js
// Quick smoke test — paste into browser console after dev server is up.
const fromEl = { position: { x: 0, y: 100 }, size: { width: 100, height: 60 } };
const toEl   = { position: { x: 300, y: 0 }, size: { width: 100, height: 60 } };
const m = await import('/src/utils/orthogonalRouting.ts');
console.log('default Z:', m.computeDefaultZWaypoints(fromEl, toEl));
// Expect: [{x:225,y:130},{x:225,y:30}] — vertical trunk at x=225, dominant axis is horizontal.
console.log('path:', m.getOrthogonalPath(fromEl, toEl, m.computeDefaultZWaypoints(fromEl, toEl)));
// Expect: [100, 130, 225, 130, 225, 30, 300, 30] — 4 points, exits right of source, enters left of target.
console.log('segments:', m.getSegments(m.getOrthogonalPath(fromEl, toEl, m.computeDefaultZWaypoints(fromEl, toEl))));
// Expect: 3 segments, orientations [horizontal, vertical, horizontal].
```

If any expected output is wrong, fix the helpers and re-run before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/utils/orthogonalRouting.ts
git commit -m "feat(connectors): add pure geometry helpers for orthogonal routing"
```

---

## Task 3: Wire renderer to use the new helpers (Z-elbow visible, no interaction yet)

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

This task replaces the path computation only. Hit-testing is still single-line (selection works), drag does not yet exist, snap does not yet exist. The visible result: every connector renders as a Z-elbow.

- [ ] **Step 1: Replace `Arrow.tsx` path-computation logic**

Open `src/components/Canvas/shapes/Arrow.tsx`. Remove these helpers entirely (and only these):
- `getElementCenter` (lines ~24-29)
- `lineRectEdgePoint` (lines ~88-101)
- `lineEllipseEdgePoint` (lines ~105-119)
- `getShapeKind` and the `ShapeKind` type (lines ~78-84)
- `getEdgePoint` (lines ~123-134)
- `getStraightPath` (lines ~138-147)
- `getStraightPathToArrow` (lines ~152-158)

Keep `getPointOnPolyline` unchanged. Keep the entire `ConnectionArrow` component body (the React render) unchanged for this task — we'll modify it in later tasks.

Replace the `getConnectionPathPoints` function with this version:

```ts
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getStraightAttachmentPath,
} from '../../../utils/orthogonalRouting';

// Resolve a connection to its rendered polyline points.
// Element-to-element connections: orthogonal polyline (Z-elbow default + stored waypoints).
// Warrant-attachment connections: straight 2-point segment (orthogonal-attachment is out of scope in v1).
function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): { points: number[] } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const attachPoint = getPointOnPolyline(targetResult.points, attachment.position);
    return { points: getStraightAttachmentPath(fromEl, attachPoint) };
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;

  // Identical-endpoint degeneracy: both elements at exactly the same position with same size
  // would produce a zero-length default Z. Skip rendering rather than draw a degenerate shape.
  if (
    fromEl.position.x === toEl.position.x &&
    fromEl.position.y === toEl.position.y &&
    fromEl.size.width === toEl.size.width &&
    fromEl.size.height === toEl.size.height
  ) {
    return null;
  }

  const waypoints = getEffectiveWaypoints(connection, fromEl, toEl);
  return { points: getOrthogonalPath(fromEl, toEl, waypoints) };
}
```

- [ ] **Step 2: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Browser-verify Z-elbow rendering**

Run: `npm run dev`. In Claude for Chrome:

1. Create a new diagram with two argument elements positioned diagonally (e.g., a Data box at upper-left and a Claim box at lower-right).
2. Connect them via connect-mode.
3. **Verify:** the connector renders as a Z-elbow (3 segments, orthogonal). The trunk is vertical (since horizontal displacement dominates). The connector terminates on the box edges, not at centers.
4. Drag the source box around. **Verify:** the elbow follows automatically without visible glitches.
5. Try a vertically-dominant layout (Data on top, Claim below). **Verify:** trunk becomes horizontal.
6. Add a warrant cloud and use connect-mode to attach it to the Data→Claim connection mid-segment. **Verify:** attachment line is a straight 2-point segment (not orthogonal — by spec design).
7. Load any existing saved 1.3 diagram. **Verify:** connectors auto-render as Z-elbows; no errors in console.

If any verification fails, debug before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(connectors): render orthogonal Z-elbow paths (no interaction yet)"
```

---

## Task 4: Store action — `updateConnectionWaypoints`

**Files:**
- Modify: `src/store/diagramStore.ts`

- [ ] **Step 1: Add the action signature to `DiagramState`**

In `src/store/diagramStore.ts`, find the "Actions - Connections" section in the `DiagramState` interface (around line 90-92):

```ts
  // Actions - Connections
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;
```

Add a third action below `removeConnection`:

```ts
  // Actions - Connections
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;
  updateConnectionWaypoints: (id: string, waypoints: Position[] | undefined) => void;
```

- [ ] **Step 2: Add the action implementation**

In the same file, find the `addConnection` and `removeConnection` implementations (around lines 365-371). They look like:

```ts
      addConnection: (connection) =>
        set((state) => ({ connections: [...state.connections, connection] })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((conn) => conn.id !== id),
        })),
```

Add this implementation right after `removeConnection`:

```ts
      updateConnectionWaypoints: (id, waypoints) =>
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.id === id
              ? (waypoints === undefined
                  ? (() => { const { waypoints: _drop, ...rest } = conn; return rest as Connection; })()
                  : { ...conn, waypoints })
              : conn,
          ),
        })),
```

The `undefined` branch lets undo restore a connection to its virtual-Z state by removing the field entirely (per spec edge-case rule for "undo of first segment-drag").

If `Position` isn't already in the imports at the top of `diagramStore.ts`, add it:

```ts
import type {
  DiagramElement, Connection, Position, Size, ContributorType,
  ImageSettings, SupportType, SupportSubtype, ArgumentType,
  SupportContributor, ArgumentElement, SupportElement,
  Transcript, TranscriptLine,
} from '../types';
```

(`Position` is already in this import per existing line 4 — verify and only add if missing.)

- [ ] **Step 3: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Sanity-test the action in dev console**

Run: `npm run dev`. With a diagram that has at least one element-to-element connection, open DevTools console:

```js
const store = window.__getStore?.() // Only if exposed; otherwise use React DevTools
// Or, simpler: select a connection in the UI, find its id via the React tree, then:
// useDiagramStore.getState().updateConnectionWaypoints('<connection-id>', [{x:200,y:200}, {x:200,y:300}]);
// useDiagramStore.getState().connections // verify waypoints field is set
// useDiagramStore.getState().updateConnectionWaypoints('<connection-id>', undefined);
// useDiagramStore.getState().connections // verify waypoints field is gone (not present), not just undefined
```

If you can't easily access the store from the console, skip this step — Task 6's drag interaction will exercise the action through the UI.

- [ ] **Step 5: Commit**

```bash
git add src/store/diagramStore.ts
git commit -m "feat(connectors): add updateConnectionWaypoints store action"
```

---

## Task 5: Per-segment hit-testing & cursor change

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

After this task, hovering each individual segment shows the proper resize cursor; selection still works as today. No drag yet.

- [ ] **Step 1: Render one Konva `Line` per segment**

In `src/components/Canvas/shapes/Arrow.tsx`, find the section in `ConnectionArrow` that renders the connector line (currently a single `<Line points={pathPoints} ... />` near the end of the component, ~line 299).

Add this import at the top of the file if not already present:

```ts
import { getSegments } from '../../../utils/orthogonalRouting';
```

Add this state hook near the top of the component body:

```ts
const segments = getSegments(pathPoints);
```

Replace the single `<Line>` connector with a per-segment render. Keep `isAttachment` connections as a single line (their straight 2-point path doesn't benefit from per-segment hit testing):

```tsx
{isAttachment ? (
  <Line
    points={pathPoints}
    stroke={strokeColor}
    strokeWidth={strokeWidth}
    onClick={handleArrowClick}
    onTap={handleArrowClick}
    onMouseEnter={handleMouseEnter}
    onMouseLeave={handleMouseLeave}
    hitStrokeWidth={20}
  />
) : (
  segments.map((seg, idx) => (
    <Line
      key={`seg-${idx}`}
      points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      onClick={handleArrowClick}
      onTap={handleArrowClick}
      onMouseEnter={(e) => {
        handleMouseEnter();
        if (!connectModeActive) {
          const stage = e.target.getStage();
          if (stage) {
            stage.container().style.cursor =
              seg.orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
          }
        }
      }}
      onMouseLeave={(e) => {
        handleMouseLeave();
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
      hitStrokeWidth={20}
    />
  ))
)}
```

- [ ] **Step 2: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Browser-verify cursor and selection**

Run: `npm run dev`. In Claude for Chrome:

1. Create a Z-elbow connection between two elements.
2. Hover over the **first segment** (horizontal stub from source). **Verify:** cursor changes to `ns-resize` (vertical-arrows cursor).
3. Hover over the **trunk segment** (vertical). **Verify:** cursor changes to `ew-resize` (horizontal-arrows cursor).
4. Hover over the **last segment** (horizontal stub to target). **Verify:** cursor `ns-resize`.
5. Click any segment to select the connection. **Verify:** highlight color changes (selected = `#4A90D9`).
6. Hover-attach a warrant in connect-mode. **Verify:** the attachment-point indicator still appears (the existing connect-mode hover behavior is preserved).

If any cursor is wrong, double-check `seg.orientation` mapping (horizontal segment → ns-resize because you drag it vertically).

- [ ] **Step 4: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(connectors): per-segment hit-test and resize cursors"
```

---

## Task 6: Segment drag (perpendicular only, with 4px minimum-segment clamp)

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

The biggest task. Implements the core reshape gesture.

- [ ] **Step 1: Add transient drag state and the drag handler**

In `src/components/Canvas/shapes/Arrow.tsx`, add the following state and refs to `ConnectionArrow` (after the existing state and before the JSX return):

```ts
import { useRef, useState } from 'react';

// ... inside ConnectionArrow ...

// Transient drag state — not persisted to store until mouseup.
const [dragOverride, setDragOverride] = useState<Position[] | null>(null);
const dragRef = useRef<{
  segmentIdx: number;
  orientation: SegmentOrientation;
  startWaypoints: Position[];
  startPointer: Position;
  // Indices of waypoints in the array that this segment's endpoints map to.
  // segment[i] connects waypoint[i-1] and waypoint[i] for i in [1, N], with
  // synthetic source-edge endpoint at i=0 and target-edge endpoint at i=N+1.
  waypointIndexA: number | null;  // null if endpoint is the source-edge (synthetic)
  waypointIndexB: number | null;  // null if endpoint is the target-edge (synthetic)
} | null>(null);

const updateConnectionWaypoints = useDiagramStore((s) => s.updateConnectionWaypoints);
```

Update `SegmentOrientation` import:

```ts
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getStraightAttachmentPath,
  getSegments,
  type SegmentOrientation,
} from '../../../utils/orthogonalRouting';
```

Update `useDiagramStore` import to include the new action — find the existing import (probably already imports the store), and ensure it can read `updateConnectionWaypoints`. Example if the existing pattern is selector-based:

```ts
import { useDiagramStore } from '../../../store/diagramStore';
```

(Add only if not already present.)

- [ ] **Step 2: Compute effective waypoints with drag override**

Replace the line where you compute `pathPoints` (which today comes from `getConnectionPathPoints`) with logic that prefers `dragOverride` when set. Inside `ConnectionArrow`, before the `pathPoints` computation:

```ts
// Compute effective waypoints, preferring transient drag override.
let pathResult = getConnectionPathPoints(connection, elements, connections);
if (pathResult && !isAttachment && dragOverride) {
  const fromEl = elements.find((el) => el.id === connection.from);
  const toEl = elements.find((el) => el.id === connection.to);
  if (fromEl && toEl) {
    pathResult = { points: getOrthogonalPath(fromEl, toEl, dragOverride) };
  }
}
if (!pathResult || pathResult.points.length < 4) return null;
const { points: pathPoints } = pathResult;
```

- [ ] **Step 3: Implement the drag start / move / end handlers**

The codebase's stage ref pattern lives in `src/components/Canvas/Canvas.tsx` (`const stageRef = useRef<Konva.Stage>(null)` at line 36; `stage.getPointerPosition()` is the read pattern). Inside the per-connection `Arrow.tsx` component, we don't have direct access to that stage ref, but every Konva event handler receives an event whose target's stage we can query via `e.target.getStage()`. For `mousemove`/`mouseup` outside the segment's own hit region we use **window-level listeners** added on dragstart and removed on dragend — this is the standard Konva drag pattern when you want pointer tracking outside the shape itself.

For a connection with N stored (or virtual) waypoints, the polyline has N+1 segments:
- segment 0: source-edge → waypoint[0]  (endpoints: synthetic-source, waypoint[0])
- segment i (1 ≤ i ≤ N-1): waypoint[i-1] → waypoint[i]
- segment N: waypoint[N-1] → target-edge  (endpoints: waypoint[N-1], synthetic-target)

So segment `idx`'s "waypoint endpoints" are `waypoint[idx-1]` and `waypoint[idx]`, with `null` substituting on either end when the segment touches a synthetic source/target endpoint.

Add the following inside `ConnectionArrow`. Place the helper functions above the JSX return:

```ts
const MIN_SEGMENT_PX = 4;

// Read the latest stored waypoints (or virtual default) — used to compute perpendicular coords
// of neighboring segments for the clamp.
const getStartWaypoints = (): Position[] => {
  const fromEl = elements.find((el) => el.id === connection.from);
  const toEl = elements.find((el) => el.id === connection.to);
  if (!fromEl || !toEl) return [];
  if (connection.waypoints && connection.waypoints.length > 0) return [...connection.waypoints];
  return [...getEffectiveWaypoints(connection, fromEl, toEl)];
};

const handleSegmentDragStart = (segmentIdx: number, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
  if (connectModeActive || isAttachment) return;
  e.cancelBubble = true;

  const stage = e.target.getStage();
  const pointer = stage?.getPointerPosition();
  if (!stage || !pointer) return;

  const startWaypoints = getStartWaypoints();
  if (startWaypoints.length === 0) return;

  const seg = segments[segmentIdx];
  const numSegs = segments.length;
  const waypointIndexA = segmentIdx === 0 ? null : segmentIdx - 1;
  const waypointIndexB = segmentIdx === numSegs - 1 ? null : segmentIdx;

  dragRef.current = {
    segmentIdx,
    orientation: seg.orientation,
    startWaypoints,
    startPointer: { x: pointer.x, y: pointer.y },
    waypointIndexA,
    waypointIndexB,
  };

  // Materialize virtual-Z immediately so the user sees their drag against stable geometry.
  setDragOverride(startWaypoints);

  window.addEventListener('mousemove', handleWindowMove);
  window.addEventListener('mouseup', handleWindowUp);
  window.addEventListener('touchmove', handleWindowMove);
  window.addEventListener('touchend', handleWindowUp);
};

// Compute the clamped new perpendicular coordinate for the dragged segment.
// Neighbors of the dragged segment are PERPENDICULAR (alternation) — they connect to its endpoints.
// The neighbor SEGMENTS' OTHER endpoints (the "neighbor-of-neighbor" waypoints) sit on the same axis
// as the dragged segment. The clamp rule: the dragged segment's perpendicular coord must stay
// at least MIN_SEGMENT_PX away from each of those neighbor-of-neighbor coords (otherwise the
// perpendicular neighbor would shrink below 4px).
function clampToMinSegment(
  newPerp: number,
  startWaypoints: Position[],
  segmentIdx: number,
  orientation: SegmentOrientation,
): number {
  const numSegs = startWaypoints.length + 1;
  const limits: number[] = [];
  // Neighbor before: segment[segmentIdx-1] connects waypoint[segmentIdx-2] (or source-synthetic)
  // to waypoint[segmentIdx-1]. The "far end" of that neighbor (the one NOT shared with the dragged
  // segment) sits on our perpendicular axis.
  if (segmentIdx - 1 >= 0) {
    const farIdx = segmentIdx - 2;
    if (farIdx >= 0) {
      const far = startWaypoints[farIdx];
      limits.push(orientation === 'horizontal' ? far.y : far.x);
    }
    // If farIdx < 0, the neighbor is segment[0] which terminates at the source box edge.
    // The synthetic source-edge perpendicular coord depends on the live drag, so we can't pre-compute
    // a stable clamp boundary against it. Skipping the clamp on that side is acceptable: the source-edge
    // exit slides freely along the box edge in v1 (per spec §5).
  }
  // Neighbor after: same logic on the other side.
  if (segmentIdx + 1 < numSegs) {
    const farIdx = segmentIdx + 1;
    if (farIdx < startWaypoints.length) {
      const far = startWaypoints[farIdx];
      limits.push(orientation === 'horizontal' ? far.y : far.x);
    }
    // farIdx >= startWaypoints.length means neighbor terminates at target box edge — same skip rationale.
  }
  // Apply 4px exclusion zones around each limit.
  for (const lim of limits) {
    if (Math.abs(newPerp - lim) < MIN_SEGMENT_PX) {
      newPerp = newPerp >= lim ? lim + MIN_SEGMENT_PX : lim - MIN_SEGMENT_PX;
    }
  }
  return newPerp;
}

const handleWindowMove = (e: MouseEvent | TouchEvent) => {
  const drag = dragRef.current;
  if (!drag) return;

  // Pull pointer position from the stage. We need any segment's stage; query via the connection list ref
  // is awkward — use the standard react-konva trick of reading the event's clientX/clientY and converting
  // to stage coords via the stored stageRef. Simpler: query via a stage we cache on dragstart.
  const altHeld = 'altKey' in e ? (e as MouseEvent).altKey : false;

  // Use clientX/clientY directly (window-space). Subtract the stage's container bounding rect to get
  // stage-relative coords. Since the diagram canvas may be panned/zoomed, this needs to match the
  // existing stage's pointer-coord system. Read stage.getPointerPosition() at any time during the drag
  // by accessing the stage saved on dragstart — extend dragRef to hold it:
  //   add `stage: Konva.Stage` to the dragRef type, capture `stage` in handleSegmentDragStart.
  // Implementer: do that small extension here.
  const stage = drag.stage;
  if (!stage) return;
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const dx = pointer.x - drag.startPointer.x;
  const dy = pointer.y - drag.startPointer.y;

  const newWaypoints = drag.startWaypoints.map((wp) => ({ ...wp }));

  if (drag.orientation === 'horizontal') {
    // Dragging a horizontal segment: change y of the segment's two waypoint endpoints (those on this segment).
    let rawY: number;
    if (drag.waypointIndexA !== null) {
      rawY = drag.startWaypoints[drag.waypointIndexA].y + dy;
    } else if (drag.waypointIndexB !== null) {
      rawY = drag.startWaypoints[drag.waypointIndexB].y + dy;
    } else {
      return;
    }

    // Snap (added in Task 7); for now no snap — pass rawY through.
    let newY = rawY;
    newY = clampToMinSegment(newY, drag.startWaypoints, drag.segmentIdx, 'horizontal');
    void altHeld;  // used in Task 7

    if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].y = newY;
    if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].y = newY;
  } else {
    // Vertical segment.
    let rawX: number;
    if (drag.waypointIndexA !== null) {
      rawX = drag.startWaypoints[drag.waypointIndexA].x + dx;
    } else if (drag.waypointIndexB !== null) {
      rawX = drag.startWaypoints[drag.waypointIndexB].x + dx;
    } else {
      return;
    }

    let newX = rawX;
    newX = clampToMinSegment(newX, drag.startWaypoints, drag.segmentIdx, 'vertical');
    void altHeld;

    if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].x = newX;
    if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].x = newX;
  }

  setDragOverride(newWaypoints);
};

const handleWindowUp = () => {
  const drag = dragRef.current;
  if (drag && dragOverride) {
    updateConnectionWaypoints(connection.id, dragOverride);
  }
  dragRef.current = null;
  setDragOverride(null);

  window.removeEventListener('mousemove', handleWindowMove);
  window.removeEventListener('mouseup', handleWindowUp);
  window.removeEventListener('touchmove', handleWindowMove);
  window.removeEventListener('touchend', handleWindowUp);
};
```

Update the `dragRef` type at the top of the component to also hold the stage reference captured on dragstart:

```ts
const dragRef = useRef<{
  segmentIdx: number;
  orientation: SegmentOrientation;
  startWaypoints: Position[];
  startPointer: Position;
  waypointIndexA: number | null;
  waypointIndexB: number | null;
  stage: Konva.Stage;  // captured on dragstart for pointer reads during move
} | null>(null);
```

In `handleSegmentDragStart`, add `stage` to the dragRef payload:

```ts
dragRef.current = {
  segmentIdx,
  orientation: seg.orientation,
  startWaypoints,
  startPointer: { x: pointer.x, y: pointer.y },
  waypointIndexA,
  waypointIndexB,
  stage,
};
```

Important: `handleWindowMove` and `handleWindowUp` must be declared with `useCallback` (or as stable references via `useRef`) so that `removeEventListener` actually removes the listener that was added. Wrap them in `useCallback` with the appropriate dependencies (the store action, the segments array, etc.). If that introduces re-render churn, fall back to the `useRef` pattern: store the active handler in `useRef` and reference `ref.current` in the listener.

- [ ] **Step 4: Wire dragStart onto each segment Line**

Update the segment `<Line>` map from Task 5 to add `onMouseDown` / `onTouchStart`:

```tsx
segments.map((seg, idx) => (
  <Line
    key={`seg-${idx}`}
    points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
    stroke={strokeColor}
    strokeWidth={strokeWidth}
    onClick={handleArrowClick}
    onTap={handleArrowClick}
    onMouseDown={(e) => handleSegmentDragStart(idx, e)}
    onTouchStart={(e) => handleSegmentDragStart(idx, e)}
    onMouseEnter={/* same as Task 5 */}
    onMouseLeave={/* same as Task 5 */}
    hitStrokeWidth={20}
  />
))
```

- [ ] **Step 5: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Browser-verify segment drag**

Run: `npm run dev`. In Claude for Chrome:

1. Create a Z-elbow connection.
2. **Drag the trunk** (vertical middle segment) left/right. **Verify:** trunk slides on x; first/last segments stretch to follow; source/target box exits stay at their boxes' edges; pointer is locked to horizontal-only motion.
3. **Drag the first segment** (horizontal stub from source) up/down. **Verify:** segment slides on y; source box exit slides along the box's right edge.
4. **Drag the last segment** to/from the target. **Verify:** target box entry slides similarly.
5. **Drag the trunk far enough** to attempt collapsing the first segment to zero length. **Verify:** drag is clamped at 4px min — segment refuses to shrink below that gap.
6. **Drag once on a connection that started as virtual-Z** (i.e., one you haven't dragged before). **Verify:** drag works, and after `mouseup` the connection's `waypoints` field is set (inspect via React DevTools or by saving and inspecting the JSON).
7. **Move a connected element** (drag the source box around). **Verify:** the trunk's stored x stays put; the first segment lengthens/shortens; source exit slides along the box edge.
8. **Test on a warrant-attachment connection.** **Verify:** dragging is disabled (it stays a single straight line, no drag handles activate).

If any verification fails, debug before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(connectors): segment drag with min-segment clamp and virtual-Z materialization"
```

---

## Task 7: Snap-to-align with Alt-suspend and dashed alignment line

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx`

- [ ] **Step 1: Compute snap candidates from other connections**

Inside `ConnectionArrow`, add a helper that collects the perpendicular-axis coordinates of all *other* connections' same-orientation segments:

```ts
const SNAP_THRESHOLD_PX = 6;

function collectSnapCandidates(
  draggedConnId: string,
  draggedOrientation: SegmentOrientation,
  allConnections: Connection[],
  allElements: DiagramElement[],
): number[] {
  const out: number[] = [];
  for (const conn of allConnections) {
    if (conn.id === draggedConnId) continue;
    if (isArrowAttachment(conn.to)) continue;
    const fromEl = allElements.find((e) => e.id === conn.from);
    const toEl = allElements.find((e) => e.id === conn.to);
    if (!fromEl || !toEl) continue;
    const wps = getEffectiveWaypoints(conn, fromEl, toEl);
    const points = getOrthogonalPath(fromEl, toEl, wps);
    const segs = getSegments(points);
    for (const s of segs) {
      if (s.orientation !== draggedOrientation) continue;
      // Perpendicular coordinate: y for horizontal segs, x for vertical segs.
      out.push(s.orientation === 'horizontal' ? s.start.y : s.start.x);
    }
  }
  return out;
}
```

- [ ] **Step 2: Apply snap during drag-move**

Add `snapLine` state inside `ConnectionArrow`, near the existing `dragOverride` state:

```ts
const [snapLine, setSnapLine] = useState<{ orientation: SegmentOrientation; coord: number } | null>(null);
```

In Task 6 you wrote `let newY = rawY;` and `let newX = rawX;` in `handleWindowMove`, immediately followed by `clampToMinSegment` and a `void altHeld;` placeholder. Replace those placeholder regions with snap logic. The full revised `handleWindowMove` body:

```ts
const handleWindowMove = (e: MouseEvent | TouchEvent) => {
  const drag = dragRef.current;
  if (!drag) return;

  const altHeld = 'altKey' in e ? (e as MouseEvent).altKey : false;

  const stage = drag.stage;
  if (!stage) return;
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const dx = pointer.x - drag.startPointer.x;
  const dy = pointer.y - drag.startPointer.y;

  const newWaypoints = drag.startWaypoints.map((wp) => ({ ...wp }));

  // Helper: try to snap rawCoord to the nearest candidate within threshold.
  // Returns the snapped coord and updates snapLine state for visual feedback.
  const applySnap = (rawCoord: number, orientation: SegmentOrientation): number => {
    if (altHeld) {
      setSnapLine(null);
      return rawCoord;
    }
    const candidates = collectSnapCandidates(connection.id, orientation, connections, elements);
    let bestDist = SNAP_THRESHOLD_PX;
    let bestCoord: number | null = null;
    for (const c of candidates) {
      const d = Math.abs(c - rawCoord);
      if (d < bestDist) {
        bestDist = d;
        bestCoord = c;
      }
    }
    if (bestCoord !== null) {
      setSnapLine({ orientation, coord: bestCoord });
      return bestCoord;
    }
    setSnapLine(null);
    return rawCoord;
  };

  if (drag.orientation === 'horizontal') {
    let rawY: number;
    if (drag.waypointIndexA !== null) {
      rawY = drag.startWaypoints[drag.waypointIndexA].y + dy;
    } else if (drag.waypointIndexB !== null) {
      rawY = drag.startWaypoints[drag.waypointIndexB].y + dy;
    } else {
      return;
    }

    let newY = applySnap(rawY, 'horizontal');
    newY = clampToMinSegment(newY, drag.startWaypoints, drag.segmentIdx, 'horizontal');

    if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].y = newY;
    if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].y = newY;
  } else {
    let rawX: number;
    if (drag.waypointIndexA !== null) {
      rawX = drag.startWaypoints[drag.waypointIndexA].x + dx;
    } else if (drag.waypointIndexB !== null) {
      rawX = drag.startWaypoints[drag.waypointIndexB].x + dx;
    } else {
      return;
    }

    let newX = applySnap(rawX, 'vertical');
    newX = clampToMinSegment(newX, drag.startWaypoints, drag.segmentIdx, 'vertical');

    if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].x = newX;
    if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].x = newX;
  }

  setDragOverride(newWaypoints);
};
```

Also clear the snap line in `handleWindowUp`:

```ts
const handleWindowUp = () => {
  const drag = dragRef.current;
  if (drag && dragOverride) {
    updateConnectionWaypoints(connection.id, dragOverride);
  }
  dragRef.current = null;
  setDragOverride(null);
  setSnapLine(null);

  window.removeEventListener('mousemove', handleWindowMove);
  window.removeEventListener('mouseup', handleWindowUp);
  window.removeEventListener('touchmove', handleWindowMove);
  window.removeEventListener('touchend', handleWindowUp);
};
```

- [ ] **Step 3: Render the dashed cyan alignment line**

After the segment Lines in the JSX return, add:

```tsx
{snapLine && (() => {
  // Draw a thin dashed line at the snapped coordinate, spanning the full stage area.
  // Use a wide range so it visually "goes off screen" on each side.
  const RANGE = 10000;
  const points = snapLine.orientation === 'horizontal'
    ? [-RANGE, snapLine.coord, RANGE, snapLine.coord]
    : [snapLine.coord, -RANGE, snapLine.coord, RANGE];
  return (
    <Line
      points={points}
      stroke="#00CED1"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
})()}
```

- [ ] **Step 4: Verify typecheck and lint clean**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Browser-verify snap behavior**

Run: `npm run dev`. In Claude for Chrome:

1. Create three boxes: a Data box (left), and two Claim boxes stacked vertically (right). Connect Data → Claim1 and Data → Claim2 separately. Two Z-elbows render with two distinct vertical trunks.
2. **Drag Connection 2's trunk slowly toward Connection 1's trunk.** **Verify:** within ~6px of the other trunk, the dragged trunk snaps to align; a thin dashed cyan line appears at the snap coordinate.
3. **Release the drag.** **Verify:** dashed cyan line disappears; both connections now share a single visible trunk.
4. **Hold `Alt` while dragging the trunk.** **Verify:** snap is suspended; trunk drags freely with no dashed line.
5. **Reproduce the IMG_3632 scene** (video → upper claim, video → lower claim, warrant cloud attached perpendicular to the trunk). **Verify:** with snap, the two trunks merge into one visible trunk, and you can attach a warrant to the merged trunk.
6. **Verify** with several connections in the diagram that snap detection still feels responsive (no obvious frame drop).

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(connectors): snap-to-align with Alt-suspend and dashed cyan indicator"
```

---

## Task 8: Edge-case verification & end-to-end check

**Files:**
- (no modifications expected unless verification surfaces a bug)

- [ ] **Step 1: Verify undo of first virtual-Z drag**

Run: `npm run dev`. In Claude for Chrome:

1. Create a fresh connection (it appears as virtual Z — `waypoints` undefined).
2. Drag a segment. **Verify:** `waypoints` is now stored.
3. Press `Cmd+Z` (or whichever is the existing undo binding in the app). **Verify:** the connection reverts to the virtual Z (its `waypoints` field is gone; you can confirm by saving and inspecting the JSON, or by inspecting the store via React DevTools).
4. Press `Cmd+Shift+Z` (redo). **Verify:** the dragged geometry is restored.

If undo restores `waypoints: []` instead of removing the field, fix the store action — the spec's edge-case rule requires the field to be absent, not empty, so the next render uses the default Z.

- [ ] **Step 2: Verify element-deletion cascade**

1. Create a Data → Claim connection with a warrant attached to its trunk.
2. Delete the Claim element. **Verify:** the Data → Claim connection is removed; the warrant connection (whose `to` is a `ConnectionTarget` to the deleted parent connection) is no longer rendered (the parent lookup fails and the renderer returns `null`, per existing logic in `getConnectionPathPoints`).
3. **Verify:** no errors in the dev console.
4. Note: the orphan warrant *connection* is still in `state.connections` but renders to nothing. This is pre-existing behavior, not introduced by this change. Document the pre-existing orphan as out-of-scope for this work.

- [ ] **Step 3: Verify save/load round-trip with waypoints**

1. Create a diagram with multiple connections; drag some segments to non-default positions; align a couple via snap.
2. Save the diagram (existing toolbar Save action). **Verify:** the saved JSON contains `version: "1.4"` and the connections with custom routing have a `waypoints` array; the others (still default Z) do not have a `waypoints` field at all.
3. Load the saved JSON back. **Verify:** all connections render with the same geometry as before save.
4. Take an existing **1.3** saved diagram and load it. **Verify:** loads cleanly with no errors; connectors render as Z-elbows; saving the file from the loaded state produces a 1.4-stamped output.

- [ ] **Step 4: Verify identical-endpoint degeneracy**

1. Create two elements at exactly the same `position` with the same size (use direct property edit if the UI prevents stacking).
2. Connect them. **Verify:** no connector renders (per the renderer's null return for identical endpoints).
3. Drag one element away. **Verify:** connector appears as a default Z.

- [ ] **Step 5: Reproduce IMG_3632**

1. With a fresh diagram, place a Data box (e.g., labeled "video") at lower-left, two Claim boxes stacked at upper-right.
2. Add a Warrant cloud at upper-left.
3. Connect Data → upper Claim, Data → lower Claim. Snap the two trunks together.
4. Connect Warrant → mid-trunk (click-attach).
5. **Verify:** the resulting diagram visually matches `IMG_3632.HEIC` (the rotated reference under `/Users/jenniferkleiman/Documents/GitHub/etd/`): a horizontal stub from Data, a shared vertical trunk to both Claims, and a perpendicular Warrant attachment.

- [ ] **Step 6: Final type-check, lint, and visual sanity**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit (if any fixes were needed)**

If steps 1-5 surfaced bugs that required code changes:

```bash
git add <files>
git commit -m "fix(connectors): <specific fix from verification>"
```

If everything passed without fixes, skip the commit.

---

## Out-of-scope reminders (do NOT implement here)

These appear in the spec's "Out of scope" list and will be queued as separate work. **Stop and surface to the user if any task in this plan seems to require them:**

- Click-to-insert-bend / click-to-remove-bend gestures.
- Orthogonal warrant-attachment routing (attachment lines stay straight in v1).
- Segment-indexed warrant attachment (`{segmentIndex, tInSegment}`).
- Click-cycling through overlapping connections on shared trunks.
- Keyboard nudge for selected connections.
- Connection copy/paste with relative waypoints.
- Composite argument types (`dataclaim`, `warrantclaim`).
- Sticky-group movement for support→argument associations.
- Image-to-JSON in-app import.
- Text-friendly implicit cloud shape.

If during implementation any of these turn out to be load-bearing — i.e., this plan can't ship without them — stop and escalate. Don't expand scope mid-stream.
