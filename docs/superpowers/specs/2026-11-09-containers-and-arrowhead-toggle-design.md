# Containers (Sub-argument Boxes) + Arrowhead Toggle — Design

**Date:** 2026-11-09
**Status:** Design, pending Jennifer's approval. My calls (not discussed with Jennifer) are flagged ⚑.
**Context:** Two requests from Anna Conner, relayed by Jennifer on 2026-11-09. Anna is already drawing sub-arguments by hand: in `Y2_4M_Cora_Day2_Trial`, "Warrant 5 — Whole sub-argument" is a warrant stretched into a big box with Data 3 → Claim 2, Warrant 1 and their supports placed inside it. The editor treats that box as an ordinary element, so nothing inside travels with it, and the sub-argument can't have its own connectors drawn cleanly (connectors render behind elements, so the big box's fill would hide them). The second request is per-connector control over arrowheads.

## 1. What a researcher can do after this ships

1. **Turn an argument element into a container.** Any argument element (Warrant 5, Claim 3, …) can become a container: a large box that keeps its type, label, color, contributor and attribution, and holds a mini-diagram.
2. **Build a sub-argument inside it.** Drag elements (arguments, supports, info boxes) into the container; they become part of it. Draw connectors between them as usual. Drag an element out and it leaves the container.
3. **Move the whole thing.** Dragging the container moves everything inside it along with it.
4. **Connect the container to the main argument.** Connectors attach to the container's edge like any element.
5. **Turn any connector's arrowhead on or off.** Every kind of connector (support, counterclaim, warrant attachment) has an arrowhead toggle.

## 2. Containers

### 2.1 Decided with Jennifer

- A container is **always a real argument element**, never a plain unlabeled grouping box.
- **Membership by dragging:** dropping an element inside the container's border makes it a member; dragging it out removes it.
- **Moving** the container moves all members.
- **Connectors** work inside the container (member ↔ member) and from the container's edge to outside elements. Connectors from a member to something outside the container are also allowed (nothing in the editor restricts connections today).
- **One level only.** A container cannot be a member of another container.
- Label and text sit at the **top-left** of the container; members sit below (as in Anna's screenshot).
- **Resizing** a container does not move its members. Members left outside the new border drop out of the container.
- Containers **save, export (PNG/SVG/PDF), and sync in live sessions** like any other element, with their members drawn on top.

### 2.2 Data model ⚑

- `ArgumentElement.isContainer?: boolean`. Absent/false = today's behavior.
- `BaseElement.containerId?: string` — the id of the container this element belongs to. Stored, not recomputed from geometry, so membership is stable across loads, live sync, and resize.
- `SAVE_SCHEMA_VERSION` → `1.9` (additive; old files load unchanged; older builds ignore the new fields and show a plain big box, which is what Anna has today).
- Integrity rules, enforced in the store:
  - A container cannot have a `containerId` (one level). An element with members cannot be dropped into another container.
  - Deleting a container: ⚑ members stay on the canvas and simply lose `containerId` (deleting the box shouldn't destroy the sub-argument). Undo restores both.
  - Turning a container back into a normal element clears `containerId` on all its members; its size is left as-is.
  - A `containerId` pointing at a missing or non-container element is ignored and cleared on load.

### 2.3 Creating a container ⚑

- Right-click an argument element → **Make container** / **Remove container**. Same toggle in the Properties panel for a selected argument element.
- Making a container: if the element is smaller than a minimum container size (builder picks, roughly 400×250), grow it to that size, keeping top-left fixed. Elements whose center already lies inside the new bounds become members immediately (so Anna's existing hand-drawn Warrant 5 converts in one click).
- No new palette item. (Can be added later if Anna asks.)

### 2.4 Membership rule ⚑

- An element is "inside" when its **center point** is within the container's bounds. Center-point is forgiving for large supports that hang over the border.
- When membership changes ⚑:
  - **Dropping an element** (or a multi-selection) re-tests the dropped elements only: join if inside, leave if outside.
  - **Moving a container never changes membership.** It does not sweep up what it lands on. Non-members that end up visually under it still draw on top; that's acceptable, and dragging them a little re-tests them.
  - **Making a container** sweeps in elements already inside its bounds (Anna's existing boxes convert in one click).
  - **Resizing a container** re-tests everything in or under its old and new bounds: growing it takes in elements now inside, shrinking it drops members now outside.
- **Duplicate** ⚑: duplicating a container duplicates its members and the connectors between members (ids remapped), so a copy is a whole sub-argument. Duplicating a member alone keeps the same `containerId` if the copy's center is still inside, otherwise clears it.
- Attached qualifiers ride on their connector; they don't get membership of their own.

### 2.5 Interaction with existing behavior

- **Support clusters** (`utils/clusters.ts`, sticky drag): a container must not sweep up every support that overlaps it. Cluster computation for a container should only consider supports that are *not* members (or skip container clusters entirely); member supports keep clustering with member arguments as today. Builder decides the exact rule; the anti-goal is dragging Claim 2 inside the container and having it pull unrelated supports, or dragging the container and leaving member supports behind.
- **Multi-select drag** that includes a container and some of its members must not move those members twice.
- **Routing** (`orthogonalRouting.ts`): connectors between members route as they do today. A connector from a member to outside should not treat its own container as an obstacle. Builder checks the router's obstacle handling.
- **Claim-role derivation** is unchanged (still graph-based).
- **Transcript linking, notes, note badges, image embedding**: unchanged for both containers and members.

### 2.6 Rendering

- **Draw order**, canvas and every export: containers → connectors → other elements. Today connectors draw first (`Canvas.tsx` render loop; `svgExport.ts` "connections first"), so a container's fill would hide inner connectors. PDF and PNG export follow the same order.
- The container keeps its type's border/fill style from the style config. **Implicit containers draw as a dashed rectangle, not a cloud** (Jennifer, 2026-11-09). This is the one deliberate exception to the cloud-shape rule in CLAUDE.md, and it applies in canvas and every export.
- Text box for content stays a normal-element-sized block in the top-left, not stretched to the container's width.
- **DiagramMix export** (`diagramxExport.ts`): no nesting there. Export the container as a big box drawn behind its members.

### 2.7 Live collaboration

- `isContainer` and `containerId` are plain element fields and travel through existing `put`/`patch` ops.
- Moving a container must send position patches for the container and every member in the same batch, so a teammate never sees members stranded mid-move.
- Stacking order sync (`order` op): containers are drawn first by rule, not by order, so the order op needs no change.
- ⚑ Integrity rules (§2.2) are re-applied after remote changes are merged into the store, not only in local actions, so concurrent edits (e.g. one person makes B a container while another drops B into container A) settle into a valid state. No build-version check on joining a session: clients load the current build from main, and a stale tab is fixed by reloading.

## 3. Arrowhead toggle

### 3.1 Decided with Jennifer

- Available on **every kind of connector**: support, counterclaim, warrant attachment (connector whose target is another connector), and rebuttal→qualifier.
- Today's automatic choice stays the default. The toggle overrides it for that one connector.

### 3.2 Data model

- `Connection.arrowhead?: boolean`. `undefined` = automatic (today's rule). `true`/`false` = override.
- Shares the `1.9` schema bump. No migration.

### 3.3 UI ⚑

- Properties panel, selected connector: an **Arrowhead** control with three states: *Auto · On · Off*. Auto shows what it currently resolves to.
- Right-click a connector → **Show arrowhead** / **Hide arrowhead** (sets the override); a **Reset arrowhead** item appears when an override is set.
- Undoable like other connector edits.

### 3.4 Rendering

- One shared helper (e.g. `resolveArrowhead(conn, elements, connections)` in `utils/`) decides arrowhead on/off, used by `Arrow.tsx`, `svgExport.ts`, PDF export and `diagramxExport.ts` (which already computes `hasEndArrow`). Today the rule is duplicated in several places; the helper replaces those copies.
- Counterclaim's midpoint slash is unaffected by the toggle.
- ⚑ Rebuttal→qualifier connectors: today the line runs to the qualifier's center and is hidden under it. With the arrowhead on, the line stops at the qualifier's nearest edge and the arrowhead sits there. In the misaligned "reposition me" hint state, the toggle is ignored.
- ⚑ Existing DiagramMix mismatch: `diagramxExport.ts` currently gives rebuttal→qualifier connectors an arrowhead that canvas and SVG don't draw. Using the shared helper fixes that export to match the canvas. This is a bug fix to one export format, not a change to how diagrams look in the editor.
- Arrowhead is at the `to` end only. No start-end arrows, no double-headed arrows.

## 4. Non-goals

- Containers inside containers.
- Plain/unlabeled grouping boxes.
- Collapsing/expanding a container.
- Auto-growing a container to fit its contents.
- Start-end or double-headed arrows; changing arrowhead style.
- Connection validation rules.

## 5. Anti-goals (would count as failure even if it "works")

- Opening an existing diagram changes how it looks. Old diagrams must render exactly as before until someone makes a container or flips an arrowhead.
- Dragging a container leaves some members behind, or drags along things that aren't in it.
- Connectors inside a container are hidden by the container's fill in canvas or any export.
- Canvas and exports disagree about arrowheads.

## 6. Left to the builder

- Minimum container size and the exact padding for the top-left label/text block.
- Exact cluster rule in §2.5, within the anti-goal stated there.
- Whether membership appears in the Properties panel (e.g. "In Warrant 5").
- Test split: pure helpers in `src/utils/*.ts` with Vitest tests (membership, integrity rules, arrowhead resolution, draw order), thin components on top; one manual browser pass on drag behavior (Playwright can't drive Konva drags).
- Verification recipe per repo memory: `npm run lint` (no new problems vs baseline), `npx tsc -b`, `npm test`, `npm run build`, `cd server && npm run typecheck && npm test`.
