# Orthogonal Connectors with User-Editable Waypoints — Design

**Date:** 2026-05-05
**Status:** Design pending spec review before plan-writing.

## Background

Researcher feedback (Anna Conner) on 2026-04-27 and again on 2026-05-05 flagged that the current straight-diagonal connectors don't match how she draws Toulmin diagrams. Her sketches (`IMG_3630.HEIC`, `IMG_3632.HEIC`) consistently use **orthogonal (Manhattan) routing** with two specific patterns:

1. Every connector is composed of horizontal and vertical segments only — no diagonals.
2. Multiple connections from a shared source visibly **share a trunk** segment that branches to multiple targets, and warrants/rebuttals attach **perpendicular** to a trunk segment (not to the target element).

The previous orthogonal implementation was removed in commit `0ceacc4` (2026-04-26) and replaced with straight edge-to-edge clipping (spec: `docs/superpowers/specs/2026-04-26-simplify-connectors-and-remove-swimlanes-design.md`). The reason it was removed: it tried to **auto-route** each connection independently, producing unpredictable Z/L-shapes and lane-aligned exits the user couldn't anticipate. Auto-routing is the failure mode to avoid here.

This design replaces straight diagonals with **user-controlled orthogonal routing**: the user owns the bend points, the renderer just constrains segments to H/V. Trunk-sharing emerges from aligned waypoints rather than being computed.

## Goals

- All connectors render as orthogonal polylines (H/V segments only).
- Brand-new connections appear as a **Z-shape** (two auto-bends) with the trunk on the dominant axis (`|dx| ≥ |dy|` → vertical trunk; else horizontal trunk).
- The user reshapes connectors by **dragging segments perpendicular to themselves**. No corner-handle dragging in v1.
- **Snap-to-align** with other connections' parallel segments (6px threshold) makes shared trunks easy to produce.
- Warrant/rebuttal attachment to a connection (existing `ConnectionTarget` model) continues to work, with the attachment connection itself orthogonal.
- Existing saved diagrams (schema 1.3) auto-render orthogonally on load — no migration code, no per-connection routing flag, single routing style across the app.

## Non-goals

- No click-to-insert-bend or click-to-remove-bend in v1. Z default + segment-drag is enough to express the shapes Anna draws. Adding/removing bends mid-segment is real interaction-design work and is deferred.
- No corner-handle drag mode. One reshape gesture (segment drag), enforced strictly.
- No grid snap, no swimlane snap, no smart guides. Snap-to-align with other connections' segments is the only snap.
- No multi-target connections (`from: A, to: [B, C]`). Trunks are emergent — separate connections whose waypoints align — not modeled as branching edges in the data.
- No changes to `ConnectionTarget`, the warrant-on-arrow position model, or `getPointOnPolyline`.

## Decisions captured from brainstorm

| Question | Decision |
|---|---|
| Did I read Anna's diagrams correctly? | Yes — orthogonal segments, shared-trunk branching, perpendicular warrant attachment. |
| Trunks emergent or explicit? | **Emergent** — separate connections whose waypoints happen to align. |
| Default shape for a new connection? | **Z-shape** (two auto-bends), trunk on dominant axis. |
| How to reshape a connector? | **Drag segments**, perpendicular only. No corner-handle drag in v1. |
| Snap behavior? | **Snap-to-align** with other connections' parallel segments only (no grid snap). |
| Existing saved diagrams? | **Auto-convert** — single routing style; old data renders orthogonally on load. |

## Design

### 1. Schema change

In `src/types/connections.ts`:

```ts
export interface Connection {
  id: string;
  from: string;
  to: string | ConnectionTarget;
  type: ConnectionType;
  waypoints?: Point[];  // interior bend points only — endpoints computed at render
}
```

`Point` is `{ x: number; y: number }` — already used for element positions in `src/types/elements.ts`. Export it if it isn't already.

`waypoints` stores **interior bends only**. Empty/undefined means "use default Z-elbow." A connection with N waypoints has N+1 segments. `ConnectionTarget` is unchanged.

Save/load `SAVE_SCHEMA_VERSION` 1.3 → 1.4. The change is purely additive — loading 1.3 files is unmodified.

### 2. Default Z-elbow geometry (when `waypoints` is empty)

```
dx = targetCenter.x - sourceCenter.x
dy = targetCenter.y - sourceCenter.y

if (|dx| >= |dy|):              # horizontally dominant — vertical trunk
  midX = (sourceCenter.x + targetCenter.x) / 2
  virtualWaypoints = [
    { x: midX, y: sourceCenter.y },
    { x: midX, y: targetCenter.y },
  ]
else:                           # vertically dominant — horizontal trunk
  midY = (sourceCenter.y + targetCenter.y) / 2
  virtualWaypoints = [
    { x: sourceCenter.x, y: midY },
    { x: targetCenter.x, y: midY },
  ]
```

Virtual waypoints aren't persisted. They're recomputed each frame, so the elbow follows endpoint movement automatically. On the user's first segment-drag, the virtual waypoints are materialized into stored `waypoints` before the drag is applied.

### 3. Endpoint clipping (orthogonal)

Given the first/last interior waypoint and the source/target box, compute where the H or V segment meets the box's bounding rectangle:

- Segment horizontal & waypoint.x > center.x → exit at `(rightEdge, segmentY)`
- Segment horizontal & waypoint.x < center.x → exit at `(leftEdge, segmentY)`
- Segment vertical & waypoint.y > center.y → exit at `(segmentX, bottomEdge)`
- Segment vertical & waypoint.y < center.y → exit at `(segmentX, topEdge)`

Fallback: if `segmentY` (resp. `segmentX`) lies outside the box's vertical (resp. horizontal) extent, the exit migrates to the adjacent edge. In normal usage this only happens after the user drags a first/last segment; the default Z keeps everything within box bounds.

**Segment orientation inference.** A polyline segment is horizontal if its two endpoints share a y-coordinate, vertical if they share an x-coordinate. For interior segments (between two stored waypoints), this is read directly. For the **first** segment (source-edge → waypoints[0]) the orientation is *inferred from the second segment's orientation by alternation*: if waypoints[0] and waypoints[1] differ in y (segment[1] vertical) → segment[0] is horizontal. Same alternation logic for the **last** segment from waypoints[N-1]. Because every connection in v1 has either no waypoints (use default Z, both orientations known) or ≥2 waypoints (Z-shape and shapes derived from it via segment-drag), this inference is always defined. Single-waypoint L-shape connections only become possible if click-to-remove-bend is added later, at which point we'll need to store orientation explicitly.

**Ellipse shapes** (cloud-style "implicit" arguments, action-support ellipses, action teacher-support ellipses) clip to their **bounding rectangle**, not the ellipse silhouette. Orthogonal connectors look wrong terminating at a non-cardinal point of an ellipse; clipping to bounding rect is the convention in Lucidchart, Visio, draw.io. The visible gap reads as "the line meets the cloud's outer envelope."

### 4. Renderer rewrite (`src/components/Canvas/shapes/Arrow.tsx`)

**Remove:** `getStraightPath`, `getStraightPathToArrow`, `lineRectEdgePoint`, `lineEllipseEdgePoint`, `getEdgePoint`, `getShapeKind`. All ellipse-silhouette math goes.

**Add:**

- `getEffectiveWaypoints(conn, fromEl, toEl): Point[]` — returns `conn.waypoints` if non-empty, otherwise the virtual Z from §2.
- `clipOrthogonalEndpoint(el, neighborWaypoint): {x, y}` — implements §3.
- `getOrthogonalPath(fromEl, toEl, waypoints): {points: number[]}` — flattens `[fromExit, ...waypoints, toEntry]`.
- `getStraightAttachmentPath(fromEl, attachPoint): {points: number[]}` — for warrant-attachment connections (which stay straight in v1, see §5). The source-side endpoint clips to `fromEl`'s **bounding rectangle** (consistent with §3); the target-side endpoint is `attachPoint` exactly. Two-point polyline.

**Unchanged:**

- `getPointOnPolyline` — already handles N-point polylines via cumulative arc length. `ConnectionTarget.position` works without modification.
- The closest-point projection in `handleArrowClick` — already loops over polyline segments, so click-to-attach-warrant still finds the nearest segment.
- `ConnectionArrow` rendering structure — `<Line>` + arrowhead. The arrowhead's last-segment angle calculation already reads the last two points and works for an orthogonal final segment (it'll point cardinally).

**Warrant-on-arrow attachment connections remain straight single segments in v1.** Orthogonal routing applies only to element-to-element connections. The attachment line stays as today: a straight segment from the warrant box's edge (clipped to bounding rect) to the attachment point on the parent polyline, with no arrowhead. This matches how Anna's reference diagrams render attachments — short straight lines from a positioned warrant — and keeps the attachment math simple. Making attachment connections orthogonal as well is a future enhancement and explicitly out of scope here. Note that the **parent** connection (the data→claim arrow the warrant attaches to) is fully orthogonal under the new rules; only the attachment line itself stays straight.

### 5. Interaction model

**Hit-testing.** Each segment of the polyline is a separate hit region with `hitStrokeWidth: 20` (matching today's full-line region). Hovering a segment in non-connect-mode changes the cursor: `ns-resize` for horizontal, `ew-resize` for vertical.

**Segment drag — the only reshape gesture in v1.**

- Press-drag anywhere along a segment moves it perpendicular to itself. Horizontal segments slide on Y only; vertical segments slide on X only. The pointer is locked to one axis for the duration of the drag.
- The two waypoints at the segment's endpoints update with the drag; adjacent segments stretch.
- The **first** segment is special: only its waypoint endpoint is stored — the source box exit slides along the box edge as the segment moves perpendicular. Same for the last segment and target box.
- If a first/last segment slides past the box's edge extent, its exit migrates to the adjacent edge per §3 fallback.
- **First-drag of a virtual-Z connection** materializes the virtual waypoints into stored `waypoints` first, then applies the drag.

**Snap-to-align.** While dragging, on every pointer-move:

- Collect perpendicular-axis coordinates of every *other* connection's same-orientation segments in the diagram (vertical-segment x's when dragging vertical; horizontal-segment y's when dragging horizontal).
- If the dragged segment's coordinate is within **6px** of any candidate, snap to that coordinate.
- Render a thin dashed cyan alignment line at the snap coordinate while engaged; fade out on release.
- **Hold `Alt`** to suspend snap for the current drag (universal convention across diagram editors).

For a diagram with ~50 connections × ~3 segments worst case, the per-frame cost is negligible — no spatial index needed.

**No click-to-add-bend, no delete-bend in v1.** Z default + segment drag is enough to express trunks. Adding/removing mid-segment bends is deferred.

**Connect-mode unchanged.** Click source → click target creates a connection. New connection appears as Z-elbow. Click-to-attach-warrant on a segment also unchanged.

**Selection visual.** Selected connections render in `#4A90D9`; hover in `#FF6B6B`. No new visual chrome — cursor change carries the affordance.

**Undo/redo.** Segment drag = one undo entry per drag (mousedown → mouseup), matching existing element-drag behavior in the store. Snap engagement does *not* create extra undo entries.

### 6. Files affected

| File | Change |
|---|---|
| `src/types/connections.ts` | Add `waypoints?: Point[]` to `Connection`. Import or re-export `Point`. |
| `src/components/Canvas/shapes/Arrow.tsx` | Replace path-computation helpers per §4. Add per-segment hit regions, cursor handling, snap-to-align logic, drag handlers. Net: file shrinks (less ellipse math) but gains drag handlers. |
| `src/store/diagramStore.ts` | Add `updateConnectionWaypoints(id: string, waypoints: Point[])` action. Single store update on `mouseup`. |
| Wherever `SAVE_SCHEMA_VERSION` is defined and used | Bump constant to 1.4. |

**Snap-engagement state during drag** lives in transient React state inside the dragging `Arrow` component — not in the Zustand store. Only the final waypoints are committed to the store on `mouseup`. This avoids store thrash and keeps undo entries one-per-drag.

**Files explicitly NOT modified:**

- Shape components (`ArgumentShape`, `SupportShape`, `TeacherSupportShape`, `InfoBoxShape`, `EmbeddedImage`, `Legend`)
- `src/components/Properties/`, `src/components/Palette/`, `src/components/Toolbar/`
- Style-config code (`styleResolver`, `styleConfig.ts`, `SettingsModal`, etc.)
- `src/utils/diagramxExport.ts` — `.diagramx` export does not preserve our connection routing; nothing to change. (Plan should confirm with a read-pass.)

### 7. Migration

None required in code. `waypoints?` is genuinely optional; loading a 1.3 file produces connections without `waypoints`, which the renderer treats as empty and applies the default Z. Existing saved diagrams reflow on next open. Element positions are untouched.

## Risks & tradeoffs

- **Existing diagrams reflow on load.** This is the explicit point of the change — Anna's feedback is that the diagonals are wrong. Element positions stay; connectors change shape.
- **Cloud/ellipse line termination on bounding rect, not silhouette.** Small visible gap. Industry convention; consistent with every other orthogonal-routing editor. No bezier-intersection math.
- **Default Z direction is heuristic.** When `|dx| ≥ |dy|` guesses wrong for a given layout, one segment-drag rotates the Z. One drag, no menu.
- **`t`-along-polyline for warrant attachment shifts when the polyline reshapes.** Same behavior as today's straight-line `t`-parameter, just on a polyline. Worth flagging: warrants don't pin to a specific trunk segment, they pin to a fraction along the whole path.
- **`.diagramx` export drops waypoints.** Round-tripping through DiagramMix already loses our routing; documented in the plan.
- **Snap-to-align over-eagerness.** 6px threshold may snap to the wrong segment in dense diagrams. Mitigations: snap to closest candidate; render dashed line so the user sees what's happening; `Alt` suspends snap.
- **Hit-test overlap on shared trunks.** When two connections share a vertical segment, clicking the shared region selects whichever Konva renders last. Acceptable in v1.
- **First-segment slide past box extent.** Edge migrates to the adjacent box edge — visually a sudden jump. Edge case; user reverses the drag if unwanted.

## Testing plan

- `npm run typecheck` and `npm run lint` clean.
- Manual browser verification with Claude for Chrome on the dev server:
  - New connection appears as Z-elbow with trunk on dominant axis.
  - Drag the vertical trunk: trunk slides on x; both ends' adjacent segments stretch; source/target exits slide along box edges.
  - Two connections from same source: drag the second's vertical trunk near the first's — snap fires within 6px, dashed cyan alignment line shows. Release: both visibly share a single trunk.
  - Reproduce the IMG_3632 scene (video → two claims, warrant cloud attached perpendicular to trunk) and confirm it can be drawn matching Anna's sketch.
  - `Alt`-drag a segment: snap suspended, free perpendicular drag.
  - Move a source element: trunk x stays put, first segment lengthens/shortens, exit slides on box edge.
  - Warrant attached at `position: 0.5`: drag trunk; attachment follows. Multiple warrants at different positions on the same connection.
  - Connection from a cloud (implicit) into an action-support ellipse: line terminates on bounding-rect edges.
  - Load a saved 1.3 diagram: connectors render orthogonally, no errors, no migration prompt.
  - Save → reload: waypoints round-trip cleanly through JSON.
  - Save schema constant in saved file is `1.4`.

## Out of scope (queued separately)

- Click-to-insert-bend and remove-bend gestures (would also unlock 1-waypoint L-shapes, which need explicit orientation tracking — see §3).
- **Orthogonal warrant-attachment connection routing** — attachment lines stay straight in v1; making them orthogonal is its own design pass.
- Composite argument types (`dataclaim`, `warrantclaim`) — separate brainstorm pending.
- Sticky-group movement for support→argument associations — separate brainstorm pending.
- Image-to-JSON in-app import.
- Text-friendly implicit cloud shape.

## Open questions

None.
