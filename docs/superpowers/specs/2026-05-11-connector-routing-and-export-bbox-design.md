# Connector routing improvements + export bounding-box fix

**Date:** 2026-05-11
**Status:** Design approved, ready for implementation plan
**Origin:** Anna Conner feedback on diagram `4math-ava-day1-5741 (4).json`, relayed by Jennifer (2026-05-11):

> "the claims claim1, claim2, claim3, and claim4, she would have all of them connected to data 1 (the given) by horizontal lines indicating that each is its own line of reasoning, without building on or really being connected to the others. also, she would like the ability to maybe drag the join-points, like for data 2, she would like it to join in at the same vertical as dataclaim 2 and dataclaim 3, instead of to the left like that, because when there are vertical connectors to lines of reasoning, it implies they are warrants or rebuttals. and sometimes there needs to be vertical connectors anyway but she wants to be able to adjust them"

Plus a separately-flagged bug: "the PDF export only includes the objects that are currently visible on the canvas, but we really need it to cover all the objects."

## Problem

Two routing semantics in Anna's mental model are not honored by the current default Z-elbow router:

1. **Independent lines of reasoning from a single Given.** When one `data` element fans out to multiple `claim`s, each claim should read as an *independent* line of reasoning. Today, the default Z-elbow makes all such lines exit the source at `source.center.y`, then turn, producing a shared visual "spine" that reads as connection between the claims. Anna draws each as its own horizontal line at the target's y.

2. **Convergent reasoning into a single claim.** When multiple sources feed one claim with Z-elbow routes, their trunk x's differ, and the vertical segments of those trunks read as warrant/rebuttal attachments — because in Anna's notation, vertical connectors *do* indicate warrant/rebuttal. Specifically: Data 2 → Claim 5 in the example diagram routes through a vertical segment near Claim 5 that visually looks like a warrant attaching to the DC2/DC3 lines of reasoning.

A separate but related need:
3. **Manual adjustment of join points.** Segment-drag exists today (`Arrow.tsx:321`) but only adjusts interior bends, not where a line enters/exits a box. There's also no visual cue that segments are draggable.

And a separately-discovered export bug:
4. PDF and PNG export use `stage.toDataURL()` with no region argument, so they capture the visible Konva viewport only. Anything panned/zoomed off-screen is cropped. SVG export already does an element-bbox but doesn't include connection extents.

## Goals

- **Rule 1 (default):** For `data → claim` connections only, when the target's center y falls within the source's vertical extent (or center x within horizontal extent), route as a single straight segment instead of a Z. Each Given→claim becomes its own visible horizontal line.
- **Rule 2 (default):** When 2+ connections converge on the same target with Z-elbow routing, align their trunk x's into a shared column placed "closer to sources but not extreme," and spread their entry points evenly along the target's edge so arrows don't overlap.
- **Edge-anchor handles (manual):** Draggable handles at each connection's entry and exit, sliding along the box's edge. Persisted as `{edge, t}` so they follow the box when it moves or resizes.
- **Segment-midpoint handles (discoverability):** Small open circles at each segment's midpoint when a connection is hovered or selected, so users see that segments are draggable. Behavior identical to the existing segment drag.
- **Export bounding-box fix:** PDF, PNG, and SVG export the full content bbox (elements + connection extents) with a margin, regardless of canvas pan/zoom.

## Non-goals

- Changing routing for non-`data→claim` element pairs. Rule 1 is scoped narrowly to match Anna's semantics; `claim → claim`, `support → claim`, etc. keep their current Z-elbow.
- Warrant/rebuttal attachment connectors. Those use a separate path (`getVerticalAttachmentPath`) and are unchanged. Edge-anchor handles do not apply to attachments.
- Crossing-segment avoidance / "smart" routing beyond Rule 1 + Rule 2. If sources are at very different y's, the shared trunk forces long vertical runs — acceptable; user can drag.
- Multi-page PDF for very large diagrams. Single page sized to content.
- A styleConfig knob for the `0.3` trunk-position constant. Hardcoded for now; we can expose it later if Anna asks.
- New keyboard shortcuts. All affordances are mouse/touch.
- Reset-anchor UI beyond a right-click context menu item. No persistent toolbar button.

## Design

### Architecture

**Touch points:**

- `src/utils/orthogonalRouting.ts` — add a new top-level function that wraps the existing default-Z logic with Rule 1 + Rule 2 awareness. Existing pure helpers (`computeDefaultZWaypoints`, `clipOrthogonalEndpoint`, etc.) unchanged.
- `src/types/connections.ts` — extend `Connection` with optional `fromAnchor?: EdgeAnchor` and `toAnchor?: EdgeAnchor`.
- `src/components/Canvas/shapes/Arrow.tsx` — render new handles, wire up new drag interactions. Existing segment drag preserved.
- `src/utils/pdfExport.ts`, `src/components/Toolbar/Toolbar.tsx` (PNG handler), `src/utils/svgExport.ts` — switch to content-bbox export.
- New `src/utils/exportBounds.ts` — shared helper for computing the export bbox from elements + connections.

**Schema additions** (in `src/types/connections.ts`):

```ts
export type BoxEdge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeAnchor {
  edge: BoxEdge;
  t: number;   // 0..1, fraction along the edge from top-left
}

export interface Connection {
  id: string;
  from: string;
  to: string | ConnectionTarget;
  type: ConnectionType;
  waypoints?: Position[];
  fromAnchor?: EdgeAnchor;  // NEW — overrides clipOrthogonalEndpoint for source side
  toAnchor?: EdgeAnchor;    // NEW — overrides clipOrthogonalEndpoint for target side
}
```

Old saved diagrams without `fromAnchor`/`toAnchor` render unchanged.

### Rule 1: straight line for `data → claim` when target in source extent

**Condition** (all must hold; otherwise fall through):

1. `fromEl.argumentType === 'data' && toEl.argumentType === 'claim'`
2. `connection.waypoints` is empty/undefined AND `connection.fromAnchor`/`toAnchor` are undefined
3. Either:
   - Horizontal: `toEl.center.y ∈ [fromEl.top, fromEl.bottom]` AND target is fully to one side (`toEl.left ≥ fromEl.right` OR `toEl.right ≤ fromEl.left`)
   - Vertical (symmetric, rare): `toEl.center.x ∈ [fromEl.left, fromEl.right]` AND target fully above/below

**Effect:**

- Horizontal: single 2-point line from `(fromEl.{right|left}, toEl.center.y)` to `(toEl.{left|right}, toEl.center.y)`.
- Vertical: single 2-point line from `(toEl.center.x, fromEl.{bottom|top})` to `(toEl.center.x, toEl.{top|bottom})`.

**Edge cases:**

- Inclusive on extent boundaries (`toEl.center.y == fromEl.top` counts as inside).
- Source and target overlapping in x (boxes intersect): fall through, default Z.
- Multiple `data→claim` lines from the same source at exactly the same `toEl.center.y` would overlap; user can override via edge anchor.

### Rule 2: auto-aligned trunks + spread entries on convergent targets

**Trigger:** A target element has 2+ incoming connections whose default routing would use a vertical-trunk Z (H-V-H, i.e. `|dx| >= |dy|`), none have stored `waypoints`/anchors, none match Rule 1. Symmetric for horizontal-trunk Z (V-H-V).

**Step A — shared trunk coordinate.** Group siblings by approach side relative to target. A source is on target's *left* side if `source.center.x < target.center.x` (and on *right* side otherwise). Same for above/below. Within each group, for left-side sources:

```
maxSourceRight = max over left-side siblings of source.right
trunkX = maxSourceRight + 0.3 * (target.left - maxSourceRight)
trunkX = clamp(trunkX, maxSourceRight + 20, target.left - 20)
```

Symmetric formulas for right-side, above-side, and below-side groups. Each group gets its own shared trunk. The `0.3` and `20px` clamp are hardcoded constants — tweakable later.

**Step B — spread entry points along target's edge.**

For N convergent connections entering the same edge of `target` (e.g., the left edge), assign entry t values:

```
entry_i.t = (i + 1) / (N + 1)   // for i = 0..N-1, t in (0, 1)
```

Sort assignment order: ascending by `source.center.y` (top-most source gets the top-most entry t) so lines don't cross. For N=3, entry t's are `0.25, 0.5, 0.75` of the target's edge length. The actual y on the left edge = `target.top + t * target.height`.

These spread entries are *computed at render time*, not stored. The user opts out for a specific connection by setting `toAnchor` (manual drag of the entry handle).

**Override hierarchy** (highest to lowest):

1. Stored `waypoints` — use as-is.
2. Stored `fromAnchor` / `toAnchor` — respect for endpoints; auto-compute the middle (Z elbow respecting anchors).
3. Rule 1 — straight line.
4. Rule 2 — aligned trunk + spread entries.
5. Default Z-elbow.

**Edge cases:**

- N=1 (no convergence): Rule 2 doesn't fire; default Z.
- Mixed: some siblings have stored waypoints, some don't. Only count "auto-routed" siblings (no waypoints, no Rule 1 match) toward the convergent set; respect manually-routed siblings as-is. Spread entries among auto-routed only.
- Target with > 6 incoming auto-routed connections: still spread, but entries get very close together. Acceptable for v1.
- Geometric degeneracy (source.right > target.left, i.e., source is to the right of target): use the symmetric formula. Both clamps still apply.

### Edge-anchor handles

**Visual:** when a connection is selected, render small filled circles (radius ~5px) at the resolved entry and exit points. On hover, cursor changes to `ns-resize` (top/bottom edges) or `ew-resize` (left/right edges).

**Drag:** constrained to the edge the handle sits on. On `mouseup`, the new `(edge, t)` is stored as `fromAnchor` or `toAnchor` via a new store action `updateConnectionAnchor(connId, end: 'from'|'to', anchor: EdgeAnchor)`.

**Resolution to coordinates** (in routing code, replacing/supplementing `clipOrthogonalEndpoint` when an anchor is present):

```ts
function resolveAnchor(el: DiagramElement, anchor: EdgeAnchor): Position {
  switch (anchor.edge) {
    case 'left':   return { x: el.position.x,                   y: el.position.y + anchor.t * el.size.height };
    case 'right':  return { x: el.position.x + el.size.width,   y: el.position.y + anchor.t * el.size.height };
    case 'top':    return { x: el.position.x + anchor.t * el.size.width, y: el.position.y };
    case 'bottom': return { x: el.position.x + anchor.t * el.size.width, y: el.position.y + el.size.height };
  }
}
```

**Snap-on-drag:** reuse the existing snap infrastructure — anchors snap to other connections' anchors on the same edge of the same box within `SNAP_THRESHOLD_PX`; alt suspends snap.

**Facing-edges-only constraint (v1):** an anchor on `from`'s `left` edge is only legal if `to` is to the left of `from`; an anchor on `from`'s `right` edge only if `to` is to the right; etc. While dragging, if the user pulls toward a non-facing edge, the handle clamps and won't jump edges. This prevents accidental wrap-around routing. Revisit if Anna wants more freedom.

**Reset:** right-click the handle → context menu "Reset anchor" → clears just that endpoint's anchor.

**Interaction with Rule 1:** if `toAnchor` is set on a `data→claim` connection that would otherwise match Rule 1, Rule 1 still applies *if* the anchor is geometrically compatible (anchor sits on the facing edge at a y that matches a straight line). Otherwise the line falls back to a Z that respects the anchor.

### Segment-midpoint handles (discoverability)

Pure UI. When a connection is hovered OR selected, render a small open circle (radius ~5px, white fill, dark stroke 1.5px) at the midpoint of each interior draggable segment.

- Dragging the dot is identical to dragging the segment itself (same `handleSegmentDragStart` handler).
- Cursor on dot matches the segment orientation.
- Hidden when `connectModeActive` is true.
- Hidden for warrant/rebuttal attachment connections (they use a different path computation; segment dragging isn't supported for them in v1).

### Export bounding-box fix

**New helper** (`src/utils/exportBounds.ts`):

```ts
export interface ExportBounds { x: number; y: number; width: number; height: number; }

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
  // Also include rendered connection points in case manually-routed waypoints extend beyond element extents.
  for (const conn of connections) {
    const pts = getRenderedPoints(conn, elements, connections); // uses existing routing functions
    if (!pts) continue;
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]);     maxX = Math.max(maxX, pts[i]);
      minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 200, height: 200 }; // empty diagram fallback
  return {
    x: minX - margin,
    y: minY - margin,
    width:  (maxX - minX) + margin * 2,
    height: (maxY - minY) + margin * 2,
  };
}
```

**PDF/PNG (`pdfExport.ts`, `Toolbar.tsx` PNG handler):**

```ts
const bounds = computeExportBounds(elements, connections);
const dataURL = stage.toDataURL({
  x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  pixelRatio: 2, mimeType: 'image/png',
});
// jsPDF format uses bounds.width / bounds.height instead of stage.width()/height()
```

Konva's `stage.toDataURL({x, y, width, height})` renders the requested rectangle of stage coordinates regardless of current pan/zoom — so off-screen content is captured.

**SVG (`svgExport.ts`):** the existing bbox logic (lines 35-40) is extended to also visit `getRenderedPoints` for each connection. Same `computeExportBounds` helper used.

## Testing

**Unit tests** (`src/utils/orthogonalRouting.test.ts`):

- Rule 1 horizontal case: data→claim with target.y in source extent → 2-point straight line at target.center.y.
- Rule 1 vertical case: symmetric.
- Rule 1 non-applicable: target.y outside extent → falls through to default Z.
- Rule 1 non-applicable: source/target overlap on x → falls through.
- Rule 1 non-applicable: source.argumentType !== 'data' → falls through.
- Rule 2: trunkX heuristic for 3 sources at varying x's → all three connections share the computed trunkX.
- Rule 2: spread entries for N=2/3/4 → t values at `(i+1)/(N+1)`, sorted by source.center.y.
- Rule 2: mixed manual + auto siblings — only auto siblings counted in the spread.
- Override hierarchy: waypoints win over Rule 1; Rule 1 wins over Rule 2; both win over default Z.
- Anchor resolution: `resolveAnchor` returns correct Position for each edge.
- Anchor + Rule 1 compatibility: matching anchor → straight line; mismatched anchor → Z.

**Export bounds tests** (`src/utils/exportBounds.test.ts`):

- Empty diagram → `{ 0, 0, 200, 200 }` fallback.
- Elements only → bbox covers all elements + margin.
- Elements + connections with waypoints extending beyond element bbox → bbox expands to cover.
- Single element → bbox is element + margin on all sides.

**Visual smoke tests** (manual, Claude for Chrome):

- Load `4math-ava-day1-5741 (4).json` and verify:
  - Given → Claim 1, DC2, DC3, Claim 4 each render as a single horizontal line at the claim's y.
  - DC2/DC3/Data 2 → Claim 5 share a single trunk column, enter at 25%/50%/75% of Claim 5's left edge.
  - Selecting a connection shows midpoint dots + endpoint handles.
  - Dragging an endpoint handle along an edge stores the anchor; reload preserves it.
  - Right-click → Reset anchor returns to auto routing.
- Existing diagrams: confirm `claim → claim` and other non-`data→claim` connections render the same as before.
- Pan canvas so part of the diagram is off-screen → export PDF/PNG → verify nothing cropped.
- Export SVG → verify connection extents respected.

**Regression guards:**

- Existing `diagramStore.test.ts` and `orthogonalRouting.test.ts` cases remain green.
- Manual: drag a segment, save, reload — waypoints respected (existing behavior).

## Open questions / future work

- Should Rule 1's restriction to `data→claim` be relaxed for `dataclaim` source elements? (`DataClaim` is `argumentType==='claim'` today, so it wouldn't match as a source. Anna may want DataClaims to also fan out independent claims.) Flag for follow-up after Anna sees v1.
- Trunk-position constant `0.3` and clamp `20px` — likely to be tuned after Anna reviews. Could be styleConfig-driven later.
- Allow non-facing-edge anchors (wrap-around routing). Currently clamped to facing edges; revisit if requested.
- Reset-anchor UX — right-click context menu only in v1. Could add a toolbar button or keyboard shortcut later.
- Auto-spread *all* convergent entries vs. only when 3+ connections converge — v1 spreads even for N=2. May feel odd if N=2 lines look "spread apart" when they could share `t=0.5`. Revisit after seeing it.

## Files affected (summary)

- New: `src/utils/exportBounds.ts`, `src/utils/exportBounds.test.ts`
- Modified: `src/utils/orthogonalRouting.ts`, `src/utils/orthogonalRouting.test.ts`
- Modified: `src/types/connections.ts` (schema additions — `EdgeAnchor`, optional `fromAnchor`/`toAnchor`)
- Modified: `src/utils/schema.ts` (runtime validator accepts the new optional fields; older saved diagrams continue to load)
- Modified: `src/components/Canvas/shapes/Arrow.tsx` (handles, anchor drag)
- Modified: `src/store/diagramStore.ts` (new `updateConnectionAnchor` action)
- Modified: `src/utils/pdfExport.ts` (use bounds)
- Modified: `src/components/Toolbar/Toolbar.tsx` (PNG handler uses bounds)
- Modified: `src/utils/svgExport.ts` (use bounds; include connection points)
