// Pure geometry for orthogonal (Manhattan) connector routing.
// No React or Konva imports — these are unit-testable functions.

import type { DiagramElement, Position, Connection, EdgeAnchor } from '../types';

export type SegmentOrientation = 'horizontal' | 'vertical';

export interface Segment {
  start: Position;
  end: Position;
  orientation: SegmentOrientation;
}

function getCenter(el: DiagramElement): Position {
  return {
    x: el.position.x + el.size.width / 2,
    y: el.position.y + el.size.height / 2,
  };
}

export function resolveAnchor(el: DiagramElement, anchor: EdgeAnchor): Position {
  const left = el.position.x;
  const right = el.position.x + el.size.width;
  const top = el.position.y;
  const bottom = el.position.y + el.size.height;
  const t = Math.max(0, Math.min(1, anchor.t));
  switch (anchor.edge) {
    case 'left':   return { x: left,                       y: top + t * el.size.height };
    case 'right':  return { x: right,                      y: top + t * el.size.height };
    case 'top':    return { x: left + t * el.size.width,   y: top };
    case 'bottom': return { x: left + t * el.size.width,   y: bottom };
  }
}

// Rule 1 routing: when source is a `data` argument and target is a `claim`,
// AND target's center falls inside the source's vertical or horizontal extent,
// AND target is fully to one side of source — return a single straight 2-point
// line at target.center.{y|x}. Returns null when conditions don't hold; caller
// should fall through to Rule 2 / default Z.
export function computeRule1Path(
  fromEl: DiagramElement,
  toEl: DiagramElement,
): number[] | null {
  if (fromEl.type !== 'argument' || toEl.type !== 'argument') return null;
  if (fromEl.argumentType !== 'data' || toEl.argumentType !== 'claim') return null;

  const fromLeft = fromEl.position.x;
  const fromRight = fromLeft + fromEl.size.width;
  const fromTop = fromEl.position.y;
  const fromBottom = fromTop + fromEl.size.height;

  const toLeft = toEl.position.x;
  const toRight = toLeft + toEl.size.width;
  const toTop = toEl.position.y;
  const toBottom = toTop + toEl.size.height;
  const toCenterX = toLeft + toEl.size.width / 2;
  const toCenterY = toTop + toEl.size.height / 2;

  // Horizontal case: target.center.y inside source's vertical extent, target fully on one side.
  const yInside = toCenterY >= fromTop && toCenterY <= fromBottom;
  const targetToRight = toLeft >= fromRight;
  const targetToLeft = toRight <= fromLeft;
  if (yInside && (targetToRight || targetToLeft)) {
    const sourceX = targetToRight ? fromRight : fromLeft;
    const targetX = targetToRight ? toLeft : toRight;
    return [sourceX, toCenterY, targetX, toCenterY];
  }

  // Vertical case: target.center.x inside source's horizontal extent, target above/below.
  const xInside = toCenterX >= fromLeft && toCenterX <= fromRight;
  const targetBelow = toTop >= fromBottom;
  const targetAbove = toBottom <= fromTop;
  if (xInside && (targetBelow || targetAbove)) {
    const sourceY = targetBelow ? fromBottom : fromTop;
    const targetY = targetBelow ? toTop : toBottom;
    return [toCenterX, sourceY, toCenterX, targetY];
  }

  return null;
}

// Compute the default Z-elbow virtual waypoints for a connection that has no stored waypoints.
// |dx| >= |dy| → vertical trunk (segments alternate H-V-H).
// otherwise   → horizontal trunk (segments alternate V-H-V).
export function computeDefaultZWaypoints(fromEl: DiagramElement, toEl: DiagramElement): Position[] {
  const fromC = getCenter(fromEl);
  const toC = getCenter(toEl);
  const dx = toC.x - fromC.x;
  const dy = toC.y - fromC.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (fromC.x + toC.x) / 2;
    return [
      { x: midX, y: fromC.y },
      { x: midX, y: toC.y },
    ];
  } else {
    const midY = (fromC.y + toC.y) / 2;
    return [
      { x: fromC.x, y: midY },
      { x: toC.x, y: midY },
    ];
  }
}

// Returns stored waypoints if present, else virtual default Z waypoints.
export function getEffectiveWaypoints(
  conn: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
): Position[] {
  if (conn.waypoints && conn.waypoints.length > 0) {
    return conn.waypoints;
  }
  return computeDefaultZWaypoints(fromEl, toEl);
}

// Determine the orientation of the segment going FROM the box edge TO `firstWaypoint`,
// given the next waypoint after that. Required because segment[0]'s orientation can't
// be read from a single point — it's inferred by alternation from segment[1].
//
// secondWaypoint may be undefined for a single-waypoint connection (post-v1, when remove-bend ships).
// In v1, all stored connections have ≥2 waypoints (Z-shape and shapes derived via segment-drag),
// or no waypoints at all (default Z generates 2 waypoints virtually). So secondWaypoint is always defined here.
export function inferEndSegmentOrientation(
  firstWaypoint: Position,
  secondWaypoint: Position | undefined,
): SegmentOrientation {
  if (!secondWaypoint) {
    // Defensive fallback for future single-waypoint case: assume horizontal.
    // v1 never hits this branch.
    return 'horizontal';
  }
  // segment[1] from firstWaypoint to secondWaypoint:
  //   shared y → horizontal segment
  //   shared x → vertical segment
  // segment[0] alternates: horizontal if segment[1] vertical, and vice versa.
  const segment1Horizontal = firstWaypoint.y === secondWaypoint.y;
  return segment1Horizontal ? 'vertical' : 'horizontal';
}

// Compute the box-edge exit point for a first/last segment whose orientation is known
// and whose interior endpoint is `neighborWaypoint`.
export function clipOrthogonalEndpoint(
  el: DiagramElement,
  neighborWaypoint: Position,
  segmentOrientation: SegmentOrientation,
): Position {
  const center = getCenter(el);
  const left = el.position.x;
  const right = el.position.x + el.size.width;
  const top = el.position.y;
  const bottom = el.position.y + el.size.height;

  if (segmentOrientation === 'horizontal') {
    // Segment is horizontal; exits left or right edge at y = neighborWaypoint.y.
    let y = neighborWaypoint.y;
    // Fallback: if y is outside the box's vertical extent, migrate to nearest top/bottom edge midline.
    if (y < top || y > bottom) {
      y = Math.max(top, Math.min(bottom, y));
    }
    const x = neighborWaypoint.x > center.x ? right : left;
    return { x, y };
  } else {
    // Segment is vertical; exits top or bottom edge at x = neighborWaypoint.x.
    let x = neighborWaypoint.x;
    if (x < left || x > right) {
      x = Math.max(left, Math.min(right, x));
    }
    const y = neighborWaypoint.y > center.y ? bottom : top;
    return { x, y };
  }
}

// Build the rendered polyline points for an element-to-element connection.
// Returns flattened [x0, y0, x1, y1, ...] for direct use as Konva Line `points`.
export function getOrthogonalPath(
  fromEl: DiagramElement,
  toEl: DiagramElement,
  waypoints: Position[],
): number[] {
  if (waypoints.length === 0) {
    // Defensive: should never happen — caller should pass effective waypoints.
    waypoints = computeDefaultZWaypoints(fromEl, toEl);
  }

  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];

  const fromOrientation = inferEndSegmentOrientation(firstWp, waypoints[1]);
  const toOrientation = inferEndSegmentOrientation(lastWp, waypoints[waypoints.length - 2]);

  const fromExit = clipOrthogonalEndpoint(fromEl, firstWp, fromOrientation);
  const toEntry = clipOrthogonalEndpoint(toEl, lastWp, toOrientation);

  const out: number[] = [fromExit.x, fromExit.y];
  for (const wp of waypoints) {
    out.push(wp.x, wp.y);
  }
  out.push(toEntry.x, toEntry.y);
  return out;
}

// Straight 2-point attachment path. Kept for fallback rendering when a vertical
// attachment isn't possible (no horizontal parent segment under the warrant).
export function getStraightAttachmentPath(fromEl: DiagramElement, attachPoint: Position): number[] {
  const center = getCenter(fromEl);
  const dx = attachPoint.x - center.x;
  const dy = attachPoint.y - center.y;
  if (dx === 0 && dy === 0) return [center.x, center.y, attachPoint.x, attachPoint.y];

  const hw = fromEl.size.width / 2;
  const hh = fromEl.size.height / 2;
  // Line-rectangle intersection: scale (dx, dy) until it hits one of the box's half-extents.
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  const exit = { x: center.x + t * dx, y: center.y + t * dy };
  return [exit.x, exit.y, attachPoint.x, attachPoint.y];
}

// Warrant- and rebuttal-attachment connections render as a single VERTICAL line
// from the warrant box's top or bottom edge straight up/down to a horizontal
// segment of the parent polyline at x = warrant.center.x. The user's stored
// `position` (t along the parent polyline at create-time) is used only as a
// tiebreaker when multiple horizontal segments span the warrant's x.
//
// If no horizontal segment of the parent intersects warrant.center.x, the
// attachment can't render vertically. Returns 'warning' style with a fallback
// straight line to the closest valid endpoint, signalling the user to reposition.
export function getVerticalAttachmentPath(
  fromEl: DiagramElement,
  parentPoints: number[],
  hintT: number,
): { points: number[]; style: 'normal' | 'warning' } {
  const center = getCenter(fromEl);
  const segs = getSegments(parentPoints);

  // Find horizontal parent segments whose x-range contains warrant.center.x.
  const candidates: { y: number; segIdx: number; xMin: number; xMax: number }[] = [];
  segs.forEach((s, idx) => {
    if (s.orientation !== 'horizontal') return;
    const xMin = Math.min(s.start.x, s.end.x);
    const xMax = Math.max(s.start.x, s.end.x);
    if (center.x >= xMin && center.x <= xMax) {
      candidates.push({ y: s.start.y, segIdx: idx, xMin, xMax });
    }
  });

  if (candidates.length > 0) {
    // Pick the candidate closest in y to the warrant. On ties, prefer the
    // segment whose midpoint is closest to the polyline-t hint location.
    let best = candidates[0];
    let bestDist = Math.abs(best.y - center.y);
    const hintPoint = getPointOnPolyline(parentPoints, hintT);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const d = Math.abs(c.y - center.y);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      } else if (d === bestDist) {
        const cMid = (c.xMin + c.xMax) / 2;
        const bestMid = (best.xMin + best.xMax) / 2;
        if (Math.abs(c.y - hintPoint.y) < Math.abs(best.y - hintPoint.y) ||
            (c.y === best.y && Math.abs(cMid - hintPoint.x) < Math.abs(bestMid - hintPoint.x))) {
          best = c;
          bestDist = d;
        }
      }
    }
    // Source: warrant box edge at x=center.x, on the side facing the parent.
    const half = fromEl.size.height / 2;
    const sourceY = best.y > center.y ? center.y + half : center.y - half;
    return {
      points: [center.x, sourceY, center.x, best.y],
      style: 'normal',
    };
  }

  // No horizontal segment under the warrant — fall back to a straight line to
  // the nearest endpoint of any horizontal parent segment. If the parent has
  // no horizontal segments at all, fall back to the polyline-t point.
  let fallback: Position | null = null;
  let fallbackDist = Infinity;
  for (const s of segs) {
    if (s.orientation !== 'horizontal') continue;
    for (const ep of [s.start, s.end]) {
      const d = (ep.x - center.x) ** 2 + (ep.y - center.y) ** 2;
      if (d < fallbackDist) {
        fallbackDist = d;
        fallback = ep;
      }
    }
  }
  if (!fallback) {
    fallback = getPointOnPolyline(parentPoints, hintT);
  }
  return {
    points: getStraightAttachmentPath(fromEl, fallback),
    style: 'warning',
  };
}

// Calculate point along a polyline at position t (0-1).
// Works on any polyline including a single 2-point segment.
// Used by warrant-attachment connections to resolve their attachment point on
// the parent connection's rendered path. Pure — lives here so SVG export and
// the Konva renderer can share the same geometry.
export function getPointOnPolyline(
  points: number[],
  t: number,
): { x: number; y: number } {
  if (points.length < 4) {
    return { x: points[0] || 0, y: points[1] || 0 };
  }

  let totalLength = 0;
  const segments: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    length: number;
  }[] = [];

  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    segments.push({ start, end, length });
    totalLength += length;
  }

  const targetLength = t * totalLength;
  let accLength = 0;

  for (const seg of segments) {
    if (accLength + seg.length >= targetLength) {
      const segT = (targetLength - accLength) / seg.length;
      return {
        x: seg.start.x + (seg.end.x - seg.start.x) * segT,
        y: seg.start.y + (seg.end.y - seg.start.y) * segT,
      };
    }
    accLength += seg.length;
  }

  return { x: points[points.length - 2], y: points[points.length - 1] };
}

// Decompose a flat points array (from getOrthogonalPath) into segments with orientation.
// Used by hit-testing and snap-to-align.
export function getSegments(points: number[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    // For an orthogonal polyline, every segment is either horizontal (same y) or vertical (same x).
    // Floating-point safety: compare with tolerance.
    const horizontal = Math.abs(start.y - end.y) < 0.5;
    segs.push({ start, end, orientation: horizontal ? 'horizontal' : 'vertical' });
  }
  return segs;
}

// Top-level routing entry. Returns a flattened [x0,y0,x1,y1,...] polyline.
// Applies the override hierarchy from the spec:
//   stored waypoints  >  stored anchors  >  Rule 1  >  Rule 2 (added in Task 14)  >  default Z
//
// `siblings` is the set of OTHER connections also targeting `toEl`. Used by Rule 2.
// Pass [] if Rule 2 isn't wired up yet — falls through to default Z when Rule 1 doesn't apply.
export function computeConnectionPath(
  connection: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _siblings: { conn: Connection; fromEl: DiagramElement }[] = [],
): number[] {
  // Waypoints win.
  if (connection.waypoints && connection.waypoints.length > 0) {
    return getOrthogonalPath(fromEl, toEl, connection.waypoints);
  }

  // Anchored endpoints — render a Z that respects them (no Rule 1, no Rule 2 for this conn).
  if (connection.fromAnchor || connection.toAnchor) {
    return getOrthogonalPath(fromEl, toEl, anchoredZWaypoints(connection, fromEl, toEl));
  }

  // Rule 1.
  const rule1 = computeRule1Path(fromEl, toEl);
  if (rule1) return rule1;

  // Rule 2 placeholder (filled in Task 14).
  return getOrthogonalPath(fromEl, toEl, computeDefaultZWaypoints(fromEl, toEl));
}

// When at least one anchor is set, compute Z-shape waypoints that respect the
// fixed endpoint(s). Falls back to default Z behavior on the unanchored side.
export function anchoredZWaypoints(
  connection: Connection,
  fromEl: DiagramElement,
  toEl: DiagramElement,
): Position[] {
  const fromCenter = {
    x: fromEl.position.x + fromEl.size.width / 2,
    y: fromEl.position.y + fromEl.size.height / 2,
  };
  const toCenter = {
    x: toEl.position.x + toEl.size.width / 2,
    y: toEl.position.y + toEl.size.height / 2,
  };
  const fromPoint = connection.fromAnchor
    ? resolveAnchor(fromEl, connection.fromAnchor)
    : fromCenter;
  const toPoint = connection.toAnchor
    ? resolveAnchor(toEl, connection.toAnchor)
    : toCenter;

  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (fromPoint.x + toPoint.x) / 2;
    return [{ x: midX, y: fromPoint.y }, { x: midX, y: toPoint.y }];
  } else {
    const midY = (fromPoint.y + toPoint.y) / 2;
    return [{ x: fromPoint.x, y: midY }, { x: toPoint.x, y: midY }];
  }
}
