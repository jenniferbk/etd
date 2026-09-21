// Pure helpers that resolve a Connection into its rendered polyline points.
// Extracted from src/components/Canvas/shapes/Arrow.tsx so non-component
// consumers (drop handlers, SVG export, qualifier-on-line rendering, etc.)
// can reuse the same path resolution without crossing the
// components → utils boundary.

import type { Connection, DiagramElement } from '../types';
import { isArrowAttachment } from '../types';
import {
  computeConnectionPath,
  getPointOnPolyline,
  getSegments,
  getVerticalAttachmentPath,
} from './orthogonalRouting';

export function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): { points: number[]; attachmentStyle?: 'normal' | 'warning' } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const result = getVerticalAttachmentPath(fromEl, targetResult.points, attachment.position);
    return { points: result.points, attachmentStyle: result.style };
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;

  // Identical-endpoint degeneracy: both elements at exactly the same position with same size.
  if (
    fromEl.position.x === toEl.position.x &&
    fromEl.position.y === toEl.position.y &&
    fromEl.size.width === toEl.size.width &&
    fromEl.size.height === toEl.size.height
  ) {
    return null;
  }

  // Build siblings list — other connections also targeting toEl.
  const siblings: { conn: Connection; fromEl: DiagramElement }[] = [];
  for (const c of connections) {
    if (c.id === connection.id) continue;
    if (isArrowAttachment(c.to)) continue;
    if (c.to !== toEl.id) continue;
    const sFrom = elements.find((el) => el.id === c.from);
    if (sFrom) siblings.push({ conn: c, fromEl: sFrom });
  }

  return { points: computeConnectionPath(connection, fromEl, toEl, siblings) };
}

/**
 * Convenience wrapper: returns the flat points array or null. Used by
 * qualifier hit-testing and rendering paths where we only care about the
 * polyline, not the attachment style.
 */
export function computePolylineFor(
  conn: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): number[] | null {
  return getConnectionPathPoints(conn, elements, connections)?.points ?? null;
}

export const COUNTERCLAIM_SLASH_LENGTH = 16;
// Angle between the slash and the segment it crosses. 60° reads as "/" on a
// horizontal run without looking like a perpendicular tick.
const COUNTERCLAIM_SLASH_ANGLE = Math.PI / 3;

// The segment of `points` that contains the point at fraction `t` of the
// total polyline length. Mirrors getPointOnPolyline's walk so both agree.
function segmentContaining(points: number[], t: number) {
  const segs = getSegments(points);
  const lengths = segs.map((s) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const target = t * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    acc += lengths[i];
    if (lengths[i] > 0 && acc >= target) return segs[i];
  }
  return segs[segs.length - 1];
}

/**
 * Slash marker for a counterclaim connection: a COUNTERCLAIM_SLASH_LENGTH line
 * centred on the polyline midpoint, rotated 60° from the segment it sits on.
 * Returns flat [x1, y1, x2, y2] in the polyline's coordinate space, or null
 * when the polyline has fewer than two points. Shared by Arrow.tsx and
 * svgExport.ts so canvas and export draw the identical mark.
 */
export function counterclaimSlash(points: number[]): [number, number, number, number] | null {
  if (points.length < 4) return null;
  const mid = getPointOnPolyline(points, 0.5);
  const seg = segmentContaining(points, 0.5);
  const segAngle = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x);
  // Subtracting the angle leans the mark up-right on a left→right run — "/"
  // in screen coordinates, where y grows downward.
  const a = segAngle - COUNTERCLAIM_SLASH_ANGLE;
  const half = COUNTERCLAIM_SLASH_LENGTH / 2;
  const dx = Math.cos(a) * half;
  const dy = Math.sin(a) * half;
  return [mid.x - dx, mid.y - dy, mid.x + dx, mid.y + dy];
}
