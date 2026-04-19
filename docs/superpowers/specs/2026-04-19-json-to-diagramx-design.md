# ETD → DiagramMix `.diagramx` Export

**Date:** 2026-04-19
**Status:** Design approved, awaiting implementation plan

## Purpose

Let ETD users open ETD-created diagrams in DiagramMix on macOS. ETD is the source of truth for creation; DiagramMix is a secondary destination where researchers may want to continue editing or use features that ETD does not yet have.

The inverse direction already exists (`src/utils/drawingImporter.ts` + `scripts/convert-drawing.py` import DiagramMix → ETD). This spec covers the export direction.

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

## Implementation approach

In-app TypeScript export, matching the pattern used by the existing PNG/SVG/PDF/JSON exports:

- New file `src/utils/diagramxExport.ts` — pure function that takes the store's `elements[]` + `connections[]` and returns a serialized `.diagramx` JSON string.
- New toolbar button in `src/components/Toolbar/Toolbar.tsx` — wires up `handleExportDiagramx` with the same Blob-download pattern as `handleSave`.
- Reads the live Zustand state directly (no JSON parse step).
- Reuses `src/utils/colors.ts` as the single source of truth for contributor colors.

A Python CLI script (`scripts/json-to-diagramx.py`) is **not** part of this work. The user has no accumulated ETD JSON files to batch-convert, so the script would be unused infrastructure. If that changes later, the same mapping logic can be ported.

## Scope

Three levels, shipped incrementally. This spec covers **Level A only**. Levels B and C are noted so the Level A implementation leaves room for them.

### Level A — MVP (this spec)

Covers:

- **Argument elements** (data, claim, warrant, backing, qualifier, rebuttal) rendered as GraphicStyle rectangles with semantically-correct stroke color and dashed/solid border per contributor.
- **Teacher / student support elements** (Question, Other Support) rendered as rectangles with correct stroke + fill.
- **Info boxes** rendered as `_textbox` symbols (no border).
- **Connections** rendered as straight arrows between element edges.
- **Warrant-to-connection attachments** rendered as straight lines from the warrant element to a point computed along the target connection at the given `position` (0-1). Does not produce a true tee — the line touches the arrow but does not branch from it.
- **Implicit elements** and **action-type support** elements drawn as rectangles/ellipses-as-rectangles with correct colors; proper cloud / ellipse shapes deferred to Level C.
- **Attribution** already inlined in `content` by ETD convention; passed through unchanged into DiagramMix `text`.
- **Label** prefixed onto `text` as `"{label}\n\n{content}"` so the element visually shows "Claim 1" above its content — matches typical Conner-diagram presentation.
- **`templateReference`** block copied verbatim from the reference file so DiagramMix resolves the GraphicStyle pack. The user has this pack installed.

### Level B — warrant tees (next spec)

Produce T-intersection connectors where a warrant stem joins a data→claim arrow perpendicularly, grouped so DiagramMix treats them as a unit. This mirrors the import-side `extract_tee_connectors` logic in reverse. Requires discovering how `.diagramx` encodes grouped/tee connectors (the reference file does not contain a tee example) — plan: create one in DiagramMix, save, inspect.

### Level C — shapes + media (later spec)

- Cloud shape for Implicit elements
- Ellipse for Teacher Action
- Rounded rectangle for Question / Other Support
- Images embedded from ETD `element.image` (base64)

Each requires discovering the relevant GraphicStyle `symbolId` or image-embedding schema by producing a sample in DiagramMix and inspecting the saved `.diagramx`.

## Color mapping

Source of truth is `src/utils/colors.ts` (already aligned with `docs/REQUIREMENTS.md` Appendix A). The exporter uses `getContributorColor()` and `getSupportColors()` directly. Hex → rgba 0-1 floats for the `.diagramx` `color` objects via a small local helper.

| ETD element | Stroke source | Line type | Fill |
|---|---|---|---|
| argument, contributor=given | `getContributorColor('given')` | solid | none |
| argument, contributor=student | `getContributorColor('student')` | dashed | none |
| argument, contributor=joint | `getContributorColor('joint')` | dashed | none |
| argument, contributor=implicit | `getContributorColor('implicit')` | solid | none (cloud shape deferred) |
| argument, contributor=teacher | `getContributorColor('teacher')` | solid | none |
| support/teacherSupport, supportType=action | `getSupportColors('action', contributor).border` | solid | none (ellipse deferred) |
| support/teacherSupport, supportType=question | `getSupportColors('question').border` | solid | `getSupportColors('question').fill` |
| support/teacherSupport, supportType=other | `getSupportColors('other').border` | solid | `getSupportColors('other').fill` |
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

`src/utils/diagramxExport.ts`:

```ts
export function exportToDiagramx(
  elements: DiagramElement[],
  connections: Connection[],
  diagramName: string
): string
```

Internal helpers (module-private):

- `hexToRgba(hex: string): { r: number; g: number; b: number; a: number }` — `"#228B22"` → `{r:0.133, g:0.545, b:0.133, a:1}`
- `getElementStyle(element)` → `{ stroke, lineType, fill, colorSchemeId, symbolId }` driven by the color-mapping table and `colors.ts` helpers
- `buildSymbolItem(element)` → `{ symbol: { _0: {...} } }` with `frame`, `text`, `textStyle`, `symbolId`, `stroke`, `contourStyle`, `fill`, `stickySpots`, `id.uuid`, `colorSchemeId`
- `buildConnectorItem(connection, elementsById, connectionsById)` → `{ connector: { _0: {...} } }`. For `to` as element ID: compute nearest-edge-midpoint pair between source and target. For `to` as `ConnectionTarget`: compute the point along the referenced connection at `position ∈ [0,1]` and use as endpoint.
- `buildPathData(points: [number, number][]): string` — base64-encode `JSON.stringify({isClosed: false, nodes: points.map(p => ({position: p}))})`
- `buildLayer(itemUuids: string[])` → layer object matching reference-file defaults
- `buildTemplateReference()` → GraphicStyle templateReference object, copied verbatim
- Default constants (extracted from the reference file): `DEFAULT_TEXT_STYLE`, `DEFAULT_STICKY_SPOTS`, `DEFAULT_CONNECTOR_STYLE`, `DEFAULT_PRINT_SETTINGS`, `DEFAULT_MODEL_SETTINGS`, `RECTANGLE_SYMBOL_ID = "DC1D4341-F0D2-4524-81EC-6061602C6C3A"`, `TEXTBOX_SYMBOL_ID = "_textbox"`

UUID generation: use `crypto.randomUUID()` (available in all browsers ETD supports).

## Toolbar wiring

`src/components/Toolbar/Toolbar.tsx` additions:

```ts
const handleExportDiagramx = () => {
  const content = exportToDiagramx(elements, connections, diagramName);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${toFilename(diagramName)}.diagramx`;
  a.click();
  URL.revokeObjectURL(url);
};
```

Button placement: in the existing Export group, next to SVG/PDF buttons. Icon: reuse an existing Lucide icon (e.g. `FileDown` or `Share2`) — final pick during implementation.

## ETD → DiagramMix data flow

```
ETD element              → symbol item
  position {x,y}           → frame[0]
  size {w,h}               → frame[1]
  content                  → appended after label into text
  label                    → prefixed into text as "{label}\n\n{content}"
  contributor/supportType  → stroke color, lineType, fill, colorSchemeId (via colors.ts)
  attribution              → already inlined in content by ETD convention, no extra handling
  image                    → dropped (Level C)

ETD connection           → connector item
  from (element id)        → resolve via elementsById, compute fromPoint
  to (element id)          → resolve via elementsById, compute toPoint
  to (ConnectionTarget)    → resolve referenced connection via connectionsById, compute point at position, use as toPoint
```

## Items array ordering

Match the reference file's pattern — each logical item appears twice:

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

Primary: live round-trip in the browser using Claude for Chrome (per CLAUDE.md):

1. Open ETD dev server.
2. Build a small diagram covering each contributor type and at least one warrant attachment.
3. Click the new "Export to DiagramMix" button.
4. Open the downloaded `.diagramx` in DiagramMix. Verify:
   - All elements present, correct positions
   - Stroke colors match spec per contributor
   - Dashed borders render dashed (not dotted, not solid)
   - Connection arrows point the right direction
   - Warrant attachments visually land on the target arrow (imperfect for Level A; acceptable)
5. Re-save from DiagramMix and confirm the file is not corrupted.

Secondary: `npm run typecheck` + `npm run lint` pass.

No automated unit tests for Level A. If the module grows (Level B/C), add vitest coverage for `hexToRgba`, `buildPathData`, and connection endpoint geometry.

## Known limitations (explicit, not bugs)

- Warrant attachments are straight lines, not true tee connectors. Visible only to someone looking closely; addressed in Level B.
- Implicit elements are rectangles, not clouds. Addressed in Level C.
- Action-type support elements are rectangles, not ellipses. Addressed in Level C.
- Question / Other Support are hard-corner rectangles, not rounded. Addressed in Level C.
- Embedded images drop. Addressed in Level C.
- Output depends on the GraphicStyle notation pack being available in the user's DiagramMix install.

## Open questions

1. **Connection endpoint geometry:** For `from` → `to` both being elements, the simplest approach is source-right-edge midpoint → target-left-edge midpoint. For non-horizontal layouts this looks wrong. A smarter approach picks the nearest edge midpoint pair. Default to nearest-edge-midpoint.

2. **DiagramMix JSON key ordering:** The reference file has alphabetically-ordered keys within each object. `JSON.stringify` preserves insertion order and has no `sortKeys` option. Options: (a) build all objects with alphabetical key order in code; (b) post-process with a custom replacer that sorts. Default to (a) — straightforward, keeps diffs stable, no reflection magic.

## Deployment note

Per CLAUDE.md, after this ships we must mirror the build to the `jenkleiman.com` repo at `public/tools/etd/`. The implementation plan should include that step.

## Out of scope for this spec

- Python CLI script (no legacy JSON files to batch-convert)
- Level B (tee connectors)
- Level C (cloud / ellipse / rounded / images)
- Round-trip fidelity beyond "opens cleanly and is structurally correct"
