# Qualifier-on-Connection + Rebuttal-to-Qualifier

**Status:** Design (pre-implementation)
**Date:** 2026-05-25
**Source:** Anna's team feedback meeting 2026-05-24 (see [[etd-anna-feedback-2026-05-24]] §1–2)

## 1. Background and motivation

Today, qualifiers (`argumentType: 'qualifier'`) are placed on the canvas as standalone rectangle elements with no special connection behavior — they sit near a claim like any other argument component. In Anna Conner's Extended Toulmin framework as practiced by her research team (clarified during her first use of qualifiers in this editor on 2026-05-24), a qualifier is a **modifier of an inference**: it rides on top of the `data→claim` arrow it modifies, semantically and visually.

Coupled change: rebuttals (and any other arrow-attaching element — warrants, backings, implicit-as-warrants) currently attach perpendicularly to the connection itself. When a qualifier is present on that connection at the attachment point, the rebuttal should target the qualifier instead.

Both changes are pure additions to the existing connector system. The schema bumps 1.5 → 1.6, but the only field added is `ArgumentElement.attachedTo` (optional). Legacy data loads fine.

## 2. Out of scope

- Changes to how qualifiers look when **not** attached. Standalone/orphan qualifiers continue to render at their stored `position.{x,y}`, with a new visual marker (dashed red border + ⚠) to flag the unattached state.
- Auto-migration of legacy standalone qualifiers onto nearest connections. Reviewer-driven attachment only.
- New qualifier-specific argumentType variants (qualified-claim, etc.). Qualifiers remain `argumentType: 'qualifier'`.
- DiagramMix `.diagramx` export of the `attachedTo` field — DiagramMix has no equivalent concept; export drops `attachedTo` and renders the qualifier as a standalone box (with a `⚠` toast on export, parallel to the existing embedded-images warning).

## 3. Schema additions

### 3.1 New optional field

```ts
// src/types/elements.ts
export interface ArgumentElement extends BaseElement {
  type: 'argument';
  argumentType: ArgumentType;
  contributor: ContributorType;
  label: string;
  attachedTo?: {
    connectionId: string;   // parent connection's id
    position: number;       // 0..1 along the parent polyline (same convention as ConnectionTarget.position)
  };
}
```

Only meaningful when `argumentType === 'qualifier'`. Same pattern as `SupportElement.subtype?` (meaningful for some support types only).

### 3.2 Schema version

`SAVE_SCHEMA_VERSION` bumps 1.5 → 1.6. No transform needed on load — older files simply don't have `attachedTo` on any element, which is the orphan/legacy state.

### 3.3 Type-target representation

A rebuttal (or other attaching element) whose target is a qualifier uses `Connection.to: string` (element id), **not** `Connection.to: ConnectionTarget`. This shape already exists in the union — no schema change. The distinguishing fact is purely "the target element has `attachedTo` set", which the renderer detects.

## 4. Creation and positioning

### 4.1 Palette drag-drop interaction

The Palette qualifier button gets a different drag payload:

```ts
e.dataTransfer.setData('application/x-etd-qualifier', '1');
```

`Canvas.handleDrop` checks for this payload first. If present:

1. Convert drop client point to canvas coords (existing helper).
2. Hit-test against every connection's polyline. A "hit" is a drop point within **12px** of any segment.
3. If hit:
   - Compute `position` (0–1) using cumulative segment-length math along the polyline. Geometry helper exists in `orthogonalRouting.ts` (warrant-attachment uses the same math).
   - Create the new `ArgumentElement` with `argumentType: 'qualifier'`, `attachedTo: { connectionId, position }`.
   - `position.{x,y}` on the element itself is still required by the schema; set to the resolved center point at attach time (useful for the orphan fallback if the parent connection is later deleted).
4. If miss: reject the drop with toast — "Qualifiers must be dropped onto a connection line."

Clicking the Palette qualifier button (the existing non-drag path) is removed for qualifier specifically — replaced with a tooltip-style transient hint: "Drag onto a connection line."

### 4.2 Drag-along-line

Qualifier element is `draggable: true` like other elements. On `onDragMove`:

1. Resolve the parent connection from `attachedTo.connectionId`.
2. Compute the polyline geometry (cached if needed).
3. Find the closest point on the polyline to the cursor; that point's t (0–1) becomes the new `attachedTo.position`.
4. Update the rendered position to the new geometric center on commit (`onDragEnd`).

**Snap-back rule:** if the cursor leaves a band wider than **40px** from the polyline during drag, snap back to the pre-drag position. Explicit "delete + drag a new qualifier from Palette" is cleaner than accidental detachment.

### 4.3 Multi-qualifier

No special handling. Each qualifier has its own `attachedTo.position`. The Palette drop creates an additional element; the user can drag each one independently.

## 5. Visual rendering

### 5.1 Attached qualifier

```
Shape:        rectangle
Size:         auto-fit width to text + 16px horizontal padding; height 24px (single line)
Position:     centered on the polyline at attachedTo.position
Background:   from styleConfig.argumentTypes.qualifier.backgroundColor (white default)
Border:       from styleConfig.argumentTypes.qualifier.{borderStyle,borderShape}
Z-order:      above connections; same layer as other argument elements
```

The qualifier box opaquely covers the polyline segment under it. The line is visually "interrupted" by the box.

### 5.2 Orphan/legacy qualifier (`attachedTo === undefined`)

```
Shape, position: as before (uses element.position.{x,y})
Border override:  2px dashed, color #CC0000 (danger.fg)
Marker:          ⚠ icon at top-right corner, fontSize 14, fill #CC0000
PropertiesPanel: banner "Unattached qualifier — drag onto a connection to attach."
```

Drag behavior for orphans: free positioning (existing behavior) and the user attaches by dragging the orphan box itself onto a connection. The `onDragMove` handler for unattached qualifiers runs the same hit-test as the Palette drop. On `onDragEnd`, if the drop hit a connection, set `attachedTo` and snap to the line; otherwise leave as orphan at the new position.

## 6. Rebuttal-to-qualifier

### 6.1 Target resolution at attach time

In Connect Mode, when the user clicks a target connection arrow for a source element of `argumentType ∈ { rebuttal, warrant, backing }` or `contributor === implicit`:

```
On target click at point P:
  1. Find connections whose polyline P is near (existing hit-test).
  2. If a hit, search elements where:
       - element.argumentType === 'qualifier'
       - element.attachedTo?.connectionId === hit.connectionId
       - |element's rendered center.x − P.x| ≤ 20
     among the matches, pick the one closest to P.
  3. If a qualifier matches → Connection.to = qualifier.id (string).
     Else                  → Connection.to = ConnectionTarget{connectionId, position} (existing).
```

This is a behavior change for warrants, backings, and implicit-warrants too (Anna's framework didn't distinguish — all attachers should target the qualifier when one's there). Existing saved connections are untouched; resolution runs at *attach time*, not render time.

### 6.2 Visual rendering of a rebuttal-targeting-qualifier connection

When a Connection has `from: rebuttalElement.id, to: someElementId` AND the target element has `attachedTo` set:

1. The target is a qualifier sitting on a parent connection. Compute the qualifier's rendered center `(qx, qy)`.
2. Compute the parent connection's y at x = qx (typically same as qy; for orthogonal polylines with bends, may differ).
3. Draw a single vertical line from the rebuttal's bottom edge at x = qx down to the parent connection's y at x = qx. **No arrowhead.**
4. The qualifier box renders on top of the line at its z-layer, so the line is visually occluded behind the qualifier — appearing to pass through it.

### 6.3 Vertical-only constraint (same as warrants)

The rebuttal's x must equal the qualifier's x for the line to render cleanly. If `|rebuttal.center.x − qualifier.center.x| > 4px`, render a faint dashed gray "reposition me" hint connecting rebuttal to qualifier, identical to the warrant-on-arrow invalid-geometry hint shipped 2026-05-06.

## 7. Lifecycle and invariants

Enforced in `diagramStore`:

1. **Cascade delete on parent connection removal.** `removeConnection(id)` also removes every element where `attachedTo?.connectionId === id`. Single undo entry (one `set()` call updates both arrays).
2. **Element delete clears dependent connections.** When an argument element is removed and it was the source of any connections whose target is now invalid, the existing cleanup runs (no change here). Adds: if the deleted element is a qualifier referenced by any rebuttal's `to: string`, the rebuttal's target becomes invalid; clear `to` or delete the rebuttal connection (decided: **delete the rebuttal connection** — same as orphan-cascade for warrants today).
3. **Load-time orphan sweep.** After load + schema normalization, for every element with `attachedTo` set, check that `attachedTo.connectionId` resolves to a connection. If not, clear `attachedTo` (degrade to orphan). Logs to console for diagnostics; no toast.
4. **ArgumentType change clears `attachedTo`.** If user changes a qualifier to a different argumentType via Properties panel, clear `attachedTo` in the update. Inverse (any → qualifier) leaves `attachedTo` undefined → orphan until user drags.

## 8. Files touched

| File | Change |
|------|--------|
| `src/types/elements.ts` | Add `attachedTo` field to `ArgumentElement` |
| `src/utils/schema.ts` | Bump SAVE_SCHEMA_VERSION → 1.6 |
| `src/components/Canvas/Canvas.tsx` | New drop branch for `application/x-etd-qualifier`; rebuttal-target resolution checks for qualifier near click; connector rendering branch for `Connection.to` resolving to a qualifier element (vertical line passes through, no arrowhead, reposition-me hint for invalid x-alignment) |
| `src/components/Canvas/shapes/ArgumentShape.tsx` | Branch: attached qualifier vs orphan qualifier vs non-qualifier; orphan dashed-red + ⚠ marker; auto-size for attached qualifier |
| `src/utils/orthogonalRouting.ts` | New helpers: `hitTestPolyline(point, polyline, tolerance)`, `tForPointOnPolyline(point, polyline)`, `pointOnPolylineAt(t, polyline)` (some may exist) |
| `src/components/Palette/Palette.tsx` | Qualifier button: drag payload `application/x-etd-qualifier`; remove click-to-create for qualifier; transient hint |
| `src/store/diagramStore.ts` | Cascade-delete on `removeConnection`; clear `attachedTo` on argumentType change; load-time orphan sweep in `loadDiagram` |
| `src/utils/svgExport.ts` | Match the new rendering for attached qualifier + rebuttal-to-qualifier line |
| `src/utils/diagramxExport.ts` | Drop `attachedTo`; render qualifier as standalone box; emit warning toast |
| Tests (`*.test.ts`) | Unit tests for: drop-onto-line position math, target resolution with/without qualifier, cascade delete, orphan sweep |

## 9. Acceptance criteria

- Drop a qualifier from Palette onto a connection line → qualifier appears at drop point, sized to text, sitting on the line.
- Drag the qualifier → it slides along the polyline; cursor outside the 40px band snaps it back.
- Drop the qualifier *off* any connection → toast rejection, no element created.
- Add a rebuttal in connect mode, target-click the connection at the qualifier's x → rebuttal's `to` is the qualifier id; rendered as vertical line from rebuttal down through qualifier to the connection line, no arrowhead.
- Same workflow for warrant or backing as source → also targets the qualifier (scope decision).
- Delete the parent connection → the attached qualifier(s) and any rebuttal/warrant targeting them are removed together; single undo restores all.
- Load a legacy 1.5 file with qualifier elements → they render as orphans with dashed red + ⚠ until the user drags one onto a connection.
- Load a file whose qualifier has `attachedTo.connectionId` pointing at a deleted connection → orphan-sweep on load clears `attachedTo`; renders as orphan.

## 10. Open questions deferred to implementation

- Exact `hitTestPolyline` tolerance (12px) and snap-back distance (40px) may need browser-tested tweaking.
- Whether orphan qualifiers need a Properties panel "attach to ..." dropdown (alternative to drag) — defer until we see if users find drag-only frustrating.
- DiagramMix export warning text — copy to be finalized during implementation.

## 11. Closes-open-items

- [[etd-anna-feedback-2026-05-24]] §1 (qualifier-on-connection) — covered
- [[etd-anna-feedback-2026-05-24]] §2 (rebuttal-to-qualifier) — covered
- Items §3 (multi-question subtypes), §4 (save-bundle misdiagnosis), §5 (dataclaim/warrantclaim derivation) already shipped earlier this session.
