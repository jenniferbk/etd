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
- Auto-clearing the link when a support is dragged out of overlap, or when a linked support is dragged onto a *different* argument's cluster. The field is authoritative — moving a support around the canvas does not silently re-bind it. Users edit the Properties panel dropdown to change the link. To make this less surprising, while a linked support is being dragged the linked argument's halo renders so the user sees that the link is intact and unchanged (see "Halo render integration").
- Migration of legacy `TeacherSupportElement` (already deprecated). New field lives on `SupportElement` only.
- Halo animations. Halos appear and disappear instantly on selection / drag-state change.
- Persisted cluster IDs. Clusters are computed on demand from spatial overlap; no second source of truth.
- Super-clusters that span multiple arguments. Argument boundaries act as walls in cluster traversal — see "Cluster computation" below.
- Visual on-canvas indicator for orphan links (a support linked to an off-screen or non-overlapping argument). Properties panel surfaces the link; an on-canvas badge can land later if researchers ask.
- Special handling of nested arguments (one argument's bbox fully containing another). Anna's diagrams don't currently use this; if a researcher reports it, revisit the wall rule.

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

Halos render in a layer (or sub-group) at the **deepest** position in the canvas — behind connections AND behind elements. The current `Canvas.tsx` renders connections, then elements, then a Transformer. Halos go before all of these so their translucent fill never tints connection arrows or element borders. Konva draws by mount order, so the halo group must be the first child of the main `<Layer>`.

**Per-render dedup.** Build `halosToRender: Map<argumentId, 'drag' | 'select'>`. Iterate as follows:

1. **Selection halos.** For each selected element:
   - If it's an argument: add `(argument.id, 'select')`.
   - If it's a support: identify its anchor argument(s) and add a `'select'` halo for each. Anchor arguments are: (i) the argument named by `associatedWith` if set; AND (ii) every argument whose cluster the support spatially overlaps via `computeCluster`. Both can apply simultaneously — for example, a sticky-linked support that has been dragged into a different cluster shows two `'select'` halos.
2. **Drag halos for an unlinked support being dragged.** For every argument whose cluster the dragged support's current bbox would join (computed via the auto-suggest single-BFS — see "Drag handlers"), add `(arg.id, 'drag')`. Drag mode wins on tie if a `'select'` entry already exists.
3. **Sticky-link halo for a linked support being dragged.** If the dragged support has `associatedWith` set, add `(associatedWith, 'select')` — the existing link's halo follows the support around so the user sees the link is intact and not changing. No `'drag'` halos are added for a linked support's drag (re-linking via drag is a no-op by design).

The `'select'` halo for the linked argument during a linked support's drag is the visual answer to "why doesn't dragging onto a new cluster re-link?" The user sees their original link still highlighted; the path to re-link is the Properties dropdown.

A bridge support being dragged (unlinked) produces two `'drag'` halos — one per overlapped argument — exactly the visual signal that it's about to bridge two clusters and that the auto-suggest will skip due to ambiguity.

### Drag handlers

**Argument drag (sticky-group).** Sticky-group fires only when the dragged argument is **not part of a multi-selection**: `selectedIds.length <= 1 || !selectedIds.includes(argument.id)`. If the argument is part of a multi-select drag, the existing multi-select handler runs and sticky-group is suppressed (multi-select wins; otherwise cluster supports that are also selected would move twice).

```
onDragStart(argument):
  if (selectedIds.length > 1 && selectedIds.includes(argument.id)):
    return  // multi-select wins, no sticky-group
  cluster = computeCluster(elements, argument.id)
  cache.cluster = cluster
  cache.startPositions = new Map(
    [argument, ...cluster.supports].map(el => [el.id, { ...el.position }])
  )
  cache.supportNodes = new Map(
    cluster.supports.map(s => [s.id, stage.findOne('#' + s.id)])
  )

onDragMove(argument):
  if !cache.cluster: return
  delta = { x: argument.x - cache.startPositions.get(argument.id).x,
            y: argument.y - cache.startPositions.get(argument.id).y }
  // Move support Konva nodes imperatively — no store writes during the drag.
  for [id, node] of cache.supportNodes:
    start = cache.startPositions.get(id)
    node.position({ x: start.x + delta.x, y: start.y + delta.y })
  layer.batchDraw()

onDragEnd(argument):
  if !cache.cluster: return
  finalDelta = { ... computed from argument's final position vs start ... }
  // Single store action → one zundo entry covering the whole cluster move:
  store.moveCluster(cache.startPositions, finalDelta)
  cache = {}
```

`moveCluster(startPositions: Map<id, Position>, delta: Position)` is a new action on the diagram store. It iterates members in `startPositions` and sets each element's `position = startPos + delta` in a single state update, producing one undo entry rather than N.

**Why imperative Konva node moves during the drag, not store writes per frame:** writing to the store every `dragmove` would either flood zundo with N×frames undo entries, or require throttling. Imperative Konva moves during the drag + a single store commit on `dragend` is the standard idiom for grouped drag in Konva and produces exactly one undo entry.

**Snap-to-align interaction.** The recently-shipped snap-to-align feature acts on the dragged argument's Konva position. Cluster supports follow the *post-snap* `argument.x/y` exactly via the `delta` computation above, so the cluster moves rigidly without per-element snapping. This preserves the cluster's relative geometry — no jiggle, no overlap loss mid-drag, no double-snap.

**Support drag (single-element).** Standard single-element move via the existing `moveElement` flow; no group behavior. The dragged support's current rect during drag drives the halo render (drag-mode halos if unlinked, sticky-link halo on the existing argument if already linked — see "Halo render integration").

**Auto-suggest on support `dragend`.** Single BFS from the dropped support, walls at arguments:

```
onDragEnd(support):
  if support.associatedWith != null:
    return  // sticky link — no re-suggest, see "Re-linking" below
  visited = new Set([support.id])
  queue = [support]
  overlappedArgIds = new Set<string>()

  while (queue.length > 0):
    current = queue.shift()
    for each candidate in elements:
      if visited.has(candidate.id): continue
      if !bboxesOverlap(current, candidate): continue
      visited.add(candidate.id)
      if candidate.type === 'argument':
        overlappedArgIds.add(candidate.id)
        // wall — do not queue
      else if isSupportElement(candidate):
        queue.push(candidate)

  if overlappedArgIds.size === 1:
    // Batch the move (already committed by Konva's drag) with the link write
    // so undo reverts both atomically.
    store.moveAndLink(support.id, support.position, [...overlappedArgIds][0])
  // else (size 0 or 2+): no link change; the move stands as-is.
```

The single BFS replaces an O(args × elements²) per-argument variant — it runs once total and finds every argument anchor the support's "would-be cluster" touches.

**Undo batching for support drop.** A new store action `moveAndLink(id: string, position: Position, associatedArgumentId: string | null)` is added so the position update and the link write happen in one zundo step. Without this, `Cmd+Z` after a drop-with-auto-suggest would undo only one of them. For non-linking drops, the existing `moveElement` action remains sufficient (no second write to batch).

**Re-linking.** Once `associatedWith` is set, dragging the support somewhere else is a no-op for the link. The visual feedback during a linked support's drag (sticky-link halo on the existing argument — see "Halo render integration") communicates the no-op so the user understands. To re-link: open Properties and pick a different argument (or `(none)` and re-drop).

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

### Store actions and argument-deletion cleanup

Two new actions in `src/store/diagramStore.ts`:

```ts
moveCluster: (startPositions: Map<string, Position>, delta: Position) => void;
moveAndLink: (id: string, position: Position, associatedArgumentId: string | null) => void;
```

`moveCluster` — single `set` call that iterates `state.elements` and updates each whose id is in `startPositions` with `position = { x: startPos.x + delta.x, y: startPos.y + delta.y }`. zundo wraps this as one undo entry.

`moveAndLink` — single `set` call that updates the support's `position` and writes `associatedWith = associatedArgumentId` (or removes it if `null`). One zundo entry covers both writes, so `Cmd+Z` after a drop-with-auto-suggest reverts the move and the link together.

The existing `setElement` action handles `associatedWith` writes triggered from the Properties dropdown. No new action needed for those (single field write, single undo entry — already correct).

**Argument-deletion cleanup.** Modify the existing `removeElement` action: when the removed element is an `ArgumentElement`, also clear `associatedWith` on every `SupportElement` whose `associatedWith` equals the removed id. This avoids dangling references that would crash the Properties dropdown's lookup or display stale data.

```ts
removeElement: (id) =>
  set((state) => {
    const removed = state.elements.find(e => e.id === id);
    const isArg = removed?.type === 'argument';
    return {
      elements: state.elements
        .filter(el => el.id !== id)
        .map(el =>
          isArg && isSupportElement(el) && el.associatedWith === id
            ? { ...el, associatedWith: undefined }
            : el
        ),
      connections: state.connections.filter(
        conn => conn.from !== id && conn.to !== id
      ),
      selectedIds: state.selectedIds.filter(sid => sid !== id),
    };
  }),
```

The scrub is part of the same `set` call, so undo restores both the deleted argument *and* the cleared `associatedWith` fields on every support that was pointing to it — atomic.

### JSON export

No format changes beyond the new optional field appearing on supports that have it. Verify the existing JSON load path tolerates unknown / missing fields — current loaders should already handle this since `attribution`, `image`, `imageSettings`, etc. are all optional. The implementation plan should add a one-line check.

## Files

- `src/types/elements.ts` — add `associatedWith?: string` to `SupportElement`
- **NEW** `src/utils/clusters.ts` — `bboxesOverlap`, `computeCluster`, `unionBbox`, `Cluster` type
- **NEW** `src/utils/clusters.test.ts` — unit tests
- **NEW** `src/components/Canvas/shapes/ClusterHalo.tsx` — halo render component
- `src/components/Canvas/Canvas.tsx` — halo render integration in the canvas layer; sticky-group drag handler for arguments; auto-suggest in support `dragend`
- `src/components/Properties/PropertiesPanel.tsx` — "Associated with" dropdown
- `src/store/diagramStore.ts` — add `moveCluster` and `moveAndLink` actions; modify `removeElement` to scrub dangling `associatedWith` when an argument is deleted

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

### Unit tests for store actions (`src/store/diagramStore.test.ts` — new)

- `moveCluster` updates positions for every id in `startPositions`, leaves other elements unchanged.
- `moveAndLink` updates both `position` and `associatedWith` in one state transition.
- `removeElement` on an argument also clears `associatedWith` on every support that referenced it; supports linked to *other* arguments are untouched.
- `removeElement` on a support does NOT touch any other element's `associatedWith` (supports don't appear as link targets).
- `moveAndLink(id, pos, null)` clears `associatedWith` while updating position (covers the "drop into ambiguous overlap, no link" case if we ever route it through this action; for now it's a defensive completeness test).

### Manual verification (browser)

After implementation, run the dev server and confirm in order:

1. Drop a Claim, drop a Question, drag the Question onto the Claim, release. Properties panel "Associated with" shows the Claim.
2. Drop a second Question, drag it onto the first Question (which is already in the Claim's cluster), release. The second Question's `associatedWith` auto-fills with the Claim (transitive auto-suggest).
3. Click the Claim. Halo appears (dashed blue) around the Claim + both Questions.
4. Click off, then click one of the Questions. Same halo appears.
5. Drag the Claim. Both Questions move with it, keeping their relative offsets. Snap-to-align (if engaged) snaps the Claim cleanly; the Questions follow without independent snapping. Single `Cmd+Z` reverts the whole move.
6. Drag one Question out of overlap. It moves alone. Properties still shows the Claim in "Associated with" (sticky link).
7. Drop a third Question that overlaps both the existing Claim and a second Claim simultaneously. Properties shows `(none)` (auto-suggest skipped due to ambiguity). While selected, both Claims' halos visible.
8. Open Properties for the third Question, pick the second Claim from "Associated with". Save the diagram, reopen it. The link survives the round-trip.
9. Drag the second Claim. The third Question moves with it (it's now part of the second Claim's cluster); the first Claim's cluster is unaffected.
10. **Linked-support drag feedback:** drag the second Question (already linked to the first Claim) toward the second Claim's cluster. While dragging, the first Claim's halo (the existing link) stays highlighted around the original argument and follows the support visually. On release, no auto-suggest fires; Properties still shows the first Claim. (`Cmd+Z` undoes the move only.)
11. **Drop with auto-suggest is one undo step:** drop a fresh Question onto a Claim, watch `associatedWith` auto-fill. `Cmd+Z` once — the Question returns to its pre-drag position AND `associatedWith` is cleared (both reverted atomically).
12. **Multi-select drag suppresses sticky-group:** marquee-select a Claim and one of its Questions. Drag. Only those two move (multi-select behavior); the cluster's other Questions stay put.
13. **Argument deletion scrubs the link:** delete the first Claim. Both Questions that were linked to it now show `(none)` in Properties. `Cmd+Z` restores the Claim AND restores both Questions' `associatedWith` (atomic).
14. **Bridge-support during select:** select the third Question (linked to second Claim, but currently overlapping both Claims via the cluster geometry). Two halos appear — one for the second Claim (its sticky link) and one for the first Claim (current spatial overlap). Both are dashed select-mode style.

## Tunable parameters (post-ship dials)

- `PAD = 8` — halo padding (pixels around cluster bbox).
- `CORNER_RADIUS = 12` — halo corner roundness.
- Halo colors and stroke widths — currently `#4A90D9` blue family matching existing selection style.
- Content-preview truncation length in the dropdown (currently ~40 chars).

These live as named constants in `ClusterHalo.tsx` / `PropertiesPanel.tsx` and can be tweaked without touching call sites.
