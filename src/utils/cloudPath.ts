// Adaptive scalloped-rectangle path generator for implicit-element clouds.
// Used by both the Konva canvas (ArgumentShape.CloudShape) and SVG export.

export const TARGET_ARC = 20;          // ~ pixels of side per bump
export const MIN_LONG = 4;
export const MAX_LONG = 12;
export const MIN_SHORT = 1;
export const MAX_SHORT = 4;
export const SHORT_BUMP_FACTOR = 0.5;  // short side gets fewer bumps than long side
export const MIN_BUMP_RADIUS = 2;      // safety floor for extreme aspect ratios

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface CloudGeometry {
  longBumps: number;
  shortBumps: number;
  longRadius: number;
  shortRadius: number;
  isWide: boolean;
}

export function computeCloudGeometry(width: number, height: number): CloudGeometry {
  const isWide = width >= height;
  const longLen = Math.max(width, height);
  const shortLen = Math.min(width, height);

  const longBumps = clamp(
    Math.round(longLen / TARGET_ARC),
    MIN_LONG,
    MAX_LONG,
  );
  const shortBumps = clamp(
    Math.round((shortLen / TARGET_ARC) * SHORT_BUMP_FACTOR),
    MIN_SHORT,
    MAX_SHORT,
  );

  // Solve so each bump's apex lies on the bbox edge and adjacent sides' chord
  // endpoints meet exactly at the inset rectangle corners.
  //   2 * longBumps  * longRadius  + 2 * shortRadius = longLen
  //   2 * longRadius + 2 * shortBumps * shortRadius  = shortLen
  const denom = 2 * (longBumps * shortBumps - 1);
  let longRadius = (shortBumps * longLen - shortLen) / denom;
  let shortRadius = (longBumps * shortLen - longLen) / denom;

  // Floor for extreme aspect ratios where shortRadius would otherwise go
  // negative (longLen / shortLen > ~longBumps in the worst case).
  longRadius = Math.max(longRadius, MIN_BUMP_RADIUS);
  shortRadius = Math.max(shortRadius, MIN_BUMP_RADIUS);

  return { longBumps, shortBumps, longRadius, shortRadius, isWide };
}

export function generateCloudPath(width: number, height: number): string {
  const { longBumps, shortBumps, longRadius, shortRadius, isWide } =
    computeCloudGeometry(width, height);

  // Map orientation onto the four sides.
  // Wide: top/bottom = long, left/right = short.
  // Tall: top/bottom = short, left/right = long.
  const topBumps   = isWide ? longBumps  : shortBumps;
  const topRadius  = isWide ? longRadius : shortRadius;
  const sideBumps  = isWide ? shortBumps : longBumps;
  const sideRadius = isWide ? shortRadius : longRadius;

  // Inset rectangle: corners are where adjacent sides' chord-levels meet.
  const left   = sideRadius;
  const right  = width - sideRadius;
  const top    = topRadius;
  const bottom = height - topRadius;

  const fmt = (n: number) => Number(n.toFixed(3));
  const parts: string[] = [];
  parts.push(`M ${fmt(left)} ${fmt(top)}`);

  // Top edge: arcs going right.
  for (let i = 0; i < topBumps; i++) {
    const x = left + (i + 1) * 2 * topRadius;
    parts.push(`A ${fmt(topRadius)} ${fmt(topRadius)} 0 0 1 ${fmt(x)} ${fmt(top)}`);
  }
  // Right edge: arcs going down.
  for (let i = 0; i < sideBumps; i++) {
    const y = top + (i + 1) * 2 * sideRadius;
    parts.push(`A ${fmt(sideRadius)} ${fmt(sideRadius)} 0 0 1 ${fmt(right)} ${fmt(y)}`);
  }
  // Bottom edge: arcs going left.
  for (let i = 0; i < topBumps; i++) {
    const x = right - (i + 1) * 2 * topRadius;
    parts.push(`A ${fmt(topRadius)} ${fmt(topRadius)} 0 0 1 ${fmt(x)} ${fmt(bottom)}`);
  }
  // Left edge: arcs going up.
  for (let i = 0; i < sideBumps; i++) {
    const y = bottom - (i + 1) * 2 * sideRadius;
    parts.push(`A ${fmt(sideRadius)} ${fmt(sideRadius)} 0 0 1 ${fmt(left)} ${fmt(y)}`);
  }

  parts.push('Z');
  return parts.join(' ');
}
