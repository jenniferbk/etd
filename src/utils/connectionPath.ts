// Pure helpers that resolve a Connection into its rendered polyline points.
// Extracted from src/components/Canvas/shapes/Arrow.tsx so non-component
// consumers (drop handlers, SVG export, qualifier-on-line rendering, etc.)
// can reuse the same path resolution without crossing the
// components → utils boundary.

import type { Connection, DiagramElement } from '../types';
import { isArrowAttachment } from '../types';
import {
  computeConnectionPath,
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
