import { useEffect, useRef, useState } from 'react';
import { Circle, Line } from 'react-konva';
import type Konva from 'konva';
import type { Connection, DiagramElement, Position } from '../../../types';
import { isArrowAttachment } from '../../../types';
import { useDiagramStore } from '../../../store';
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getSegments,
  getStraightAttachmentPath,
  type SegmentOrientation,
} from '../../../utils/orthogonalRouting';

const MIN_SEGMENT_PX = 4;

// Clamp the perpendicular coordinate of a dragged segment so the resulting
// adjacent segments don't collapse below MIN_SEGMENT_PX. Pure helper — no
// component state. Inputs: candidate value, the run's start waypoints, the
// segment index being dragged, and its orientation.
function clampToMinSegment(
  newPerp: number,
  startWaypoints: Position[],
  segmentIdx: number,
  orientation: SegmentOrientation,
): number {
  const numSegs = startWaypoints.length + 1;
  const limits: number[] = [];
  if (segmentIdx - 1 >= 0) {
    const farIdx = segmentIdx - 2;
    if (farIdx >= 0) {
      const far = startWaypoints[farIdx];
      limits.push(orientation === 'horizontal' ? far.y : far.x);
    }
  }
  if (segmentIdx + 1 < numSegs) {
    const farIdx = segmentIdx + 1;
    if (farIdx < startWaypoints.length) {
      const far = startWaypoints[farIdx];
      limits.push(orientation === 'horizontal' ? far.y : far.x);
    }
  }
  for (const lim of limits) {
    if (Math.abs(newPerp - lim) < MIN_SEGMENT_PX) {
      newPerp = newPerp >= lim ? lim + MIN_SEGMENT_PX : lim - MIN_SEGMENT_PX;
    }
  }
  return newPerp;
}

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

// Resolve a connection to its rendered polyline points.
// Element-to-element connections: orthogonal polyline (Z-elbow default + stored waypoints).
// Warrant-attachment connections: straight 2-point segment (orthogonal-attachment is out of scope in v1).
function getConnectionPathPoints(
  connection: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): { points: number[] } | null {
  const fromEl = elements.find((el) => el.id === connection.from);
  if (!fromEl) return null;

  if (isArrowAttachment(connection.to)) {
    const attachment = connection.to;
    const targetConn = connections.find((c) => c.id === attachment.connectionId);
    if (!targetConn) return null;

    const targetResult = getConnectionPathPoints(targetConn, elements, connections);
    if (!targetResult) return null;

    const attachPoint = getPointOnPolyline(targetResult.points, attachment.position);
    return { points: getStraightAttachmentPath(fromEl, attachPoint) };
  }

  const toEl = elements.find((el) => el.id === connection.to);
  if (!toEl) return null;

  // Identical-endpoint degeneracy: both elements at exactly the same position with same size
  // would produce a zero-length default Z. Skip rendering rather than draw a degenerate shape.
  if (
    fromEl.position.x === toEl.position.x &&
    fromEl.position.y === toEl.position.y &&
    fromEl.size.width === toEl.size.width &&
    fromEl.size.height === toEl.size.height
  ) {
    return null;
  }

  const waypoints = getEffectiveWaypoints(connection, fromEl, toEl);
  return { points: getOrthogonalPath(fromEl, toEl, waypoints) };
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
  const isAttachment = isArrowAttachment(connection.to);

  // Transient drag state — not persisted to store until mouseup.
  const [dragOverride, setDragOverride] = useState<Position[] | null>(null);
  const dragRef = useRef<{
    segmentIdx: number;
    orientation: SegmentOrientation;
    startWaypoints: Position[];
    startPointer: Position;
    waypointIndexA: number | null;
    waypointIndexB: number | null;
    stage: Konva.Stage;
  } | null>(null);

  const updateConnectionWaypoints = useDiagramStore((s) => s.updateConnectionWaypoints);

  // Stable dispatchers + per-render handler refs so window listeners can be removed.
  // Declared at the top so all hook calls happen before any early return.
  const handlerRefs = useRef<{
    move: ((e: MouseEvent | TouchEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });
  const moveDispatcher = useRef((e: MouseEvent | TouchEvent) => handlerRefs.current.move?.(e)).current;
  const upDispatcher = useRef(() => handlerRefs.current.up?.()).current;

  // Refresh closure-captured handlers every render so they see the latest
  // dragOverride at mouseup. Stable dispatchers (above) read through these refs.
  useEffect(() => {
    handlerRefs.current.move = (e: MouseEvent | TouchEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const altHeld = 'altKey' in e ? (e as MouseEvent).altKey : false;
      const stage = drag.stage;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const dx = pointer.x - drag.startPointer.x;
      const dy = pointer.y - drag.startPointer.y;

      const newWaypoints = drag.startWaypoints.map((wp) => ({ ...wp }));

      if (drag.orientation === 'horizontal') {
        let rawY: number;
        if (drag.waypointIndexA !== null) {
          rawY = drag.startWaypoints[drag.waypointIndexA].y + dy;
        } else if (drag.waypointIndexB !== null) {
          rawY = drag.startWaypoints[drag.waypointIndexB].y + dy;
        } else {
          return;
        }
        let newY = rawY;
        newY = clampToMinSegment(newY, drag.startWaypoints, drag.segmentIdx, 'horizontal');
        void altHeld; // used in Task 7 for snap
        if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].y = newY;
        if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].y = newY;
      } else {
        let rawX: number;
        if (drag.waypointIndexA !== null) {
          rawX = drag.startWaypoints[drag.waypointIndexA].x + dx;
        } else if (drag.waypointIndexB !== null) {
          rawX = drag.startWaypoints[drag.waypointIndexB].x + dx;
        } else {
          return;
        }
        let newX = rawX;
        newX = clampToMinSegment(newX, drag.startWaypoints, drag.segmentIdx, 'vertical');
        void altHeld;
        if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].x = newX;
        if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].x = newX;
      }

      setDragOverride(newWaypoints);
    };

    handlerRefs.current.up = () => {
      const drag = dragRef.current;
      if (drag && dragOverride) {
        updateConnectionWaypoints(connection.id, dragOverride);
      }
      dragRef.current = null;
      setDragOverride(null);

      window.removeEventListener('mousemove', moveDispatcher);
      window.removeEventListener('mouseup', upDispatcher);
      window.removeEventListener('touchmove', moveDispatcher);
      window.removeEventListener('touchend', upDispatcher);
    };
  });

  let pathResult = getConnectionPathPoints(connection, elements, connections);
  if (pathResult && !isAttachment && dragOverride) {
    const fromEl = elements.find((el) => el.id === connection.from);
    const toEl = elements.find((el) => el.id === connection.to);
    if (fromEl && toEl) {
      pathResult = { points: getOrthogonalPath(fromEl, toEl, dragOverride) };
    }
  }
  if (!pathResult || pathResult.points.length < 4) return null;
  const { points: pathPoints } = pathResult;
  const segments = getSegments(pathPoints);

  const getStartWaypoints = (): Position[] => {
    const fromEl = elements.find((el) => el.id === connection.from);
    const toEl = elements.find((el) => el.id === connection.to);
    if (!fromEl || !toEl) return [];
    if (connection.waypoints && connection.waypoints.length > 0) return [...connection.waypoints];
    return [...getEffectiveWaypoints(connection, fromEl, toEl)];
  };

  const handleSegmentDragStart = (
    segmentIdx: number,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (connectModeActive || isAttachment) return;
    e.cancelBubble = true;

    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const startWaypoints = getStartWaypoints();
    if (startWaypoints.length === 0) return;

    const seg = segments[segmentIdx];
    const numSegs = segments.length;
    const waypointIndexA = segmentIdx === 0 ? null : segmentIdx - 1;
    const waypointIndexB = segmentIdx === numSegs - 1 ? null : segmentIdx;

    dragRef.current = {
      segmentIdx,
      orientation: seg.orientation,
      startWaypoints,
      startPointer: { x: pointer.x, y: pointer.y },
      waypointIndexA,
      waypointIndexB,
      stage,
    };

    setDragOverride(startWaypoints);

    window.addEventListener('mousemove', moveDispatcher);
    window.addEventListener('mouseup', upDispatcher);
    window.addEventListener('touchmove', moveDispatcher);
    window.addEventListener('touchend', upDispatcher);
  };

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
      {/* Connector line */}
      {isAttachment ? (
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
      ) : (
        segments.map((seg, idx) => (
          <Line
            key={`seg-${idx}`}
            points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            onClick={handleArrowClick}
            onTap={handleArrowClick}
            onMouseDown={(e) => handleSegmentDragStart(idx, e)}
            onTouchStart={(e) => handleSegmentDragStart(idx, e)}
            onMouseEnter={(e) => {
              handleMouseEnter();
              if (!connectModeActive) {
                const stage = e.target.getStage();
                if (stage) {
                  stage.container().style.cursor =
                    seg.orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
                }
              }
            }}
            onMouseLeave={(e) => {
              handleMouseLeave();
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
            hitStrokeWidth={20}
          />
        ))
      )}

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
