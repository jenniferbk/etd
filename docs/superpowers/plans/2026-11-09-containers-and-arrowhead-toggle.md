# Containers + Arrowhead Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an argument element act as a container that holds a one-level sub-argument (members move with it), and let every connector's arrowhead be switched on or off.

**Architecture:** Two optional fields on existing types (`ArgumentElement.isContainer`, `BaseElement.containerId`, `Connection.arrowhead`). All rules live in pure helpers (`src/utils/containers.ts`, `src/utils/arrowhead.ts`) with Vitest tests; store actions call the helpers inside a single `set()` so each gesture is one undo step and one live-sync batch; components stay thin.

**Tech Stack:** React 18, TypeScript (strict, `erasableSyntaxOnly`), Konva/react-konva, Zustand + zundo, Vitest (Node env, no jsdom).

**Spec:** `docs/superpowers/specs/2026-11-09-containers-and-arrowhead-toggle-design.md`

## Global Constraints

- `SAVE_SCHEMA_VERSION` (`src/utils/schema.ts`) → `'1.9'`. Additive only; no migration; old files must render exactly as before.
- One container level: a container never has `containerId`; an element with `isContainer` is never a member.
- Membership test = element **center point** inside container bounds.
- Implicit containers draw as a **dashed rectangle, not a cloud**, on canvas and in every export.
- Draw order on canvas and in SVG/DiagramMix export: containers → connectors → other elements.
- Arrowhead `undefined` = today's automatic rule; `true`/`false` override. Arrowhead at the `to` end only.
- `CONTAINER_MIN_SIZE = { width: 400, height: 250 }`.
- Verification recipe: `npm run lint` (no new problems vs. baseline of ~17 pre-existing), `npx tsc -b`, `npm test`, `npm run build`, `cd server && npm run typecheck && npm test`. There is no root `typecheck` script.
- ESLint React Compiler traps: no store setter calls inside `.map()` render closures; no `useEffect(() => setState(...))`.

## Review Focus

1. **Multi-select drag containing a container and some of its members** — members must move exactly once (not double-shifted). Pinned in Task 5 (`moveElement` with `excludeMemberIds`) and exercised manually in Task 9.
2. **Support dropped inside a container auto-linking to the container** — the support-drop BFS sees the container as an overlapping argument and would set `associatedWith` to the container. Must link to the member argument it touches, or nothing. Pinned in Task 4 (`linkCandidates`) and wired in Task 7.
3. **Converting a container to a support, or changing its type** — members must be released, not orphaned with a dangling `containerId`. Pinned in Task 5 (`convertToSupport` test).
4. **Undo of delete-container / make-container** — must be one undo step restoring both container and membership. Pinned in Task 5 by doing each in a single `set()` (test asserts one temporal entry).
5. **Opening an old diagram** — no `isContainer`/`arrowhead` fields anywhere → identical output. Pinned by Task 2 (`svgExport` snapshot of a no-override diagram unchanged) and Task 5 (`loadDiagram` leaves plain elements untouched).

---

### Task 1: Arrowhead field and resolver

**Files:**
- Modify: `src/types/connections.ts` (add field to `Connection`)
- Modify: `src/utils/schema.ts:4` (`'1.8'` → `'1.9'`)
- Create: `src/utils/arrowhead.ts`
- Test: `src/utils/arrowhead.test.ts`

**Interfaces:**
- Produces:
  - `Connection.arrowhead?: boolean`
  - `defaultArrowhead(conn: Connection, elementsById: ReadonlyMap<string, DiagramElement>): boolean`
  - `resolveArrowhead(conn: Connection, elementsById: ReadonlyMap<string, DiagramElement>): boolean`
  - `isRebuttalToAttachedQualifier(conn: Connection, elementsById: ReadonlyMap<string, DiagramElement>): boolean` — true when `conn.to` is an element id whose element is an argument with `argumentType === 'qualifier'` and `attachedTo !== undefined` (the condition currently duplicated in `Arrow.tsx` and `svgExport.ts`).

- [ ] **Step 1: Write the failing tests** in `src/utils/arrowhead.test.ts`:

```ts
describe('defaultArrowhead', () => {
  it('support element→element: true', ...)            // type 'support', to: 'b'
  it('counterclaim: false', ...)
  it('warrant attachment (to is ConnectionTarget): false', ...)
  it('rebuttal→attached qualifier: false', ...)        // to = qualifier with attachedTo
  it('→ unattached qualifier: true', ...)              // no attachedTo → ordinary connector
});
describe('resolveArrowhead', () => {
  it('undefined override falls back to default', ...)
  it('arrowhead: false hides a support arrow', ...)    // expect false
  it('arrowhead: true shows a counterclaim arrow', ...) // expect true
  it('arrowhead: true shows a warrant-attachment arrow', ...)
  it('arrowhead: true shows a rebuttal→qualifier arrow', ...)
});
```

- [ ] **Step 2: Run** `npx vitest run src/utils/arrowhead.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the three functions in `src/utils/arrowhead.ts`; `resolveArrowhead` = `conn.arrowhead ?? defaultArrowhead(...)`. Add the field and bump schema version.
- [ ] **Step 4: Run** the same command — expect PASS. Run `npx tsc -b` — expect no errors.
- [ ] **Step 5: Commit** `feat(arrowhead): per-connection arrowhead override + shared resolver`

### Task 2: Arrowhead rendering on canvas and in exports

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (arrowhead block ~line 780; qualifier special case ~lines 302–370; attachment `<Line>` ~line 615)
- Modify: `src/utils/svgExport.ts` (`renderConnectionSvg`, ~lines 370–445)
- Modify: `src/utils/diagramxExport.ts` (~lines 500–535, `hasEndArrow`)
- Test: `src/utils/svgExport.test.ts`, `src/utils/diagramxExport.test.ts`

**Interfaces:**
- Consumes: `resolveArrowhead`, `isRebuttalToAttachedQualifier` from Task 1.
- Produces: nothing new.

Rules:
- Every connector kind draws its arrowhead iff `resolveArrowhead(...)` is true. Counterclaim slash unchanged.
- Warrant attachments in `attachmentStyle === 'warning'` and the misaligned rebuttal→qualifier "reposition me" hint ignore the toggle (never an arrowhead).
- Aligned rebuttal→qualifier with arrowhead on: the vertical line ends at the qualifier's nearest horizontal edge (top edge `qual.position.y` if the source is above, bottom edge `qual.position.y + qual.size.height` if below) instead of `qualCenter.y`, and the arrowhead sits there. With arrowhead off, geometry is unchanged from today.
- Canvas arrowhead for an attachment uses the last segment of `pathPoints`, same triangle as today's arrowhead block.
- DiagramMix: `hasEndArrow = resolveArrowhead(conn, elementsById)` for all connectors. This removes the arrowhead DiagramMix currently gives rebuttal→attached-qualifier connectors (spec §3.4 bug fix).

- [ ] **Step 1: Write failing tests:**
  - `svgExport.test.ts`: `'support connector with arrowhead:false has no marker-end'`; `'counterclaim with arrowhead:true has marker-end and still has slash line'`; `'warrant attachment with arrowhead:true has marker-end'`; `'aligned rebuttal→qualifier with arrowhead:true ends at qualifier top edge with marker-end'` (assert `y2 === qual.position.y + offsetY`); `'diagram with no overrides renders identical SVG to before'` (build a support + counterclaim + attachment diagram; assert marker-end appears exactly once, on the support).
  - `diagramxExport.test.ts`: `'rebuttal→attached qualifier exports without end arrow'`; `'support with arrowhead:false exports without end arrow'` (assert no `endArrowheadKind`).
- [ ] **Step 2: Run** `npx vitest run src/utils/svgExport.test.ts src/utils/diagramxExport.test.ts` — expect the new tests FAIL.
- [ ] **Step 3: Implement** in the three files, replacing each local arrowhead decision with the resolver.
- [ ] **Step 4: Run** the same command — expect PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(arrowhead): honor override on canvas, SVG and DiagramMix export`

### Task 3: Arrowhead store action and UI

**Files:**
- Modify: `src/store/diagramStore.ts` (interface ~line 145, impl next to `setConnectionType` ~line 573)
- Modify: `src/components/Properties/PropertiesPanel.tsx` (connection section near the Support/Counterclaim toggle ~line 221)
- Modify: `src/components/Canvas/ContextMenu.tsx` (connection items near line 154), `src/components/Canvas/Canvas.tsx` (handlers near line 676)
- Test: `src/store/diagramStore.test.ts`

**Interfaces:**
- Consumes: `resolveArrowhead` (Task 1).
- Produces: store action `setConnectionArrowhead(id: string, value: boolean | undefined): void` — `undefined` deletes the key (not `arrowhead: undefined`) so saved files stay clean.

UI copy:
- Properties panel, connection selected: label **Arrowhead**, segmented control **Auto · On · Off**. When Auto is active, show `(currently on)` / `(currently off)` from `resolveArrowhead`.
- Context menu on a connection: **Hide arrowhead** when it currently resolves on, **Show arrowhead** when off (sets explicit `false`/`true`); **Reset arrowhead** only when `arrowhead` is defined.

- [ ] **Step 1: Write failing tests** in `describe('setConnectionArrowhead')`: `'sets true/false'`; `'undefined removes the key'` (assert `!('arrowhead' in conn)`); `'is undoable in one step'` (call, then `useDiagramStore.temporal.getState().undo()`, assert original).
- [ ] **Step 2: Run** `npx vitest run src/store/diagramStore.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the action, then the panel control and context-menu items (follow the existing counterclaim toggle's wiring; hoist callbacks, no setter calls in `.map()`).
- [ ] **Step 4: Run** tests — PASS; `npm run lint` — no new problems; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(arrowhead): Auto/On/Off control in properties panel and context menu`

### Task 4: Container rules as pure helpers

**Files:**
- Modify: `src/types/elements.ts` (`BaseElement.containerId?: string`, `ArgumentElement.isContainer?: boolean`)
- Create: `src/utils/containers.ts`
- Test: `src/utils/containers.test.ts`

**Interfaces:**
- Consumes: `computeCluster` from `src/utils/clusters.ts`.
- Produces (all pure, never mutate input; return the **same array reference** when nothing changes):
  - `CONTAINER_MIN_SIZE: Size`
  - `isContainerElement(el: DiagramElement): el is ArgumentElement` — argument with `isContainer === true`
  - `elementCenter(el: DiagramElement): Position`
  - `containerAt(elements: readonly DiagramElement[], el: DiagramElement): string | null` — id of the topmost (last in array) container whose bounds contain `el`'s center; `null` if `el` is itself a container, is an attached qualifier (`attachedTo` set), or no container matches.
  - `membersOf(elements: readonly DiagramElement[], containerId: string): DiagramElement[]`
  - `retestMembership(elements: DiagramElement[], ids: ReadonlySet<string>): DiagramElement[]` — sets/clears `containerId` on the given ids via `containerAt`; ignores containers.
  - `retestAroundContainer(elements: DiagramElement[], containerId: string): DiagramElement[]` — re-tests current members plus every non-container element whose center is inside the container (grow takes in, shrink drops out).
  - `makeContainer(elements: DiagramElement[], id: string): DiagramElement[]` — sets `isContainer: true`, clears its own `containerId`, grows size to at least `CONTAINER_MIN_SIZE` keeping top-left, then `retestAroundContainer`. No-op for non-arguments and attached qualifiers.
  - `unmakeContainer(elements: DiagramElement[], id: string): DiagramElement[]` — removes `isContainer`, clears `containerId` on its members; size unchanged.
  - `normalizeContainers(elements: DiagramElement[]): DiagramElement[]` — clears `isContainer` on non-arguments and attached qualifiers; clears `containerId` on containers, on attached qualifiers, and wherever it points at a missing/non-container/self id.
  - `containerDragIds(elements: readonly DiagramElement[], containerId: string): string[]` — container + all members + `computeCluster(elements, containerId).supports` (hanging supports), deduplicated.
  - `linkCandidates(support: DiagramElement, overlappedArgIds: ReadonlySet<string>, elementsById: ReadonlyMap<string, DiagramElement>): Set<string>` — drops any container whose bounds contain the support's center.
  - `duplicateWithMembers(elements: readonly DiagramElement[], connections: readonly Connection[], ids: readonly string[], makeId: () => string, offset: Position): { elements: DiagramElement[]; connections: Connection[]; newIds: string[] }` — expands each container id in `ids` to include its members; copies get new ids and are offset; copied members' `containerId` is remapped to the copied container; connections whose `from` and element `to` are both inside the copied set are copied with remapped ids (warrant attachments whose target connection was also copied get the copied connection id; others are skipped); `associatedWith` remapped when its target was copied; a lone duplicated member keeps `containerId` only if its offset center is still inside (via `containerAt` on the combined list).
  - `splitForRender<T extends DiagramElement>(elements: readonly T[]): { containers: T[]; others: T[] }` — preserves relative order.

- [ ] **Step 1: Write failing tests** (one `it` each, fixtures built from small `arg`/`sup` factories like `diagramStore.test.ts`):
  - `containerAt`: center inside → id; center outside but box overlapping → null; container itself → null; attached qualifier → null; two overlapping containers → the later one.
  - `retestMembership`: element moved in gains `containerId`; moved out loses it; unchanged → same array reference (`toBe`).
  - `retestAroundContainer`: after container grows, a non-member now inside joins; after shrink, a member now outside leaves; an element inside a *different* container is not stolen unless its center is inside this one and this one is later in the array.
  - `makeContainer`: 200×100 → 400×250 with same top-left; 500×300 keeps size; sweeps elements already inside; on a support → returns same reference; on a member → clears its `containerId` first.
  - `unmakeContainer`: members lose `containerId`; size unchanged.
  - `normalizeContainers`: dangling id cleared; container-with-containerId cleared; isContainer on support cleared; valid diagram → same reference.
  - `containerDragIds`: includes container, member argument, member support, and a support hanging over the border (center outside, overlapping); excludes an unrelated element.
  - `linkCandidates`: support centered inside container overlapping both container and member claim → `{claim}` only.
  - `duplicateWithMembers`: duplicating a container with 2 members and 1 inner connection yields 3 new elements, 1 new connection with remapped from/to, members point to the new container id; a connection from a member to an outside element is not copied; duplicating a lone member offset 20px keeps `containerId`.
  - `splitForRender`: containers first group, order preserved.
- [ ] **Step 2: Run** `npx vitest run src/utils/containers.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `src/utils/containers.ts` and the type fields.
- [ ] **Step 4: Run** — PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(containers): membership rules as pure helpers`

### Task 5: Container store actions

**Files:**
- Modify: `src/store/diagramStore.ts`
- Test: `src/store/diagramStore.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers.
- Produces:
  - New: `setContainer(id: string, on: boolean): void` (wraps `makeContainer`/`unmakeContainer`).
  - Changed: `moveElement(id: string, position: Position, opts?: { excludeMemberIds?: readonly string[] }): void` — if `id` is a container, shift its members by the same delta except those in `excludeMemberIds`; otherwise `retestMembership` on `id`. One `set()`.
  - Changed: `moveCluster(startPositions, delta)` — after moving, `retestMembership` on every non-container key.
  - Changed: `moveAndLink(...)` — after moving, `retestMembership` on `id`.
  - Changed: `resizeElement(id: string, size: Size, position?: Position): void` — sets size (and position if given) **without** moving members; if container, `retestAroundContainer`. One `set()`.
  - Changed: `removeElement(id)` — if container, members' `containerId` cleared in the same `set()`.
  - Changed: `duplicateElements(ids)` — uses `duplicateWithMembers` with the existing id format and `{x: 20, y: 20}` offset; adds copied connections.
  - Changed: `convertToSupport(...)`, and `updateElement` when it changes `argumentType` — run `normalizeContainers` (support can't be a container; members released).
  - Changed: `loadDiagram(...)` — run `normalizeContainers` after `sweepOrphanedQualifiers`.

- [ ] **Step 1: Write failing tests**, one `describe` per action:
  - `moveElement`: moving a container by (50, 30) moves both members by (50, 30); with `excludeMemberIds: ['m1']`, m1 stays put; moving a plain element into a container sets `containerId`; moving it out clears it.
  - `moveCluster`: cluster dropped inside a container → argument and supports all get `containerId`.
  - `resizeElement`: shrinking container with new top-left drops a member now outside and does **not** move members; growing takes in an element.
  - `removeElement`: deleting container leaves members with no `containerId`; `temporal.undo()` once restores container and memberships.
  - `setContainer`: on → min size and sweep, one undo step; off → members released.
  - `duplicateElements`: container + members + inner connection copied; selection = new ids.
  - `convertToSupport` on a container: no `isContainer`, members released.
  - `loadDiagram`: file with dangling `containerId` loads with it cleared; file with no container fields → elements deep-equal input (besides existing auto-size).
- [ ] **Step 2: Run** `npx vitest run src/store/diagramStore.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Update `handleTransformEnd` in `Canvas.tsx` (~line 205) to call `resizeElement(id, size, {x: node.x(), y: node.y()})` instead of `moveElement` + `resizeElement`, so a resize never carries members.
- [ ] **Step 4: Run** — PASS; full `npm test` green; `npx tsc -b` clean.
- [ ] **Step 5: Commit** `feat(containers): store actions carry members, keep one undo step`

### Task 6: Live sync keeps containers valid

**Files:**
- Modify: `src/live/storeBridge.ts` (`applyDocToStore`, ~line 62)
- Test: `src/live/storeBridge.test.ts`

**Interfaces:**
- Consumes: `normalizeContainers`.
- Produces: `applyDocToStore` stores `normalizeContainers(next.elements)`. Because the normalizer is deterministic and returns the same reference when valid, a corrected doc diffs back to the server once and converges.

- [ ] **Step 1: Write failing test** `'applyDocToStore clears a containerId that points at a container which is itself a member'` (doc with A container, B container with `containerId: 'A'`, C member of B → after apply, B has no `containerId`, C keeps `containerId: 'B'`).
- [ ] **Step 2: Run** `npx vitest run src/live/storeBridge.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(live): normalize container membership after remote merges`

### Task 7: Containers on the canvas

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx` (render loop ~line 1100–1190; `handleArgumentDragStart` ~line 415; `handleArgumentDragEnd` ~line 488; `handleSupportDragEnd` ~line 565, `overlappedArgIds` ~line 595; `handleElementDragEnd` ~line 406; context-menu handlers ~line 660)
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`
- Modify: `src/components/Canvas/ContextMenu.tsx`, `src/components/Properties/PropertiesPanel.tsx`

**Interfaces:**
- Consumes: `splitForRender`, `containerDragIds`, `linkCandidates`, `isContainerElement` (Task 4); `setContainer`, `moveElement(..., opts)`, `moveCluster`, `resizeElement(..., position)` (Task 5).

Behavior:
- **Render order:** `const { containers, others } = splitForRender(elements)`; render `containers`, then connections, then `others`. Same element-rendering code for both groups (extract the existing per-element switch into a hoisted `renderElement(element)` function).
- **ArgumentShape for a container:** rectangle at full size with the type's border/fill style; if `borderShape === 'cloud'`, draw a rectangle with `dash` from `dashArrayForBorderStyle('dashed')` instead of the cloud. Label, content and attribution form one block at top-left, width `min(size.width - 2*padding, 260)`.
- **Drag a container:** in `handleArgumentDragStart`, if `isContainerElement`, build `stickyDragRef` from `containerDragIds` (same shape as today's cluster cache; `supportNodes` holds every carried node, regardless of type). Drag move/end then work unchanged through `moveCluster`.
- **Multi-select drag:** in the multi-select fallback (`moveElement(id, finalArg)` when no sticky cache, and `handleElementDragEnd`), pass `{ excludeMemberIds: selectedIds }`.
- **Support drop auto-link:** before the `overlappedArgIds.size === 1` check, replace the set with `linkCandidates(support-at-final-position, overlappedArgIds, elementsById)`.
- **Context menu (argument element, not attached qualifier):** **Make container** / **Remove container** → `setContainer(id, !isContainer)`.
- **Properties panel (argument element selected):** checkbox **Container** with the same effect; when the selected element has a `containerId`, show read-only `In <container label>`.

- [ ] **Step 1:** Implement render order + `ArgumentShape` container branch. Run `npm run build` — succeeds.
- [ ] **Step 2:** Implement drag, multi-select, support-link wiring.
- [ ] **Step 3:** Implement context menu + properties panel controls.
- [ ] **Step 4: Verify** `npm run lint` (no new problems), `npx tsc -b`, `npm test`. Then `npm run dev` and with Playwright MCP: load a diagram, right-click an argument → Make container (box grows to ≥400×250), click/screenshot to confirm inner connectors draw above the container fill and an implicit container is a dashed rectangle. Drags can't be driven by Playwright (see repo quirks); list them for Task 9's manual pass.
- [ ] **Step 5: Commit** `feat(containers): render, drag and toggle containers on canvas`

### Task 8: Containers in SVG and DiagramMix export

**Files:**
- Modify: `src/utils/svgExport.ts` (`generateSvg` ~line 40–56; `renderElementSvg` cloud branch ~line 199)
- Modify: `src/utils/diagramxExport.ts` (item ordering)
- Test: `src/utils/svgExport.test.ts`, `src/utils/diagramxExport.test.ts`

**Interfaces:**
- Consumes: `splitForRender`, `isContainerElement`.

PNG/PDF need no change: they snapshot the Konva stage (`pdfExport.ts` → `snapshotStage`), which inherits Task 7's order.

- [ ] **Step 1: Write failing tests:** `'container is emitted before connector polylines, members after'` (assert index of container rect < first `<polyline` < member rect); `'implicit container renders as dashed rect, not cloud path'`; DiagramMix: `'container item precedes its members in item order'`.
- [ ] **Step 2: Run** `npx vitest run src/utils/svgExport.test.ts src/utils/diagramxExport.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(containers): export order and implicit container shape`

### Task 9: Whole-branch verification and manual pass

- [ ] **Step 1:** Full recipe: `npm run lint` (compare with baseline), `npx tsc -b`, `npm test`, `npm run build`, `cd server && npm run typecheck && npm test`. All green.
- [ ] **Step 2:** Manual checklist for Jennifer (Konva drags can't be automated), recorded in the PR/merge message:
  1. Make Warrant 5 in a copy of `Y2_4M_Cora_Day2_Trial` a container; Data 3, Claim 2, Warrant 1 and their supports become members.
  2. Drag the container: everything inside moves, nothing outside does.
  3. Drag Claim 2 out: it leaves; drag back in: it rejoins.
  4. Shift-select container + one member and drag: member moves once.
  5. Shrink the container past a member: it drops out without moving.
  6. Flip an arrowhead Off/On/Auto on a support, counterclaim and warrant attachment; export SVG and PDF and check they match the canvas.
  7. Open an older diagram: looks unchanged.
- [ ] **Step 3: Commit** any fixes; branch is ready for review.
