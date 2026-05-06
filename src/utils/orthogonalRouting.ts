// Pure geometry for orthogonal (Manhattan) connector routing.
// No React or Konva imports — these are unit-testable functions.

import type { DiagramElement, Position, Connection } from '../types';

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

// Warrant-attachment connections stay straight in v1 (see spec §5).
// Source clips to bounding rect; target is the exact attachment point.
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
