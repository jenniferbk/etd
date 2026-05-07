# Support → argument linking with cluster halo and sticky-group movement

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation plan
**Origin:** Anna's 2026-04-27 + 2026-05-05 feedback queue (item 4) — researchers need explicit links from support elements to their associated arguments so downstream analysis can answer "which teacher questions prompted Claim X?" Today the relationship is purely spatial.

## Problem

Today, support elements (teacher questions / actions / other) carry no data-model link to the argument elements they relate to. Researchers position them adjacent to or overlapping arguments (REQUIREMENTS.md §3.3); the relationship lives only in the visual layout. Downstream JSON exports cannot answer "which supports relate to this claim" without re-running spatial inference, which is brittle.

Anna also asked that clusters move as a unit — once a support is associated with an argument, dragging the argument should bring the support along.

## Goals

- Add an explicit, optional `associatedWith` field to `SupportElement` for the analytical link.
- Auto-suggest the link when the user drops a support onto an argument's cluster — workflows don't change for the common case.
- Visual cluster halo so users (and analyses) can see which elements form a unit.
- Sticky-group movement: dragging an argument moves its whole cluster.
- Cluster definition supports overlap chains: support_A overlaps argument_1, support_B overlaps support_A → support_B is in argument_1's cluster transitively.

## Non-goals

- Multi-target supports. `associatedWith` is a single id (`string`), not `string[]`. If researchers find this limiting, expand later.
- Auto-clearing the link when a support is dragged out of overlap. The field is authoritative — moving a support around the canvas does not silently re-bind it. Users edit the Properties panel dropdown to change the link.
- Migration of legacy `TeacherSupportElement` (already deprecated). New field lives on `SupportElement` only.
- Halo animations. Halos appear and disappear instantly on selection / drag-state change.
- Persisted cluster IDs. Clusters are computed on demand from spatial overlap; no second source of truth.
- Super-clusters that span multiple arguments. Argument boundaries act as walls in cluster traversal — see "Cluster computation" below.

## Design

### Schema

`src/types/elements.ts`:

```ts
export interface SupportElement extends BaseElement {
  type: 'support';
  contributor: SupportContributor;
  supportType: SupportType;
  subtype?: SupportSubtype;
  associatedWith?: string;   // NEW: argument element id, if linked
}
```

Optional. JSON loaders ignore unknown fields (verify in implementation), so old export files continue to load and new exports load cleanly into older builds (without the link).

### Cluster computation

New module `src/utils/clusters.ts`:

```ts
export interface Cluster {
  argument: ArgumentElement;
  supports: SupportElement[];
}

export function bboxesOverlap(a: BaseElement, b: BaseElement): boolean;
export function computeCluster(elements: DiagramElement[], argumentId: string): Cluster | null;
```

Both pure functions.

`bboxesOverlap` is standard axis-aligned rectangle intersection on `position` + `size`. Edge-touching (zero-area shared boundary) counts as **no overlap** — only positive overlap area triggers the cluster.

`computeCluster` algorithm (BFS over the overlap graph, with walls at non-anchor arguments):

```
Find anchor = elements.find(e => e.id === argumentId && e.type === 'argument').
If anchor is null, return null.

visited = new Set([anchor.id])
queue = [anchor]
supports: SupportElement[] = []

while (queue.length > 0):
  current = queue.shift()
  for each candidate in elements:
    if visited.has(candidate.id): continue
    if !bboxesOverlap(current, candidate): continue
    if candidate.type === 'argument' && candidate.id !== anchor.id:
      continue                     // argument boundaries are walls
    visited.add(candidate.id)
    if isSupportElement(candidate):
      supports.push(candidate)
      queue.push(candidate)
    // (Other element types — e.g. infoBox — are ignored. Only supports
    //  count as cluster members; only supports are walked from.)

return { argument: anchor, supports }
```

The "walls" rule means a support overlapping two arguments appears in *both* arguments' independently-computed clusters; the two arguments do not merge into a super-cluster.

Cost is bounded by the cluster's element count squared in the worst case (BFS step inspects every other element). Diagrams have on the order of tens of elements, so the cost is trivial; no memoization in v1.

### When `computeCluster` is called

- **On selection.** When an argument or support is selected, identify its argument (the support's `associatedWith` if present, or any argument it currently overlaps via the cluster algorithm) and compute that cluster to render the select-mode halo.
- **During support drag.** On each `dragmove`, find argument candidates whose clusters the dragged support's bbox overlaps, compute those clusters, render drag-mode halos.
- **At argument `dragstart`.** Compute the cluster once and cache it (plus each member's start position) for the duration of the drag. Do not recompute mid-drag — supports popping in/out as the argument moves would be jarring and break the "this is the unit you grabbed" intuition.
- **At support `dragend`.** Compute the set of arguments whose clusters the support's current bbox overlaps, drive auto-suggest of `associatedWith`.

### Halo rendering

New component (file location: `src/components/Canvas/shapes/ClusterHalo.tsx`):

```tsx
function ClusterHalo({ cluster, mode }: { cluster: Cluster; mode: 'drag' | 'select' }) {
  const bbox = unionBbox([cluster.argument, ...cluster.supports]);
  const PAD = 8;
  return (
    <Rect
      x={bbox.x - PAD}
      y={bbox.y - PAD}
      width={bbox.width + 2 * PAD}
      height={bbox.height + 2 * PAD}
      cornerRadius={12}
      fill={mode === 'drag' ? 'rgba(74, 144, 217, 0.10)' : 'rgba(74, 144, 217, 0.06)'}
      stroke="#4A90D9"
      strokeWidth={mode === 'drag' ? 2 : 1.5}
      dash={mode === 'select' ? [6, 4] : undefined}
      listening={false}
    />
  );
}
```

`unionBbox` is a small helper (define alongside `ClusterHalo` or in `clusters.ts` — pick one) that returns the smallest axis-aligned rect covering an array of `BaseElement`s.

Drag halo: solid blue stroke + 10% blue fill — active feedback.
Select halo: dashed blue stroke + 6% blue fill — passive indication.

`listening={false}` so halos never intercept mouse events.

### Halo render integration

Halos render in a layer (or sub-group) **behind** the elements layer in `Canvas.tsx`. Konva draws by mount order, so halos must be mounted before element shapes.

Per render pass, deduplicate halos:

- Build a set `halosToRender: Map<argumentId, 'drag' | 'select'>`.
- For every selected element (argument or support): identify its anchor argument and add a `'select'` halo for it.
- For the dragged support (if any): for every argument whose cluster the dragged support's bbox currently overlaps, add a `'drag'` halo for that argument (drag mode wins if both modes apply to the same argument).
- Render one `<ClusterHalo>` per entry.

A bridge support being dragged thus produces two drag halos — one per overlapped argument — exactly the visual signal that it's about to bridge two clusters.

### Drag handlers

**Argument drag (sticky-group):**

```
onDragStart(argument):
  cluster = computeCluster(elements, argument.id)
  cache.cluster = cluster
  cache.startPositions = new Map(
    [argument, ...cluster.supports].map(el => [el.id, { ...el.position }])
  )

onDragMove(argument):
  delta = { x: argument.x - cache.startPositions.get(argument.id).x,
            y: argument.y - cache.startPositions.get(argument.id).y }
  // Apply via store batch action so a single zundo entry covers the whole move:
  store.moveCluster(cache.startPositions, delta)

onDragEnd(argument):
  cache = {}
```

`moveCluster(startPositions: Map<id, Position>, delta: Position)` is a new action on the diagram store. It iterates members and sets each `position = startPos + delta` in a single store update, producing one undo entry rather than N.

**Support drag (single-element):**

Standard single-element move via existing `moveElement`. No group behavior. The dragged support's current rect drives drag-mode halos in the render layer.

```
onDragEnd(support):
  if support.associatedWith != null: return    // sticky link
  overlappedArgIds = new Set()
  for each argument in elements:
    cluster = computeCluster(elements, argument.id)
    if [argument, ...cluster.supports].some(m => bboxesOverlap(m, support)):
      overlappedArgIds.add(argument.id)
  if overlappedArgIds.size === 1:
    store.setElement(support.id, { associatedWith: [...overlappedArgIds][0] })
  // else (zero or multiple): leave associatedWith unset
```

The "exactly one" rule covers the common workflow without guessing in ambiguous cases.

### Properties panel

`src/components/Properties/PropertiesPanel.tsx`: when a `SupportElement` is selected, add a new field below existing support-type controls:

```
Associated with
[ Claim 2: "Triangles are similar..."     ▾ ]
```

Dropdown contents: `(none)` plus every `ArgumentElement` on the canvas, formatted as `{argumentType}: "{contentPreview}"` — e.g., `Claim 2: "Triangles are similar..."`. Truncate `contentPreview` to ~40 chars with ellipsis.

Order: by canvas position top-to-bottom, then left-to-right (stable, predictable). If existing dropdowns in the codebase use a different ordering convention, follow that instead — pick whichever ordering already appears in the Properties panel.

Selecting `(none)` clears `associatedWith`. Selecting an argument sets the field to its id. The dropdown reflects the current value regardless of whether it was auto-suggested or manually set — that distinction has no analytical meaning once the field is set.

No separate "Unlink" affordance. `(none)` is the unlink path.

### Store action

New action in `src/store/diagramStore.ts`:

```ts
moveCluster: (startPositions: Map<string, Position>, delta: Position) => void;
```

Implementation: single `set` call that iterates `state.elements` and updates each whose id is in `startPositions` with `position = { x: startPos.x + delta.x, y: startPos.y + delta.y }`. zundo wraps this as one undo entry.

The existing `setElement` action handles the `associatedWith` writes (auto-suggest at drop, dropdown selection). No new action needed for those.

### JSON export

No format changes beyond the new optional field appearing on supports that have it. Verify the existing JSON load path tolerates unknown / missing fields — current loaders should already handle this since `attribution`, `image`, `imageSettings`, etc. are all optional. The implementation plan should add a one-line check.

## Files

- `src/types/elements.ts` — add `associatedWith?: string` to `SupportElement`
- **NEW** `src/utils/clusters.ts` — `bboxesOverlap`, `computeCluster`, `unionBbox`, `Cluster` type
- **NEW** `src/utils/clusters.test.ts` — unit tests
- **NEW** `src/components/Canvas/shapes/ClusterHalo.tsx` — halo render component
- `src/components/Canvas/Canvas.tsx` — halo render integration in the canvas layer; sticky-group drag handler for arguments; auto-suggest in support `dragend`
- `src/components/Properties/PropertiesPanel.tsx` — "Associated with" dropdown
- `src/store/diagramStore.ts` — add `moveCluster` action

## Testing

### Unit tests (`src/utils/clusters.test.ts`)

- `bboxesOverlap` — disjoint rects, overlapping rects, contained rect, edge-touching rects (treated as no overlap), identical rects.
- `computeCluster` returns `null` when `argumentId` not found.
- `computeCluster` returns `null` when `argumentId` refers to a non-argument element (e.g., a support).
- `computeCluster` with single argument and no overlapping supports → `supports: []`.
- `computeCluster` with one overlapping support → `supports: [supportA]`.
- `computeCluster` walks transitively: supportA overlaps argument; supportB overlaps supportA only (not argument) → both A and B in cluster.
- `computeCluster` respects the wall: argument_1, argument_2, supportA overlaps both → argument_1's cluster contains supportA, does NOT contain argument_2; argument_2's cluster contains supportA, does NOT contain argument_1.
- `computeCluster` with cycles in overlap graph (A overlaps B, B overlaps C, C overlaps A, all overlap argument) → terminates with all three in cluster.
- `unionBbox` of one element → that element's rect.
- `unionBbox` of multiple elements → smallest enclosing axis-aligned rect.

### Manual verification (browser)

After implementation, run the dev server and confirm in order:

1. Drop a Claim, drop a Question, drag the Question onto the Claim, release. Properties panel "Associated with" shows the Claim.
2. Drop a second Question, drag it onto the first Question (which is already in the Claim's cluster), release. The second Question's `associatedWith` auto-fills with the Claim (transitive auto-suggest).
3. Click the Claim. Halo appears (dashed blue) around the Claim + both Questions.
4. Click off, then click one of the Questions. Same halo appears.
5. Drag the Claim. Both Questions move with it, keeping their relative offsets. Single undo step reverts the whole move.
6. Drag one Question out of overlap. It moves alone. Properties still shows the Claim in "Associated with" (sticky link).
7. Drop a third Question that overlaps both the existing Claim and a second Claim simultaneously. Properties shows `(none)` (auto-suggest skipped due to ambiguity). While selected, both Claims' halos visible.
8. Open Properties for the third Question, pick the second Claim from "Associated with". Save the diagram, reopen it. The link survives the round-trip.
9. Drag the second Claim. The third Question moves with it (it's now part of the second Claim's cluster); the first Claim's cluster is unaffected.

## Tunable parameters (post-ship dials)

- `PAD = 8` — halo padding (pixels around cluster bbox).
- `CORNER_RADIUS = 12` — halo corner roundness.
- Halo colors and stroke widths — currently `#4A90D9` blue family matching existing selection style.
- Content-preview truncation length in the dropdown (currently ~40 chars).

These live as named constants in `ClusterHalo.tsx` / `PropertiesPanel.tsx` and can be tweaked without touching call sites.
