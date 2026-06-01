// Puffy "thought-cloud" path generator for implicit-element clouds.
// Used by both the Konva canvas (ArgumentShape.CloudShape) and SVG export.
//
// Each bump is a FAT, overhanging lobe: an arc whose apex bulges all the way
// out to the bounding box while its two endpoints (valleys) sit on an inset
// rectangle. Because the apex height (the inset) is comparable to the lobe
// width, the arc sweeps past 180° (the SVG large-arc flag), giving the rounded,
// overlapping look of a cartoon thought cloud rather than shallow scallops.
//
// Geometry per lobe (apex bulges `inset` out from a chord of length c):
//   radius R = (c²/4 + inset²) / (2·inset)
// With that R the arc's farthest point is exactly `inset` beyond the chord, so
// every apex lands precisely on the bounding-box edge. large-arc = inset > c/2.

export const INSET_FACTOR = 0.16;      // cloud "puffiness" depth as fraction of short side
export const INSET_MIN = 7;
export const INSET_MAX = 18;
export const LOBE_TARGET_FACTOR = 1.5; // target lobe width ≈ this × inset (keeps lobes fat)
export const MIN_LOBES = 2;
export const MAX_LOBES = 12;

// Fixed, deterministic width multipliers so lobes vary gently (organic look)
// without any randomness — keeps canvas and SVG output identical and testable.
const LOBE_WEIGHTS = [1, 0.85, 1.12, 0.92, 1.06, 0.9];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface CloudGeometry {
  inset: number;
  topLobes: number;
  bottomLobes: number;
  leftLobes: number;
  rightLobes: number;
  totalLobes: number;
}

export function computeCloudGeometry(width: number, height: number): CloudGeometry {
  const shortSide = Math.min(width, height);
  const inset = clamp(shortSide * INSET_FACTOR, INSET_MIN, INSET_MAX);

  const innerW = Math.max(width - 2 * inset, 1);
  const innerH = Math.max(height - 2 * inset, 1);
  const lobeTarget = LOBE_TARGET_FACTOR * inset;

  const topLobes = clamp(Math.round(innerW / lobeTarget), MIN_LOBES, MAX_LOBES);
  const sideLobes = clamp(Math.round(innerH / lobeTarget), MIN_LOBES, MAX_LOBES);

  return {
    inset,
    topLobes,
    bottomLobes: topLobes,
    leftLobes: sideLobes,
    rightLobes: sideLobes,
    totalLobes: 2 * (topLobes + sideLobes),
  };
}

interface Point {
  x: number;
  y: number;
}

const fmt = (n: number): number => Number(n.toFixed(3));

// Emit `n` lobe arcs walking the straight inner-rect edge from `start` to `end`.
// sweep=1 with the clockwise corner walk makes every lobe bulge outward.
function emitEdge(parts: string[], start: Point, end: Point, n: number, inset: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const edgeLen = Math.hypot(dx, dy);
  const ux = dx / edgeLen;
  const uy = dy / edgeLen;

  let weightSum = 0;
  for (let i = 0; i < n; i++) weightSum += LOBE_WEIGHTS[i % LOBE_WEIGHTS.length];

  let acc = 0;
  let prev = start;
  for (let i = 0; i < n; i++) {
    acc += LOBE_WEIGHTS[i % LOBE_WEIGHTS.length];
    const cur: Point =
      i === n - 1
        ? end // pin the final endpoint exactly to the corner (avoids fp drift)
        : { x: start.x + ux * (edgeLen * acc) / weightSum, y: start.y + uy * (edgeLen * acc) / weightSum };

    const c = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const radius = (c * c / 4 + inset * inset) / (2 * inset);
    const largeArc = inset > c / 2 ? 1 : 0;
    parts.push(`A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc} 1 ${fmt(cur.x)} ${fmt(cur.y)}`);
    prev = cur;
  }
}

export function generateCloudPath(width: number, height: number): string {
  const { inset, topLobes, bottomLobes, leftLobes, rightLobes } = computeCloudGeometry(width, height);

  // Inset-rectangle corners (valley line). Apexes bulge `inset` out to the bbox.
  const tl: Point = { x: inset, y: inset };
  const tr: Point = { x: width - inset, y: inset };
  const br: Point = { x: width - inset, y: height - inset };
  const bl: Point = { x: inset, y: height - inset };

  const parts: string[] = [`M ${fmt(tl.x)} ${fmt(tl.y)}`];
  emitEdge(parts, tl, tr, topLobes, inset);    // top edge → bulges up
  emitEdge(parts, tr, br, rightLobes, inset);  // right edge → bulges right
  emitEdge(parts, br, bl, bottomLobes, inset); // bottom edge → bulges down
  emitEdge(parts, bl, tl, leftLobes, inset);   // left edge → bulges left
  parts.push('Z');

  return parts.join(' ');
}
