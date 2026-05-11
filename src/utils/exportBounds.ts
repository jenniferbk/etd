// Export-bounds computation for full-content bounding box.
// Combines element extents with connection rendered-polyline extents so all three
// export paths (PDF / PNG / SVG) can call a single helper and avoid clipping.

import type { DiagramElement, Connection, Position } from '../types';
import { isArrowAttachment } from '../types';
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getVerticalAttachmentPath,
} from './orthogonalRouting';

export interface ExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FALLBACK: ExportBounds = { x: 0, y: 0, width: 200, height: 200 };

// Compute the tight bounding box that covers all elements and all rendered
// connection polylines, then expand outward by `margin` pixels on each side.
// Returns a 200×200 fallback centred on the origin for empty diagrams.
export function computeExportBounds(
  elements: DiagramElement[],
  connections: Connection[],
  margin = 40,
): ExportBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + el.size.width);
    maxY = Math.max(maxY, el.position.y + el.size.height);
  }

  for (const conn of connections) {
    const pts = getRenderedPoints(conn, elements, connections);
    if (!pts) continue;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minX)) return FALLBACK;

  return {
    x: minX - margin,
    y: minY - margin,
    width: (maxX - minX) + margin * 2,
    height: (maxY - minY) + margin * 2,
  };
}

// Resolve the rendered flat-points array for one connection.
// Returns null when required elements/parent connections are missing.
function getRenderedPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): number[] | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const targetConn = connections.find((c) => c.id === connection.to.connectionId);
    if (!targetConn) return null;
    const parent = getRenderedPoints(targetConn, elements, connections);
    if (!parent) return null;
    return getVerticalAttachmentPath(fromEl, parent, connection.to.position).points;
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;

  const waypoints: Position[] = getEffectiveWaypoints(connection, fromEl, toEl);
  return getOrthogonalPath(fromEl, toEl, waypoints);
}
