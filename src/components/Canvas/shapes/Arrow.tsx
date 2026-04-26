import { Circle, Line } from 'react-konva';
import type Konva from 'konva';
import type { Connection, DiagramElement } from '../../../types';
import {
  isArgumentElement,
  isSupportElement,
  isTeacherSupportElement,
  isArrowAttachment,
} from '../../../types';

interface ArrowProps {
  connection: Connection;
  elements: DiagramElement[];
  connections: Connection[];
  isSelected: boolean;
  isHovered: boolean;
  connectModeActive: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onArrowClick?: (connectionId: string, position: number, point: { x: number; y: number }) => void;
  onHover?: (connectionId: string | null) => void;
}

// Get center point of an element
function getElementCenter(el: DiagramElement): { x: number; y: number } {
  return {
    x: el.position.x + el.size.width / 2,
    y: el.position.y + el.size.height / 2,
  };
}

// Calculate point along a polyline at position t (0-1).
// Works on any polyline including a single 2-point segment.
function getPointOnPolyline(
  points: number[],
  t: number
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

// Decide which silhouette to clip a connector against for a given element.
// 'ellipse' = action support shapes and the cloud "implicit" argument shape
// (clipped to its bounding-box ellipse — the bezier bumps reach roughly to
// that envelope, so the line ends at the cloud's outer edge).
// 'rect' = everything else: axis-aligned bounding box.
type ShapeKind = 'rect' | 'ellipse';
function getShapeKind(el: DiagramElement): ShapeKind {
  if (isArgumentElement(el) && el.contributor === 'implicit') return 'ellipse';
  if (isSupportElement(el) && el.supportType === 'action') return 'ellipse';
  if (isTeacherSupportElement(el) && el.supportType === 'action') return 'ellipse';
  return 'rect';
}

// Find the point where a line from `center` toward `target` exits an
// axis-aligned rectangle of half-width hw and half-height hh centered on `center`.
function lineRectEdgePoint(
  center: { x: number; y: number },
  hw: number,
  hh: number,
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y };
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: center.x + t * dx, y: center.y + t * dy };
}

// Find the point where a line from `center` toward `target` exits an ellipse
// centered on `center` with semi-axes (rx, ry). Closed-form solution.
function lineEllipseEdgePoint(
  center: { x: number; y: number },
  rx: number,
  ry: number,
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: center.x, y: center.y };
  const ux = dx / len;
  const uy = dy / len;
  const s = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
  return { x: center.x + s * ux, y: center.y + s * uy };
}

// Boundary point of an element along the line from its center toward `target`.
// Picks rectangle or ellipse silhouette based on element type.
function getEdgePoint(
  el: DiagramElement,
  target: { x: number; y: number }
): { x: number; y: number } {
  const center = getElementCenter(el);
  const hw = el.size.width / 2;
  const hh = el.size.height / 2;
  if (getShapeKind(el) === 'ellipse') {
    return lineEllipseEdgePoint(center, hw, hh, target);
  }
  return lineRectEdgePoint(center, hw, hh, target);
}

// Build a straight 2-point path between two elements. Both endpoints lie on
// each element's silhouette along the source-center → target-center line.
function getStraightPath(
  fromEl: DiagramElement,
  toEl: DiagramElement
): { points: number[] } {
  const fromCenter = getElementCenter(fromEl);
  const toCenter = getElementCenter(toEl);
  const fromEdge = getEdgePoint(fromEl, toCenter);
  const toEdge = getEdgePoint(toEl, fromCenter);
  return { points: [fromEdge.x, fromEdge.y, toEdge.x, toEdge.y] };
}

// Build a straight 2-point path from an element to a point on another
// connection. Source side is clipped to the element's silhouette; the
// attachment side terminates exactly at the attachment point.
function getStraightPathToArrow(
  fromEl: DiagramElement,
  attachPoint: { x: number; y: number }
): { points: number[] } {
  const fromEdge = getEdgePoint(fromEl, attachPoint);
  return { points: [fromEdge.x, fromEdge.y, attachPoint.x, attachPoint.y] };
}

// Resolve a connection to its rendered polyline points. Recursively resolves
// arrow-attachment connections by computing the parent's path first.
function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[]
): { points: number[] } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const attachPoint = getPointOnPolyline(targetResult.points, connection.to.position);
    return getStraightPathToArrow(fromEl, attachPoint);
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;
  return getStraightPath(fromEl, toEl);
}

export function ConnectionArrow({
  connection,
  elements,
  connections,
  isSelected,
  isHovered,
  connectModeActive,
  onSelect,
  onArrowClick,
  onHover,
}: ArrowProps) {
  const pathResult = getConnectionPathPoints(connection, elements, connections);
  if (!pathResult || pathResult.points.length < 4) return null;

  const { points: pathPoints } = pathResult;
  const isAttachment = isArrowAttachment(connection.to);

  // Calculate midpoint for click detection
  const midPoint = getPointOnPolyline(pathPoints, 0.5);

  // Get the last segment for arrow direction
  const endX = pathPoints[pathPoints.length - 2];
  const endY = pathPoints[pathPoints.length - 1];
  const prevX = pathPoints[pathPoints.length - 4];
  const prevY = pathPoints[pathPoints.length - 3];

  // Handle click on arrow line
  const handleArrowClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (connectModeActive && onArrowClick) {
      e.cancelBubble = true;
      const stage = e.target.getStage();
      if (!stage) return;

      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;

      // Find closest point on polyline and its t value
      let minDist = Infinity;
      let bestT = 0.5;
      let totalLength = 0;
      const segmentLengths: number[] = [];

      for (let i = 0; i < pathPoints.length - 2; i += 2) {
        const length = Math.sqrt(
          (pathPoints[i + 2] - pathPoints[i]) ** 2 +
          (pathPoints[i + 3] - pathPoints[i + 1]) ** 2
        );
        segmentLengths.push(length);
        totalLength += length;
      }

      let accLength = 0;
      for (let i = 0; i < pathPoints.length - 2; i += 2) {
        const segIdx = i / 2;
        const segLength = segmentLengths[segIdx];
        const sx = pathPoints[i], sy = pathPoints[i + 1];
        const ex = pathPoints[i + 2], ey = pathPoints[i + 3];

        // Project point onto segment
        const dx = ex - sx, dy = ey - sy;
        if (segLength > 0) {
          let t = ((pointerPos.x - sx) * dx + (pointerPos.y - sy) * dy) / (segLength * segLength);
          t = Math.max(0, Math.min(1, t));
          const projX = sx + t * dx, projY = sy + t * dy;
          const dist = Math.sqrt((pointerPos.x - projX) ** 2 + (pointerPos.y - projY) ** 2);

          if (dist < minDist) {
            minDist = dist;
            bestT = (accLength + t * segLength) / totalLength;
          }
        }
        accLength += segLength;
      }

      bestT = Math.max(0.1, Math.min(0.9, bestT));
      const clickPoint = getPointOnPolyline(pathPoints, bestT);
      onArrowClick(connection.id, bestT, clickPoint);
    } else {
      onSelect(e);
    }
  };

  const handleMouseEnter = () => {
    if (connectModeActive && onHover) {
      onHover(connection.id);
    }
  };

  const handleMouseLeave = () => {
    if (onHover) {
      onHover(null);
    }
  };

  // Determine stroke color and width
  let strokeColor: string;
  if (isSelected) {
    strokeColor = '#4A90D9';
  } else if (isHovered) {
    strokeColor = '#FF6B6B';
  } else {
    strokeColor = '#000000';
  }
  const strokeWidth = isSelected || isHovered ? 3 : 2;

  // Calculate arrow angle for the last segment
  const arrowAngle = Math.atan2(endY - prevY, endX - prevX);
  const arrowLength = isAttachment ? 0 : 10;

  return (
    <>
      {/* Orthogonal path line */}
      <Line
        points={pathPoints}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        onClick={handleArrowClick}
        onTap={handleArrowClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        hitStrokeWidth={20}
      />

      {/* Arrow head at the end */}
      {!isAttachment && (
        <Line
          points={[
            endX - arrowLength * Math.cos(arrowAngle - Math.PI / 6),
            endY - arrowLength * Math.sin(arrowAngle - Math.PI / 6),
            endX,
            endY,
            endX - arrowLength * Math.cos(arrowAngle + Math.PI / 6),
            endY - arrowLength * Math.sin(arrowAngle + Math.PI / 6),
          ]}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={strokeColor}
          closed
        />
      )}

      {/* Show attachment point indicator when hovered in connect mode */}
      {isHovered && connectModeActive && (
        <Circle
          x={midPoint.x}
          y={midPoint.y}
          radius={6}
          fill="#FF6B6B"
          stroke="#FFFFFF"
          strokeWidth={2}
        />
      )}

      {/* For arrow attachments, show a small perpendicular indicator */}
      {isAttachment && (
        <Circle
          x={endX}
          y={endY}
          radius={4}
          fill="#000000"
        />
      )}
    </>
  );
}
