import { Arrow as KonvaArrow, Circle } from 'react-konva';
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

// Calculate point along a line at position t (0-1)
function getPointOnLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

// Get the edge point of an element closest to a target point
function getEdgePoint(
  el: DiagramElement,
  target: { x: number; y: number }
): { x: number; y: number } {
  const center = getElementCenter(el);
  const angle = Math.atan2(target.y - center.y, target.x - center.x);

  const hw = el.size.width / 2;
  const hh = el.size.height / 2;

  // Calculate intersection with rectangle edges
  const tanAngle = Math.tan(angle);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  let x: number, y: number;

  // Check horizontal edges first
  if (Math.abs(cosAngle) > Math.abs(sinAngle * hw / hh)) {
    // Intersects left or right edge
    x = center.x + (cosAngle > 0 ? hw : -hw);
    y = center.y + (cosAngle > 0 ? hw : -hw) * tanAngle;
  } else {
    // Intersects top or bottom edge
    y = center.y + (sinAngle > 0 ? hh : -hh);
    x = center.x + (sinAngle > 0 ? hh : -hh) / tanAngle;
  }

  // Clamp to element bounds
  x = Math.max(el.position.x, Math.min(el.position.x + el.size.width, x));
  y = Math.max(el.position.y, Math.min(el.position.y + el.size.height, y));

  return { x, y };
}

// Find the connection points for a standard element-to-element connection
function getConnectionPoints(
  fromEl: DiagramElement,
  toEl: DiagramElement
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const fromCenter = getElementCenter(fromEl);
  const toCenter = getElementCenter(toEl);

  return {
    from: getEdgePoint(fromEl, toCenter),
    to: getEdgePoint(toEl, fromCenter),
  };
}


// Get the actual line points for a connection (recursive for attachments)
function getConnectionLinePoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[]
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    // This connection attaches to another connection
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetPoints = getConnectionLinePoints(targetConn, elements, connections);
    if (!targetPoints) return null;

    const attachPoint = getPointOnLine(targetPoints.from, targetPoints.to, connection.to.position);
    const fromPoint = getEdgePoint(fromEl, attachPoint);

    return { from: fromPoint, to: attachPoint };
  } else {
    // Standard element-to-element connection
    const toEl = elements.find((el) => el.id === connection.to);
    if (!toEl) return null;

    return getConnectionPoints(fromEl, toEl);
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
  const points = getConnectionLinePoints(connection, elements, connections);
  if (!points) return null;

  const isAttachment = isArrowAttachment(connection.to);

  // Calculate midpoint for click detection
  const midPoint = getPointOnLine(points.from, points.to, 0.5);

  // Handle click on arrow line
  const handleArrowClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (connectModeActive && onArrowClick) {
      e.cancelBubble = true;
      const stage = e.target.getStage();
      if (!stage) return;

      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;

      // Calculate position along line (0-1)
      const dx = points.to.x - points.from.x;
      const dy = points.to.y - points.from.y;
      const lineLength = Math.sqrt(dx * dx + dy * dy);

      // Project click point onto line
      const t = Math.max(0.1, Math.min(0.9,
        ((pointerPos.x - points.from.x) * dx + (pointerPos.y - points.from.y) * dy) / (lineLength * lineLength)
      ));

      const clickPoint = getPointOnLine(points.from, points.to, t);
      onArrowClick(connection.id, t, clickPoint);
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
  const strokeColor = isSelected ? '#4A90D9' : isHovered ? '#FF6B6B' : '#000000';
  const strokeWidth = isSelected || isHovered ? 3 : 2;

  return (
    <>
      {/* Main arrow */}
      <KonvaArrow
        points={[points.from.x, points.from.y, points.to.x, points.to.y]}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill={strokeColor}
        pointerLength={isAttachment ? 0 : 10}
        pointerWidth={isAttachment ? 0 : 8}
        onClick={handleArrowClick}
        onTap={handleArrowClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        hitStrokeWidth={20}
      />

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
          x={points.to.x}
          y={points.to.y}
          radius={4}
          fill="#000000"
        />
      )}
    </>
  );
}
