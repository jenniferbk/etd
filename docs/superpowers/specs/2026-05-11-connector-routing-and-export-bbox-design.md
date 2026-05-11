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

Symmetric formulas for right-side, above-side, and below-side groups. Each group gets its own shared trunk. The `0.3` and `20px` clamp are hardcoded constants — tweakable later. **Tiebreak for ambiguous side membership:** if `source.center.x == target.center.x` (within 1px), this connection is excluded from Rule 2 grouping and falls through to default Z; Rule 2 only applies when sources are clearly left/right (or clearly above/below) of the target.

**Rationale for `0.3`:** placing the trunk 30% of the way from sources to target keeps the trunk visually associated with the sources (so the eye reads each connection as originating from its source, not from a shared rail near the target) while leaving room between the trunk and the target for the horizontal entry segments to be visible. Empirically tested against the Ava diagram; tunable later. Not exposed in styleConfig in v1 to avoid coupling to user-facing settings before Anna sees it.

**Step B — spread entry points along target's edge.**

For N convergent auto-routed connections entering the same edge of `target`:

- **N=2:** skip spread. Both connections enter at `t = 0.5` (target.center.y on a vertical edge). The lines overlap exactly at the endpoint — acceptable for two lines and visually quieter than forcing them apart by ~33% of the box.
- **N ≥ 3:** assign `entry_i.t = (i + 1) / (N + 1)` for `i = 0..N-1` (so N=3 → 0.25, 0.5, 0.75). The actual y on a left edge = `target.top + t * target.height`.

Sort assignment order: ascending by `source.center.y` (top-most source gets the top-most entry t) so lines don't cross. The spread is recomputed at render time from the current siblings; it is not stored on connections. A user dragging one connection's segment (creating stored waypoints) removes it from the auto-routed set and the remaining siblings re-spread — this is the intended behavior (when the user pins one, the others rearrange to share the remaining slots). Re-spread happens on the next render after the drag commits (`mouseup`), not on every drag tick, so there is no flicker.

These spread entries are *computed at render time*, not stored. The user opts out for a specific connection by setting `toAnchor` (manual drag of the entry handle).

**Override hierarchy.** *Manual data always wins for the part it specifies; auto-rules apply only to parts the user hasn't touched.* Concretely:

- If `connection.waypoints` is present and non-empty → render exactly those waypoints; Rule 1 and Rule 2 do not apply to this connection.
- If `connection.fromAnchor` and/or `toAnchor` is present → the endpoint is locked to the resolved anchor coordinate. The middle is computed as a Z that respects the anchor(s). Rule 1 does *not* apply to this connection (since at least one endpoint is manually fixed). Rule 2 still runs for the other auto-routed siblings, but this connection's anchored endpoint is excluded from the auto-spread (the user said where it should go).
- Otherwise → try Rule 1; if it matches, render straight line. If not, try Rule 2 (in the context of this target's auto-routed siblings); if 2+ siblings convergent, apply aligned-trunk + (for N≥3) spread entries. Otherwise default Z-elbow.

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

**Reset:** when a connection is selected and an anchor handle is hovered, a small grey "×" badge (~10×10px) appears just outside the handle. Clicking the × clears that endpoint's anchor and reverts to auto-resolved entry/exit. Properties Panel for the selected connection also gets a "Reset routing" button that clears both anchors AND `waypoints` in one action (a full revert to auto). No right-click context menu — discoverability on Konva canvas is poor for right-click since no other affordance uses it.

**Interaction with Rule 1:** if any anchor is set on a connection, Rule 1 does not fire — the connection renders as a Z that respects the anchor(s). This is the simpler "manual wins" contract; Anna can always clear the anchor to get Rule 1 back.

**Anchor lifecycle:**

- **Source/target box moved:** anchors persist as `(edge, t)` and re-resolve to new absolute coordinates next render. Nothing to do — `t` is a fraction of the (current) edge length.
- **Source/target box resized:** `t` is preserved. If a resize would put the resolved coordinate outside an obviously sensible range, no clamp is applied — `t` is already in `[0, 1]`, so the resolved point is by definition on the edge. (User-visible effect: if a tall box is resized to be much shorter, the absolute y of the anchor scales with the box, which is what they'd expect.)
- **Connection rebound to a different element via "edit connection" UI:** anchor for the rebound endpoint is discarded. The other endpoint's anchor is preserved.
- **Source or target element deleted:** the connection is deleted (existing behavior); anchors go with it.
- **Anchor edge becomes non-facing due to box movement** (e.g., user moves target to the left of source, but `to.toAnchor.edge === 'left'`): anchor is preserved on the same edge; the resulting route may wrap around. This is graceful degradation — the user can drag the handle to a now-facing edge or click × to reset.

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

**Perf note:** `computeExportBounds` iterates `elements + connections` once and visits each connection's rendered points (also bounded by element count). For a 200-element diagram with ~150 connections it runs in well under 10ms — no spinner needed. Smoke-tested as part of the test plan below.

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

### Contributor dropdown bug (bundled fix)

Found separately during this session: Anna's diagrams have warrants and supports whose contributor needs to flip to `teacher`, but the Properties Panel has no way to do that.

**Bug 1 — `PropertiesPanel.tsx:10-15`.** `CONTRIBUTOR_TYPES` lists `given, student, joint, implicit` and omits `teacher`, even though `'teacher'` is a valid `ContributorType` (`elements.ts:11-16`). Argument elements (warrants, claims, etc.) set to any of the other values cannot be returned to teacher through the UI.

Fix: add `{ value: 'teacher', label: 'Teacher' }` to `CONTRIBUTOR_TYPES`. Ordering: place between `given` and `student` so it reads in the conceptual order (Given → Teacher → Student → Joint → Implicit).

**Bug 2 — `PropertiesPanel.tsx:233-326`.** The support-element branch renders Type / Subtype / Associated-with / Convert dropdowns, but no contributor selector at all. Once a support is created via the Palette, its contributor (`'teacher' | 'student'`) is locked.

Fix: add a contributor dropdown in the support branch, populated from a new `SUPPORT_CONTRIBUTOR_TYPES = [{ value: 'teacher', label: 'Teacher' }, { value: 'student', label: 'Student' }]`. Bind to `selectedElement.contributor`; on change, call `updateElement(selectedElement.id, { contributor: e.target.value as SupportContributor })`. Visible for `SupportElement` but **not** for `TeacherSupportElement` (legacy element type without a `contributor` field — see `TeacherSupportShape.tsx:33`; treat as already-teacher).

**Side effects to verify:**

- `getSupportColors(supportType, contributor)` in `colors.ts:45` already differentiates teacher vs. student borders. Flipping contributor will re-render with the correct color.
- Legend (`Legend.tsx:44`) filters by contributor; changing one element's contributor moves the count from one legend bucket to another. No fix needed.
- Save → reload roundtrip: existing schema accepts both values; nothing to update.

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
- Perf smoke: 200 elements + 150 connections → `computeExportBounds` returns in under 50ms (loose bound — should be ~5ms on modern hardware).

**Contributor dropdown tests** (manual, since it's a UI change):

- Select a warrant; cycle contributor through every value in `CONTRIBUTOR_TYPES` including `teacher`; verify rendering color updates correctly each time.
- Select a support; verify a Contributor dropdown appears with `Teacher` and `Student`; switch between values; verify color/border updates.
- Select a `TeacherSupportElement` (legacy); verify no contributor dropdown appears (legacy element treated as fixed-teacher).
- Save → reload → contributor changes persist.

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
- Modified: `src/components/Properties/PropertiesPanel.tsx` (add `teacher` to `CONTRIBUTOR_TYPES`; add contributor dropdown for `SupportElement`; "Reset routing" button for selected connections)
