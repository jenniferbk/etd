import { Circle, Line } from 'react-konva';
import type Konva from 'konva';
import type { Connection, DiagramElement } from '../../../types';
import { isArrowAttachment } from '../../../types';

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

// Calculate point along a polyline at position t (0-1)
function getPointOnPolyline(
  points: number[],
  t: number
): { x: number; y: number } {
  if (points.length < 4) {
    return { x: points[0] || 0, y: points[1] || 0 };
  }

  // Calculate total length
  let totalLength = 0;
  const segments: { start: { x: number; y: number }; end: { x: number; y: number }; length: number }[] = [];

  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    segments.push({ start, end, length });
    totalLength += length;
  }

  // Find the point at position t
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

  // Return end point
  return { x: points[points.length - 2], y: points[points.length - 1] };
}

// Determine the best edge to exit/enter an element based on target position
// Returns the edge point and which edge was chosen
type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

// Check if a Y-coordinate is within an element's vertical span
function isYWithinElement(el: DiagramElement, y: number): boolean {
  return y >= el.position.y && y <= el.position.y + el.size.height;
}

// Check if an X-coordinate is within an element's horizontal span
function isXWithinElement(el: DiagramElement, x: number): boolean {
  return x >= el.position.x && x <= el.position.x + el.size.width;
}

function getBestEdgePoint(
  el: DiagramElement,
  target: { x: number; y: number },
  preferHorizontal: boolean = false
): { x: number; y: number; side: EdgeSide } {
  const center = getElementCenter(el);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Determine which edge to use
  const useHorizontalEdge = preferHorizontal || absDx > absDy;

  if (useHorizontalEdge) {
    // Exiting left or right
    const side: EdgeSide = dx >= 0 ? 'right' : 'left';
    const edgeX = side === 'right' ? el.position.x + el.size.width : el.position.x;

    // KEY CHANGE: If target's Y is within this element's vertical span,
    // exit at target's Y level (lane-aligned routing)
    let edgeY: number;
    if (isYWithinElement(el, target.y)) {
      edgeY = target.y;
    } else {
      // Target is outside our vertical span, use center
      edgeY = center.y;
    }

    return { x: edgeX, y: edgeY, side };
  } else {
    // Exiting top or bottom
    const side: EdgeSide = dy >= 0 ? 'bottom' : 'top';
    const edgeY = side === 'bottom' ? el.position.y + el.size.height : el.position.y;

    // If target's X is within this element's horizontal span,
    // exit at target's X level
    let edgeX: number;
    if (isXWithinElement(el, target.x)) {
      edgeX = target.x;
    } else {
      edgeX = center.x;
    }

    return { x: edgeX, y: edgeY, side };
  }
}

// Generate flexible orthogonal path between two elements
// Adapts routing based on relative positions
// KEY: When source spans target's Y-level, creates lane-aligned horizontal connections
function getOrthogonalPath(
  fromEl: DiagramElement,
  toEl: DiagramElement
): { points: number[] } {
  const fromCenter = getElementCenter(fromEl);
  const toCenter = getElementCenter(toEl);

  // Determine primary direction (horizontal or vertical)
  const dx = toCenter.x - fromCenter.x;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(toCenter.y - fromCenter.y);
  const preferHorizontal = absDx >= absDy;

  // Get exit and entry points - these now consider lane alignment
  const fromEdge = getBestEdgePoint(fromEl, toCenter, preferHorizontal);
  const toEdge = getBestEdgePoint(toEl, fromCenter, preferHorizontal);

  const points: number[] = [fromEdge.x, fromEdge.y];

  // Check if exit and entry points are at the same Y level (lane-aligned)
  const edgesHorizontallyAligned = Math.abs(fromEdge.y - toEdge.y) < 5;
  // Check if exit and entry points are at the same X level
  const edgesVerticallyAligned = Math.abs(fromEdge.x - toEdge.x) < 5;

  // Route based on edge alignment (not center alignment)
  if (edgesHorizontallyAligned && (fromEdge.side === 'left' || fromEdge.side === 'right')) {
    // Exit and entry at same Y level, both horizontal edges → straight horizontal line
    points.push(toEdge.x, toEdge.y);
  } else if (edgesVerticallyAligned && (fromEdge.side === 'top' || fromEdge.side === 'bottom')) {
    // Exit and entry at same X level, both vertical edges → straight vertical line
    points.push(toEdge.x, toEdge.y);
  } else if (fromEdge.side === 'left' || fromEdge.side === 'right') {
    // Exiting horizontally
    if (toEdge.side === 'left' || toEdge.side === 'right') {
      // Both horizontal edges but different Y levels - Z-shape routing
      const midX = (fromEdge.x + toEdge.x) / 2;
      points.push(midX, fromEdge.y);
      points.push(midX, toEdge.y);
      points.push(toEdge.x, toEdge.y);
    } else {
      // Horizontal exit, vertical entry - L-shape
      points.push(toEdge.x, fromEdge.y);
      points.push(toEdge.x, toEdge.y);
    }
  } else {
    // Exiting vertically (top or bottom)
    if (toEdge.side === 'top' || toEdge.side === 'bottom') {
      // Both vertical edges but different X levels - Z-shape routing
      const midY = (fromEdge.y + toEdge.y) / 2;
      points.push(fromEdge.x, midY);
      points.push(toEdge.x, midY);
      points.push(toEdge.x, toEdge.y);
    } else {
      // Vertical exit, horizontal entry - L-shape
      points.push(fromEdge.x, toEdge.y);
      points.push(toEdge.x, toEdge.y);
    }
  }

  return { points };
}

// Get orthogonal path for arrow attachment (e.g., warrant to data→claim arrow)
function getOrthogonalPathToArrow(
  fromEl: DiagramElement,
  attachPoint: { x: number; y: number }
): { points: number[] } {
  const fromEdge = getBestEdgePoint(fromEl, attachPoint);

  const points: number[] = [fromEdge.x, fromEdge.y];

  // Check if roughly aligned
  const dx = Math.abs(attachPoint.x - fromEdge.x);
  const dy = Math.abs(attachPoint.y - fromEdge.y);

  if (dx < 10) {
    // Vertically aligned - go straight
    points.push(attachPoint.x, attachPoint.y);
  } else if (dy < 10) {
    // Horizontally aligned - go straight
    points.push(attachPoint.x, attachPoint.y);
  } else if (fromEdge.side === 'left' || fromEdge.side === 'right') {
    // L-shape: horizontal then vertical
    points.push(attachPoint.x, fromEdge.y);
    points.push(attachPoint.x, attachPoint.y);
  } else {
    // L-shape: vertical then horizontal
    points.push(fromEdge.x, attachPoint.y);
    points.push(attachPoint.x, attachPoint.y);
  }

  return { points };
}

// Get the orthogonal path points for a connection
function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[]
): { points: number[] } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    // This connection attaches to another connection
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const attachPoint = getPointOnPolyline(targetResult.points, connection.to.position);
    return getOrthogonalPathToArrow(fromEl, attachPoint);
  } else {
    // Standard element-to-element connection
    const toEl = elements.find((el) => el.id === connection.to);
    if (!toEl) return null;

    return getOrthogonalPath(fromEl, toEl);
  }
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
