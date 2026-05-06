# Text-friendly implicit cloud shape

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation plan
**Origin:** Anna's 2026-04-27 feedback queue (item 5) — the implicit-element cloud should be a wider-than-tall scalloped rectangle so text flows naturally, not a circular bump arrangement that locks aspect ratio and squeezes text.

## Problem

The current implicit-element cloud renderer (`src/components/Canvas/shapes/ArgumentShape.tsx:267` `generateThoughtBubblePath`) builds an ellipse and modulates it with `Math.abs(Math.cos(bumpPhase))`. The base ellipse scales with `width × height`, but bumps are spaced evenly *in angle*, so on a wide rectangle (the default size is 140×60) the bumps cluster at the long-axis ends instead of distributing along the sides. The shape reads as round rather than rectangular, and the inset elliptical boundary curves inward — squeezing usable text width.

REQUIREMENTS.md §2.2 specifies "Cloud/Thought bubble" without mandating circular geometry, so the spec already permits a rectangular scalloped form.

## Goals

- Implicit clouds render as a scalloped rectangle that follows the element's actual `width × height`, with text-friendly interior space.
- The rule scales gracefully across resizes (default 140×60, square, tall, small).
- One geometry generator drives both the Konva canvas render and the SVG export — eliminating the existing rounded-rectangle stand-in in `svgExport.ts`.

## Non-goals

- Touching the Legend swatch renderer (`Legend.tsx` `generateCloudPoints`). The swatch is 30×16 — too small for the adaptive rule to look right, and the existing simplified renderer already reads as a cloud at swatch size.
- A configurable bump-count or bump-radius dial. Tunable constants live in code; future style-config work can promote them to UI if needed.
- Animation of the cloud shape.

## Design

### Geometry rule

A pure function:

```ts
// src/utils/cloudPath.ts
export function generateCloudPath(width: number, height: number): string;
```

Returns an SVG path-data string of the form `"M x y A r r 0 0 1 x y A r r 0 0 1 x y ... Z"` — a closed polyline of outward arcs (no inward cusps).

Algorithm:

1. **Identify short and long sides.**
   ```
   shortLen = min(width, height)
   longLen  = max(width, height)
   isWide   = width >= height
   ```

2. **Bump count per side (adaptive, with floor and ceiling).**
   ```
   TARGET_ARC = 20            // ~one bump per 20px of side
   MIN_LONG = 4, MAX_LONG = 12
   MIN_SHORT = 1, MAX_SHORT = 4

   longBumps  = clamp(round(longLen / TARGET_ARC),       MIN_LONG,  MAX_LONG)
   shortBumps = clamp(round(shortLen / TARGET_ARC * 0.5), MIN_SHORT, MAX_SHORT)
   ```
   The `* 0.5` factor on the short side keeps short-side bumps fewer/bigger than long-side bumps — this is the "D" character (asymmetric: bigger bumps on shorter sides).

3. **Bump radius per side.**
   ```
   longRadius  = longLen  / (2 * longBumps)
   shortRadius = shortLen / (2 * shortBumps)
   ```
   At default 140×60: long sides get ~7 bumps of radius ~10; short sides get ~2 bumps of radius ~15.

4. **Bounding-box inset and corner handling.**
   Each side's bump apex lies on (or very near) its corresponding bbox edge. Achieved by insetting the interior rectangle on each side by that side's bump radius.

   **Corner geometry — open question for implementation plan:** the perpendicular sides at each corner have different bump radii (`longRadius` vs `shortRadius`), so the chords don't meet flush. The implementation plan picks one of:
   - **(a)** Use a uniform corner inset = `max(longRadius, shortRadius)` and shrink each side's available bump-track length accordingly. Bump counts/radii recomputed against the available track. Slight visual "shoulder" at each corner (a small flat or quarter-arc connector).
   - **(b)** Allow bump arcs to overshoot the bbox by 1–3px at the corners. Connector attachment uses the element's `width × height` (not the actual path bbox), so functional overshoot is harmless.

   Both approaches preserve the visual character. Default recommendation in the plan is (a) for cleaner SVG export bbox; (b) is fallback if (a)'s math gets gnarly.

   Either way: the cloud's *element* still occupies exactly `width × height` pixels for hit-testing and connector attachment. The path's *visual* bbox is within (width × height) ± a few px.

5. **Walk the perimeter and emit arc commands.**
   Start at the top-left corner of the inset rectangle. Emit one arc per bump along each side, going clockwise: top → right → bottom → left, closing with `Z`.

   In the **wide case (`isWide`)**: top and bottom are the long sides (use `longBumps`, `longRadius`); left and right are the short sides (use `shortBumps`, `shortRadius`).

   In the **tall case (`!isWide`)**: top and bottom are the short sides (use `shortBumps`, `shortRadius`); left and right are the long sides (use `longBumps`, `longRadius`).

   The traversal direction is always clockwise from top-left regardless of orientation; only the per-side bump count and radius swap.

### Edge cases

- **Square aspect ratio (`width === height`):** rule degenerates symmetrically — all four sides identical. Fine.
- **Tall cloud (`height > width`):** rule flips orientation automatically. Top/bottom become the short sides (bigger bumps), left/right become the long sides. Visually consistent with the wide case. The rule applies regardless of orientation by design — Anna's diagrams are wider-than-tall in practice, but the renderer doesn't enforce that.
- **Very small sizes (e.g. 60×30):** floor kicks in: 4 bumps per long side, 1 per short side, both at smaller radii. Pinched but legible. Sizes below ~40×20 are not a target — the legend swatch (30×16) uses its own renderer.
- **Very large sizes (e.g. 400×100):** ceiling caps long-side bumps at 12 to prevent the shape from becoming a fine-toothed comb.

### Selection outline

Konva.Path doesn't allow per-point manipulation, so the current trick of pushing every point ±5 from center doesn't apply. The selection outline must be the *same shape* as the cloud, just visually expanded — if we re-call `generateCloudPath` with `width + 10`, the larger size could land in a different bump-count bracket and produce a different number of bumps than the underlying cloud, which would look wrong.

Use a Konva scale transform on the same path data instead:

```tsx
const SELECTION_INFLATE = 0.08;  // ~8% larger in each dimension
<Path data={cloudPath}
      scaleX={1 + SELECTION_INFLATE}
      scaleY={1 + SELECTION_INFLATE}
      x={-width * SELECTION_INFLATE / 2}
      y={-height * SELECTION_INFLATE / 2}
      stroke="#4A90D9" dash={[5, 3]} strokeWidth={2} fill="" />
```

Same path data → same bump count and pattern, just scaled outward and centered on the original.

### Text padding

`ArgumentShape.tsx:48` currently sets `padding = isCloud ? 18 : 10` because the elliptical boundary curves inward. With the new shape the bumps arc outward and the usable interior is roughly the inset rectangle (full `width × height` minus one bump radius per side). Reduce cloud padding from 18 → 12. Text gains ~12px horizontal room — the whole point of this work.

### Konva render details

Drop `tension={0.2}`, `lineCap="round"`, `lineJoin="round"` from the cloud render — Konva.Path renders SVG arcs as mathematically smooth curves, no smoothing needed. Keep `closed`-equivalent behavior via the `Z` in the path string.

### SVG export

Replace `src/utils/svgExport.ts:150–154` (the rounded-rect stand-in with the apologetic comment):

```ts
const cloudPath = generateCloudPath(width, height);
shapeElement = `<path d="${cloudPath}" transform="translate(${x},${y})"
  fill="${style.backgroundColor}" stroke="${style.borderColor}"
  stroke-width="${style.borderWidth}" ${dashAttr} />`;
```

Same generator drives canvas and SVG. Exported research diagrams now show real clouds.

## Files

- **NEW** `src/utils/cloudPath.ts` — `generateCloudPath(width, height): string`. Exports tunable constants (`TARGET_ARC`, `MIN_LONG`, `MAX_LONG`, `MIN_SHORT`, `MAX_SHORT`, `SHORT_BUMP_FACTOR = 0.5`).
- **NEW** `src/utils/cloudPath.test.ts` — unit tests (see below).
- `src/components/Canvas/shapes/ArgumentShape.tsx` — replace `generateThoughtBubblePath` and the `<Line>` inside `CloudShape` with `<Path data={generateCloudPath(width, height)}>`. Adjust selection outline. Drop cloud padding from 18 → 12.
- `src/utils/svgExport.ts` — replace the rounded-rect cloud branch (lines 150–154) with a real `<path>` element using the shared generator. Delete the apologetic comment.
- `src/components/Canvas/shapes/Legend.tsx` — untouched.

## Testing

### Unit tests (`cloudPath.test.ts`)

- `generateCloudPath(140, 60)` returns a non-empty string starting with `M` and ending with `Z`.
- Arc-command count equals `2 * (longBumps + shortBumps)` for: default 140×60, square 80×80, tall 60×140, small 60×30, large 400×100.
- Floor enforced: at 60×30, long-side bumps = 4, short-side bumps = 1.
- Ceiling enforced: at 400×100, long-side bumps = 12.
- Orientation symmetry: `generateCloudPath(60, 140)` and `generateCloudPath(140, 60)` produce structurally equivalent paths (same total arc count, mirrored geometry).
- Bbox containment: the path's bounding box (computed by walking the path's M/A commands) lies within `[0, width] × [0, height]` ± 3px (loose tolerance to accommodate corner approach (b) — the implementation plan tightens this to floating-point tolerance if it picks corner approach (a)).

### Manual verification (browser)

After implementation, run the dev server and confirm:

- Default 140×60 implicit element matches the "D, density 4 (adaptive)" mockup.
- Resize to tall (50×120) — bumps flip orientation cleanly.
- Resize to square (90×90) — balanced, not visually broken.
- Resize to small (60×30) — pinched but legible.
- Connect a warrant or data arrow to a cloud — endpoint lands at the bbox edge as before (no regression from the inset change).
- Export the diagram to SVG, open the SVG file in a browser — cloud renders as a real scalloped shape, not a rounded rectangle.
- Legend swatch is unchanged.

## Tunable parameters (post-ship dials)

These live as named constants in `cloudPath.ts` and can be adjusted without touching call sites:

- `TARGET_ARC = 20` — pixels of side per bump (lower = more bumps, finer texture).
- `SHORT_BUMP_FACTOR = 0.5` — multiplier for short-side bump count (lower = even fewer/bigger bumps, more "D" character; 1.0 = symmetric).
- `MIN_LONG`, `MAX_LONG`, `MIN_SHORT`, `MAX_SHORT` — clamps for graceful degradation at extremes.

If Anna pushes back on the look during the next review, tweak these and re-render — no architectural change needed.
