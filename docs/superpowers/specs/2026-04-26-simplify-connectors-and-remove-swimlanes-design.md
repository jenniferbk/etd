# Simplify Connectors & Remove Swimlanes — Design

**Date:** 2026-04-26
**Status:** Design approved; pending spec review before plan-writing.

## Background

Researcher feedback (Anna Conner) flagged two related layout problems in the ETD canvas:

1. The **auto-routing connector logic** — orthogonal Z/L-shape paths with edge selection and lane-aligned routing in `src/components/Canvas/shapes/Arrow.tsx` — produces unpredictable arrow shapes that users can't anticipate. The behavior is "really rough."
2. The **swimlane snap** — six horizontal lanes at 150px spacing with 40px snap-on-drag-end in `src/components/Canvas/Canvas.tsx` — forces elements into rows that don't reflect how researchers actually want to lay out diagrams.

Both behaviors will be removed and replaced with the simplest predictable thing that works.

A separate constraint: warrants (and any element) must still be able to attach to a *connection*, not just to another element. The data model already supports this (`ConnectionTarget = { connectionId, position: 0-1 }` in `src/types/connections.ts`); the work here must preserve that capability.

## Goals

- Replace orthogonal connector routing with straight, edge-to-edge diagonal lines.
- Compute line endpoints by intersecting with each shape's actual silhouette: rectangle for argument/info-box/non-action support shapes; ellipse for action support shapes and the underlying ellipse of cloud "implicit" argument shapes.
- Remove all swimlane code and visualization. Drag becomes pixel-precise and fully free.
- Preserve waypoint-on-arrow attachment unchanged. Each warrant attaches at its own `position` along its parent connection; multiple warrants on one connection means multiple separate attachment connections at different positions.

## Non-goals

- No snap-to-grid or alignment guides (deferred; may revisit later as a smart-guides feature).
- No changes to the `Connection` / `ConnectionTarget` data model.
- No changes to connect-mode UX (click-to-attach behavior stays).
- No changes to element shapes, contributor coloring, save/load schema, or `.diagramx` export.
- No migration of existing saved diagrams. Absolute positions are preserved as-is.

## Design

### 1. Connector rendering

In `src/components/Canvas/shapes/Arrow.tsx`, replace `getOrthogonalPath` and `getOrthogonalPathToArrow` with straight-line equivalents (one `getStraightPath` for element-to-element; one `getStraightPathToArrow` for arrow-attachment, or a unified function — implementation detail for the plan).

**Endpoint computation:**

- Compute the straight line from source center to target center (or to the attachment point, for arrow-attachment connections).
- Clip each endpoint to the shape's silhouette:
  - **Rectangle** (argument shapes for non-implicit contributors, info boxes, non-action support shapes): line-rectangle (axis-aligned bounding box) intersection. Rounded corners on argument shapes are negligible at typical diagram scales and will be approximated as right angles.
  - **Ellipse** (action support shapes, and the underlying ellipse for cloud "implicit" argument shapes): closed-form line-ellipse intersection. The cloud bezier bumps are ignored — the line terminates on the underlying ellipse. This is visually clean and avoids bezier intersection math.
- Draw the arrowhead at the target endpoint (same triangle geometry as today).

**Shape detection:**

A small helper, e.g. `getShapeKind(el): 'rect' | 'ellipse'`, picks the silhouette to clip against, mirroring the rendering logic:

- `isArgumentElement(el) && el.contributor === 'implicit'` → `ellipse`
- `isSupportElement(el) && el.supportType === 'action'` → `ellipse`
- `isTeacherSupportElement(el) && el.supportType === 'action'` → `ellipse` (deprecated path, but rendered today and must stay correct)
- everything else → `rect`

**Arrow-attachment connections:**

When `connection.to` is a `ConnectionTarget`, the parent connection's path is resolved recursively (each parent now being a straight 2-point segment between two clipped endpoints). The attachment point at `position` along that segment is computed using the existing `getPointOnPolyline`. The line from the attached element's clipped edge to the attachment point is straight, with no arrowhead — same terminal dot used today (`Arrow.tsx:408-415`).

### 2. Swimlane removal

In `src/components/Canvas/Canvas.tsx`, delete:

- The `LANE_CONFIG` constant (around lines 22-27).
- `getLanePositions()` (around lines 30-37).
- `snapToLane()` (around lines 39-52).
- The `snapToLane` call in the drag-end handler (around line 401).
- The lane-line `<Line>` rendering inside the drag-overlay block (around lines 673-680). If removing this leaves an empty `isDragging` conditional, remove that conditional too.

Drag becomes fully free. No grid, no snap, no visual guides.

### 3. Waypoint behavior

Unchanged. The `Connection` and `ConnectionTarget` types stay as-is. `getPointOnPolyline` works on any polyline including a single 2-point segment. `handleArrowClick` (Arrow.tsx:281-334) does closest-point projection onto the polyline, which works identically on a 2-point polyline.

Visual: the existing terminal dot for attachment connections and the hover indicator in connect mode remain unchanged.

### 4. Migration

None required. Saved diagrams have absolute positions; once `snapToLane` is gone, elements simply remain wherever they were saved. Schema unchanged. Save/load unchanged.

## Files affected

- `src/components/Canvas/shapes/Arrow.tsx` — rewrite the path-computation functions; the `ConnectionArrow` component itself is essentially unchanged (it consumes `pathPoints` from the helper).
- `src/components/Canvas/Canvas.tsx` — delete lane config, helpers, snap call, and lane-line rendering.

No changes expected in:

- `src/types/connections.ts`, `src/types/elements.ts`
- `src/store/diagramStore.ts`
- `src/App.tsx`, `src/components/Toolbar/Toolbar.tsx`
- Shape components: `ArgumentShape.tsx`, `SupportShape.tsx`, `TeacherSupportShape.tsx`, `InfoBoxShape.tsx`, `EmbeddedImage.tsx`
- `src/utils/diagramxExport.ts` (the `.diagramx` export does not preserve the orthogonal routing anyway)

## Risks & tradeoffs

- **Visual regression on existing diagrams.** Diagrams that relied on the orthogonal routing — for example, a tall data box on the left routing horizontally to a claim at the same Y level on the right — will now show a diagonal line instead. This is the explicit tradeoff being accepted: predictability over apparent neatness.
- **Lines crossing through unrelated elements.** Straight diagonals can pass through boxes that sit between source and target. Users mitigate by repositioning. A future smart-routing or smart-guide feature could revisit this.
- **Cloud silhouette approximation.** Lines terminate on the underlying ellipse, not the bumpy outline. Visually fine for clouds whose bumps are small relative to the ellipse; could look slightly off for clouds where bumps protrude noticeably. Acceptable tradeoff; bezier intersection is not worth implementing here.
- **Rounded-corner approximation on argument shapes.** Endpoint may sit a few pixels outside the rendered rounded corner. Imperceptible at typical diagram scales.

## Testing approach

- Manual browser verification with Claude for Chrome (per `CLAUDE.md`):
  - Element-to-element straight line, all four directional quadrants (NE/NW/SE/SW).
  - Element-to-element line crossing a third element (confirm we accept this tradeoff visually).
  - Line into and out of a cloud "implicit" argument element.
  - Line into and out of an action support element (ellipse).
  - Warrant attached to a data→claim connection at varying `position` values along the segment; drag the data and claim and confirm the warrant's attachment point and incoming arrow stay sensible.
  - Multiple warrants attached to the same connection at different `position` values.
  - Drag with no snap; confirm pixel-precise placement and no lane-line visualization on drag.
  - Load an existing pre-existing JSON diagram; confirm element positions are preserved and no migration prompts appear.
- Type-check: `npm run typecheck`.
- Lint: `npm run lint`.

## Out of scope (queued as separate sub-projects)

1. **Transcript persistence completeness + per-line dismissed state** — covers (a) autosave dropping the transcript, (b) panel not auto-opening when a transcript is present, (c) `.drawing` import path not threading the transcript arg, and (d) explicit `dismissed` flag on `TranscriptLine` with schema bump 1.1 → 1.2 and a distinct visual state from "used."
2. **Configurable support types** — deferred work, prior brainstorm captured in memory.
3. **UI bug review** — researcher's list of disallowed actions that should be allowed.

## Open questions

None.
