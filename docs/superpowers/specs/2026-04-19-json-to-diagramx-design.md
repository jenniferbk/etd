# ETD JSON → DiagramMix `.diagramx` Export

**Date:** 2026-04-19
**Status:** Design approved, awaiting implementation plan

## Purpose

Let ETD users open ETD-created diagrams in DiagramMix on macOS. ETD is the source of truth for creation; DiagramMix is a secondary destination where researchers may want to continue editing or use features that ETD does not yet have.

The inverse direction already exists (`scripts/convert-drawing.py` imports DiagramMix → ETD). This spec covers the export direction.

## Format

DiagramMix's current document format, `.diagramx`, is pretty-printed JSON (not the older NSKeyedArchiver binary plist `.drawing` format). Structural reference: `/Users/jenniferkleiman/Downloads/SCsimplediagram.diagramx`.

Key observations from the reference file:

- Top level: `activeTabIndex`, `printSettings`, `tabs[]`, `templateReference`
- `tabs[0].model.items[]` is a flat array that alternates between `{"uuid": "..."}` entries and full `{"symbol": {"_0": {...}}}` / `{"connector": {"_0": {...}}}` entries. Each logical item appears twice in this array: once as a UUID-only reference, once as a full definition.
- `tabs[0].model.layers[0].itemIDs[]` lists UUIDs of items on that layer.
- Symbols have `frame: [[x,y], [w,h]]`, `text`, `textStyle`, `symbolId`, `stroke.color` (rgba 0-1), `colorSchemeId`, `contourStyle.lineType` ("solid" / "dashed"), `stickySpots[]` (anchor points), `fill`.
- `symbolId: "_textbox"` is a built-in plain text box. The reference file also uses `symbolId: "DC1D4341-F0D2-4524-81EC-6061602C6C3A"` — a rectangle from the GraphicStyle notation pack.
- Connectors have `fromPoint`, `toPoint`, `pathData` (base64-encoded JSON of `{"isClosed":false,"nodes":[{"position":[x,y]},...]}`), `connectorStyle`, `stroke`, `startAttachment`/`endAttachment` (typically `{"free": {"point": [x,y]}}`), arrow-size fields, `routingMode: "straight"`.
- `templateReference` at document bottom identifies the GraphicStyle pack.

Coordinates are in points with origin top-left, matching ETD's coordinate convention.

## Scope

Three levels, shipped incrementally. This spec covers **Level A only**. Levels B and C are noted so the Level A implementation leaves room for them.

### Level A — MVP (this spec)

Deliverable: `scripts/json-to-diagramx.py`, CLI identical in spirit to `convert-drawing.py`.

```
python scripts/json-to-diagramx.py input.json [output.diagramx]
```

Covers:

- **Argument elements** (data, claim, warrant, backing, qualifier, rebuttal) rendered as GraphicStyle rectangles with semantically-correct stroke color and dashed/solid border per contributor.
- **Teacher support elements** (Question, Other Support) rendered as rectangles with correct stroke + fill.
- **Info boxes** rendered as `_textbox` symbols (no border).
- **Connections** rendered as straight arrows between element edges.
- **Warrant-to-connection attachments** rendered as straight lines from the warrant element to a point computed along the target connection at the given `position` (0-1). This does not produce a true tee — the line touches the arrow but does not branch from it.
- **Implicit elements** and **Teacher Action** elements drawn as rectangles with correct colors; proper cloud / ellipse shapes deferred to Level C.
- **Attribution** already inlined in `content` by ETD convention (timestamps prepended during import); passed through unchanged into DiagramMix `text`.
- **Label** prefixed onto `text` as `"{label}\n\n{content}"` so the element visually shows "Claim 1" above its content — matches typical Conner-diagram presentation.
- **`templateReference`** block copied verbatim from the reference file so DiagramMix resolves the GraphicStyle pack. The user has this pack installed (confirmed via the reference file origin).

### Level B — warrant tees (next spec)

Produce T-intersection connectors where a warrant stem joins a data→claim arrow perpendicularly, grouped so DiagramMix treats them as a unit. This mirrors the import-side `extract_tee_connectors` logic in reverse. Requires discovering how `.diagramx` encodes grouped/tee connectors (the reference file does not contain a tee example).

### Level C — shapes + media (later spec)

- Cloud shape for Implicit elements
- Ellipse for Teacher Action
- Rounded rectangle for Question / Other Support
- Images embedded from ETD `element.image` (base64) into DiagramMix

Each of these requires discovering the relevant GraphicStyle `symbolId` or image-embedding schema by producing a sample in DiagramMix and inspecting the saved `.diagramx`.

## Color mapping

From `docs/REQUIREMENTS.md` Appendix A. Hex → rgba 0-1 floats for the `.diagramx` `color` objects.

| ETD element | Stroke | Line type | Fill |
|---|---|---|---|
| argument, contributor=given | #228B22 | solid | none |
| argument, contributor=student | #0000CD | dashed | none |
| argument, contributor=joint | #800080 | dashed | none |
| argument, contributor=implicit | #000000 | solid | none (cloud shape deferred) |
| argument, contributor=teacher | #CC0000 | solid | none |
| teacherSupport / support, supportType=action | #CC0000 | solid | none (ellipse deferred) |
| teacherSupport / support, supportType=question | #00CED1 | solid | #E0FFFF |
| teacherSupport / support, supportType=other | #DAA520 | solid | #FFFACD |
| infoBox | none (transparent) | — | none |

`colorSchemeId` set to the inverse of `convert-drawing.py`'s mapping so round-trips are stable:

| Contributor | colorSchemeId |
|---|---|
| given | 1 |
| teacher | 2 |
| joint | 3 |
| implicit | 4 |
| student | 10 |

## Module shape

`scripts/json-to-diagramx.py`:

- `load_etd_json(path)` — parse ETD JSON, return dict
- `hex_to_rgba(hex_str)` — `"#228B22"` → `{"r": 0.133, "g": 0.545, "b": 0.133, "a": 1}`
- `get_element_style(element)` → returns `{stroke_rgba, line_type, fill_rgba, color_scheme_id, symbol_id}` based on the color mapping table
- `build_symbol(element, style)` → `{"symbol": {"_0": {...}}}` dict; sets `frame`, `text`, `textStyle`, `symbolId`, `stroke`, `contourStyle`, `fill`, `stickySpots`, `id.uuid`, `colorSchemeId`
- `build_connector(connection, elements_by_id, connections_by_id)` → `{"connector": {"_0": {...}}}` dict. For `to` as element ID, compute midpoint of source element's right edge and target element's left edge (or use edge-to-edge nearest-point heuristic). For `to` as `ConnectionTarget`, compute the point along the referenced connection at `position ∈ [0,1]` and use that as the endpoint.
- `build_path_data(points)` → base64-encoded JSON of `{"isClosed": false, "nodes": [{"position": [x, y]}, ...]}`
- `build_layer(item_uuids)` → layer dict with default values matching the reference file
- `build_template_reference()` → returns the GraphicStyle `templateReference` object, copied verbatim
- `assemble_document(symbol_items, connector_items)` → top-level dict. Emits items array with paired `{"uuid": ...}` + full-definition entries, in the order observed in the reference file
- `main()` — CLI, `json.dump(doc, f, indent=2)`

Constants file (or top-of-module dict) for: `_textbox` vs rectangle `symbolId`, default `stickySpots`, default `textStyle`, default `connectorStyle`, `printSettings`, `settings` block. Values copied from the reference file.

## ETD → DiagramMix data flow

```
ETD element              → symbol item
  position {x,y}           → frame[0]
  size {w,h}               → frame[1]
  content                  → text
  contributor/supportType  → stroke color, lineType, fill, colorSchemeId
  label                    → prefixed into text as "{label}\n\n{content}"
  attribution              → already inlined in content per import convention, no extra handling
  image                    → dropped (Level C)

ETD connection           → connector item
  from (elem id)           → resolve to source element, compute fromPoint
  to (elem id)             → resolve to target element, compute toPoint
  to (ConnectionTarget)    → resolve referenced connection, compute point at position, use as toPoint
```

## Items array ordering

Match the reference file's pattern:

```
items: [
  {uuid: A}, {symbol: {_0: {id: A, ...}}},
  {uuid: B}, {symbol: {_0: {id: B, ...}}},
  {uuid: C}, {connector: {_0: {id: C, ...}}},
  ...
]
```

Order within the array: emit all symbols first, then all connectors. Layer `itemIDs` lists symbols in emit order followed by connectors.

## Test approach

One manual round-trip verification:

1. Create a small diagram in ETD covering each contributor type and at least one warrant attachment.
2. Save ETD JSON.
3. Run `json-to-diagramx.py`.
4. Open output in DiagramMix. Verify:
   - All elements present, correct positions
   - Stroke colors match spec per contributor
   - Dashed borders render dashed (not dotted, not solid)
   - Connection arrows point the right direction
   - Warrant attachments visually land on the target arrow (imperfect for Level A; acceptable)
5. Re-save from DiagramMix and confirm the file is not corrupted.

No automated Python unit tests for Level A. If the script grows (Level B/C), add pytest coverage for the geometry helpers (`build_path_data`, connection endpoint computation, hex-to-rgba).

## Known limitations (explicit, not bugs)

- Warrant attachments are straight lines, not true tee connectors. Visible only to someone looking closely; addressed in Level B.
- Implicit elements are rectangles, not clouds. Addressed in Level C.
- Teacher Action elements are rectangles, not ellipses. Addressed in Level C.
- Question / Other Support are hard-corner rectangles, not rounded. Addressed in Level C.
- Embedded images drop. Addressed in Level C.
- Output depends on the GraphicStyle notation pack being available in the user's DiagramMix install.

## Open questions

1. **Connection endpoint geometry:** For `from` → `to` both being elements, the simplest approach is source-right-edge midpoint → target-left-edge midpoint. If elements are arranged non-horizontally this looks wrong. A smarter approach picks the nearest edge midpoint pair. Default to nearest-edge-midpoint.

2. **DiagramMix JSON key ordering:** The reference file has alphabetically-ordered keys within each object. Python's `json.dump` preserves dict insertion order. Either build dicts in alphabetical order to match, or use `sort_keys=True` on output. Default to `sort_keys=True` for stable diffs.

## Out of scope for this spec

- In-app TypeScript export button (planned, but confirm Python output opens cleanly first)
- Level B (tee connectors)
- Level C (cloud / ellipse / rounded / images)
- Round-trip fidelity beyond "opens cleanly and is structurally correct"
