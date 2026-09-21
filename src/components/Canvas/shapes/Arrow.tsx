import { useEffect, useRef, useState } from 'react';
import { Circle, Line, Text } from 'react-konva';
import type Konva from 'konva';
import type { Connection, DiagramElement, Position, BoxEdge, EdgeAnchor, ArgumentElement } from '../../../types';
import { isArrowAttachment, isArgumentElement } from '../../../types';
import { computePolylineFor, counterclaimSlash, getConnectionPathPoints } from '../../../utils/connectionPath';
import { useDiagramStore } from '../../../store';
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getPointOnPolyline,
  getSegments,
  type SegmentOrientation,
  computeConnectionPath,
  determineFacingEdge,
  pointerToAnchorT,
  offsetAlongLine,
} from '../../../utils/orthogonalRouting';

const MIN_SEGMENT_PX = 4;
const SNAP_THRESHOLD_PX = 6;
const DRAG_THRESHOLD_PX = 3;

// Collect snap candidate coordinates from all other connections' segments
// matching the dragged segment's orientation. Pure helper — operates only on
// its arguments. Skips the dragged connection itself and warrant-attachment
// connections (their geometry is not orthogonal-segment-based in v1).
function collectSnapCandidates(
  draggedConnId: string,
  draggedOrientation: SegmentOrientation,
  allConnections: Connection[],
  allElements: DiagramElement[],
): number[] {
  const out: number[] = [];
  for (const conn of allConnections) {
    if (conn.id === draggedConnId) continue;
    if (isArrowAttachment(conn.to)) continue;
    const fromEl = allElements.find((e) => e.id === conn.from);
    const toEl = allElements.find((e) => e.id === conn.to);
    if (!fromEl || !toEl) continue;
    const wps = getEffectiveWaypoints(conn, fromEl, toEl);
    const points = getOrthogonalPath(fromEl, toEl, wps);
    const segs = getSegments(points);
    for (const s of segs) {
      if (s.orientation !== draggedOrientation) continue;
      out.push(s.orientation === 'horizontal' ? s.start.y : s.start.x);
    }
  }
  return out;
}

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
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}

// Resolve a connection to its rendered polyline points plus optional rendering
// hints (currently just `attachmentStyle` for warrant/rebuttal lines).
// Element-to-element connections: orthogonal polyline (Z-elbow default + stored waypoints).
// Warrant-attachment connections: vertical 2-point line at warrant.center.x to
// the closest horizontal parent segment, or a 'warning' fallback line when no
// horizontal segment of the parent intersects warrant.center.x.
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
  onContextMenu,
}: ArrowProps) {
  const isAttachment = isArrowAttachment(connection.to);

  // Transient drag state — not persisted to store until mouseup.
  const [dragOverride, setDragOverride] = useState<Position[] | null>(null);
  const [snapLine, setSnapLine] = useState<{ orientation: SegmentOrientation; coord: number } | null>(null);
  const dragRef = useRef<{
    segmentIdx: number;
    orientation: SegmentOrientation;
    startWaypoints: Position[];
    startPointer: Position;
    waypointIndexA: number | null;
    waypointIndexB: number | null;
    stage: Konva.Stage;
    moved: boolean;
  } | null>(null);

  const updateConnectionWaypoints = useDiagramStore((s) => s.updateConnectionWaypoints);
  const updateConnectionAnchor = useDiagramStore((s) => s.updateConnectionAnchor);

  const dragAnchorRef = useRef<{
    end: 'from' | 'to';
    element: DiagramElement;
    facingEdge: BoxEdge;
    stage: Konva.Stage;
  } | null>(null);

  const [anchorDragOverride, setAnchorDragOverride] = useState<EdgeAnchor | null>(null);
  const [anchorDragEnd, setAnchorDragEnd] = useState<'from' | 'to' | null>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<'from' | 'to' | null>(null);
  const anchorDragOverrideRef = useRef<EdgeAnchor | null>(null);
  useEffect(() => {
    anchorDragOverrideRef.current = anchorDragOverride;
  }, [anchorDragOverride]);

  // Stable dispatchers + per-render handler refs so window listeners can be removed.
  // Declared at the top so all hook calls happen before any early return.
  const handlerRefs = useRef<{
    move: ((e: MouseEvent | TouchEvent) => void) | null;
    up: (() => void) | null;
    blur: (() => void) | null;
  }>({ move: null, up: null, blur: null });
  const moveDispatcher = useRef((e: MouseEvent | TouchEvent) => handlerRefs.current.move?.(e)).current;
  const upDispatcher = useRef(() => handlerRefs.current.up?.()).current;
  const blurDispatcher = useRef(() => handlerRefs.current.blur?.()).current;

  // Effect A: refresh handler closures every render so they see the latest
  // dragOverride at mouseup. Stable dispatchers (above) read through these refs.
  // No cleanup — leaving listeners attached across renders is correct (the
  // dispatcher refs read .current and pick up the latest handler).
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

      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;

      const newWaypoints = drag.startWaypoints.map((wp) => ({ ...wp }));

      // Snap raw pointer coordinate to the nearest matching-orientation segment
      // in any other connection, within SNAP_THRESHOLD_PX. Alt held suspends snap
      // and clears the visible indicator.
      const applySnap = (rawCoord: number, orientation: SegmentOrientation): number => {
        if (altHeld) {
          setSnapLine(null);
          return rawCoord;
        }
        const candidates = collectSnapCandidates(connection.id, orientation, connections, elements);
        let bestDist = SNAP_THRESHOLD_PX;
        let bestCoord: number | null = null;
        for (const c of candidates) {
          const d = Math.abs(c - rawCoord);
          if (d < bestDist) {
            bestDist = d;
            bestCoord = c;
          }
        }
        if (bestCoord !== null) {
          setSnapLine({ orientation, coord: bestCoord });
          return bestCoord;
        }
        setSnapLine(null);
        return rawCoord;
      };

      if (drag.orientation === 'horizontal') {
        let rawY: number;
        if (drag.waypointIndexA !== null) {
          rawY = drag.startWaypoints[drag.waypointIndexA].y + dy;
        } else if (drag.waypointIndexB !== null) {
          rawY = drag.startWaypoints[drag.waypointIndexB].y + dy;
        } else {
          return;
        }
        let newY = applySnap(rawY, 'horizontal');
        newY = clampToMinSegment(newY, drag.startWaypoints, drag.segmentIdx, 'horizontal');
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
        let newX = applySnap(rawX, 'vertical');
        newX = clampToMinSegment(newX, drag.startWaypoints, drag.segmentIdx, 'vertical');
        if (drag.waypointIndexA !== null) newWaypoints[drag.waypointIndexA].x = newX;
        if (drag.waypointIndexB !== null) newWaypoints[drag.waypointIndexB].x = newX;
      }

      setDragOverride(newWaypoints);
    };

    handlerRefs.current.up = () => {
      const drag = dragRef.current;
      if (drag && drag.moved && dragOverride) {
        updateConnectionWaypoints(connection.id, dragOverride);
      }
      dragRef.current = null;
      setDragOverride(null);
      setSnapLine(null);

      window.removeEventListener('mousemove', moveDispatcher);
      window.removeEventListener('mouseup', upDispatcher);
      window.removeEventListener('touchmove', moveDispatcher);
      window.removeEventListener('touchend', upDispatcher);
      window.removeEventListener('blur', blurDispatcher);
    };

    // Window blur during drag (e.g., user releases mouse outside the viewport):
    // commit the drag and tear down listeners — same logic as handleWindowUp.
    handlerRefs.current.blur = () => {
      const drag = dragRef.current;
      if (drag && drag.moved && dragOverride) {
        updateConnectionWaypoints(connection.id, dragOverride);
      }
      dragRef.current = null;
      setDragOverride(null);
      setSnapLine(null);

      window.removeEventListener('mousemove', moveDispatcher);
      window.removeEventListener('mouseup', upDispatcher);
      window.removeEventListener('touchmove', moveDispatcher);
      window.removeEventListener('touchend', upDispatcher);
      window.removeEventListener('blur', blurDispatcher);
    };
  });

  // Effect B: unmount-only cleanup. If a drag is in flight when the connection
  // is removed from the tree, tear down the window listeners so they don't fire
  // against a dead component.
  // Don't call setDragOverride(null) here — the component is unmounting.
  // moveDispatcher/upDispatcher/blurDispatcher are stable (useRef.current) — safe to omit.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    return () => {
      if (dragRef.current) {
        window.removeEventListener('mousemove', moveDispatcher);
        window.removeEventListener('mouseup', upDispatcher);
        window.removeEventListener('touchmove', moveDispatcher);
        window.removeEventListener('touchend', upDispatcher);
        window.removeEventListener('blur', blurDispatcher);
        dragRef.current = null;
      }
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Rebuttal-to-qualifier special case: when this connection targets an
  // element whose argumentType is 'qualifier' AND that qualifier has
  // attachedTo set, render a vertical line from the source down through the
  // qualifier to the parent connection's polyline at the qualifier's x.
  // No arrowhead. Per Anna's vertical-only rule, the source's center.x must
  // match the qualifier's center.x; otherwise render a faint dashed gray
  // "reposition me" hint instead.
  const targetElForQualifierCheck =
    typeof connection.to === 'string'
      ? elements.find((el) => el.id === connection.to)
      : null;
  const isTargetAttachedQualifier =
    targetElForQualifierCheck &&
    isArgumentElement(targetElForQualifierCheck) &&
    targetElForQualifierCheck.argumentType === 'qualifier' &&
    targetElForQualifierCheck.attachedTo !== undefined;

  if (isTargetAttachedQualifier && targetElForQualifierCheck) {
    const qual = targetElForQualifierCheck as ArgumentElement;
    const parentConn = connections.find((c) => c.id === qual.attachedTo!.connectionId);
    const parentPolyline = parentConn ? computePolylineFor(parentConn, elements, connections) : null;
    const sourceEl = elements.find((el) => el.id === connection.from);
    if (!parentPolyline || !sourceEl) return null;

    const qualCenter = {
      x: qual.position.x + qual.size.width / 2,
      y: qual.position.y + qual.size.height / 2,
    };
    const sourceCenter = {
      x: sourceEl.position.x + sourceEl.size.width / 2,
      y: sourceEl.position.y + sourceEl.size.height / 2,
    };

    const X_TOLERANCE = 4;
    const aligned = Math.abs(sourceCenter.x - qualCenter.x) <= X_TOLERANCE;

    if (!aligned) {
      // Faint dashed gray "reposition me" hint — diagonal between source center
      // and qualifier center, no arrowhead, dashed.
      return (
        <Line
          points={[sourceCenter.x, sourceCenter.y, qualCenter.x, qualCenter.y]}
          stroke="#999"
          strokeWidth={1}
          dash={[4, 4]}
          listening={true}
          onClick={onSelect}
          onTap={onSelect}
        />
      );
    }

    // Aligned: vertical line from source's bottom edge straight down to the
    // parent connection's y at qual.center.x. The qualifier box renders on top
    // of this line (separate Konva node), so it visually occludes the middle.
    return (
      <Line
        points={[
          qualCenter.x,
          sourceEl.position.y + sourceEl.size.height,
          qualCenter.x,
          qualCenter.y,
        ]}
        stroke={isSelected ? '#4A90D9' : '#000000'}
        strokeWidth={isSelected ? 2 : 1.5}
        listening={true}
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

  let pathResult = getConnectionPathPoints(connection, elements, connections);
  if (pathResult && !isAttachment && (dragOverride || anchorDragOverride)) {
    const fromEl = elements.find((el) => el.id === connection.from);
    const toEl = elements.find((el) => el.id === connection.to);
    if (fromEl && toEl) {
      if (anchorDragOverride && anchorDragEnd) {
        const tempConn: Connection = {
          ...connection,
          ...(anchorDragEnd === 'from'
            ? { fromAnchor: anchorDragOverride }
            : { toAnchor: anchorDragOverride }),
        };
        pathResult = { points: computeConnectionPath(tempConn, fromEl, toEl, []) };
      } else if (dragOverride) {
        pathResult = { points: getOrthogonalPath(fromEl, toEl, dragOverride) };
      }
    }
  }
  if (!pathResult || pathResult.points.length < 4) return null;
  const { points: pathPoints } = pathResult;
  const attachmentStyle = pathResult.attachmentStyle ?? 'normal';
  const segments = getSegments(pathPoints);
  const isCounterclaim = connection.type === 'counterclaim';
  const slash = isCounterclaim && attachmentStyle !== 'warning' ? counterclaimSlash(pathPoints) : null;

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
    if ('button' in e.evt && e.evt.button !== 0) return;
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
      moved: false,
    };

    setDragOverride(startWaypoints);

    window.addEventListener('mousemove', moveDispatcher);
    window.addEventListener('mouseup', upDispatcher);
    window.addEventListener('touchmove', moveDispatcher);
    window.addEventListener('touchend', upDispatcher);
    window.addEventListener('blur', blurDispatcher);
  };

  const handleAnchorDragStart = (
    end: 'from' | 'to',
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (connectModeActive || isAttachment) return;
    e.cancelBubble = true;

    const stage = e.target.getStage();
    if (!stage) return;
    const el = end === 'from'
      ? elements.find((x) => x.id === connection.from)
      : elements.find((x) => x.id === connection.to);
    if (!el) return;

    // Determine facing edge from current geometry. The "other" element is the connection's other endpoint.
    const otherEl = end === 'from'
      ? (typeof connection.to === 'string' ? elements.find((x) => x.id === connection.to) : null)
      : elements.find((x) => x.id === connection.from);
    if (!otherEl) return;
    const facingEdge = determineFacingEdge(el, otherEl);

    dragAnchorRef.current = { end, element: el, facingEdge, stage };
    setAnchorDragEnd(end);

    const move = () => {
      const drag = dragAnchorRef.current;
      if (!drag) return;
      // Use getRelativePointerPosition to get stage/logical coords (accounts for pan + zoom).
      // Element positions in the store are in stage coords, so this is what we need.
      const ptr = drag.stage.getRelativePointerPosition();
      if (!ptr) return;
      const t = pointerToAnchorT(ptr, drag.element, drag.facingEdge);
      setAnchorDragOverride({ edge: drag.facingEdge, t });
    };

    const up = () => {
      const drag = dragAnchorRef.current;
      if (drag && anchorDragOverrideRef.current) {
        updateConnectionAnchor(connection.id, drag.end, anchorDragOverrideRef.current);
      }
      dragAnchorRef.current = null;
      setAnchorDragOverride(null);
      setAnchorDragEnd(null);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
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
      {/* Dashed cyan alignment indicator while snapping (Task 7).
          Rendered first so it sits visually beneath the connector line. */}
      {snapLine && (() => {
        const RANGE = 10000;
        const points = snapLine.orientation === 'horizontal'
          ? [-RANGE, snapLine.coord, RANGE, snapLine.coord]
          : [snapLine.coord, -RANGE, snapLine.coord, RANGE];
        return (
          <Line
            points={points}
            stroke="#00CED1"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        );
      })()}

      {/* Connector line */}
      {isAttachment ? (
        <Line
          points={pathPoints}
          stroke={attachmentStyle === 'warning' ? '#A0A0A0' : strokeColor}
          strokeWidth={attachmentStyle === 'warning' ? 1 : strokeWidth}
          dash={attachmentStyle === 'warning' ? [4, 4] : undefined}
          opacity={attachmentStyle === 'warning' ? 0.6 : 1}
          onClick={handleArrowClick}
          onContextMenu={onContextMenu}
          onTap={handleArrowClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          hitStrokeWidth={20}
        />
      ) : (
        <>
          {segments.map((seg, idx) => (
            <Line
              key={`seg-${idx}`}
              points={[seg.start.x, seg.start.y, seg.end.x, seg.end.y]}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              onClick={handleArrowClick}
              onContextMenu={onContextMenu}
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
          ))}

          {/* Segment midpoint-handles for discoverability (Task 15) */}
          {(isHovered || isSelected) && !connectModeActive &&
            segments.map((seg, idx) => {
              const midX = (seg.start.x + seg.end.x) / 2;
              const midY = (seg.start.y + seg.end.y) / 2;
              return (
                <Circle
                  key={`mid-${idx}`}
                  x={midX}
                  y={midY}
                  radius={5}
                  fill="#FFFFFF"
                  stroke="#333333"
                  strokeWidth={1.5}
                  onMouseDown={(e) => handleSegmentDragStart(idx, e)}
                  onTouchStart={(e) => handleSegmentDragStart(idx, e)}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage();
                    if (stage) {
                      stage.container().style.cursor =
                        seg.orientation === 'horizontal' ? 'ns-resize' : 'ew-resize';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = 'default';
                  }}
                />
              );
            })
          }

          {/* Edge-anchor handles (Task 16) + hover-× reset badge (Task 18) */}
          {!isAttachment && (isHovered || isSelected) && !connectModeActive && (() => {
            // Offset anchor dots 12px inward along the line so they're visible
            // above the element boxes (which render on top of connectors).
            const ANCHOR_HANDLE_OFFSET = 12;
            const fromAnchorPos = offsetAlongLine(
              { x: pathPoints[0], y: pathPoints[1] },
              { x: pathPoints[2], y: pathPoints[3] },
              ANCHOR_HANDLE_OFFSET,
            );
            const toAnchorPos = offsetAlongLine(
              { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] },
              { x: pathPoints[pathPoints.length - 4], y: pathPoints[pathPoints.length - 3] },
              ANCHOR_HANDLE_OFFSET,
            );
            return (
              <>
                {/* Source-side anchor handle */}
                <Circle
                  x={fromAnchorPos.x}
                  y={fromAnchorPos.y}
                  radius={5}
                  fill="#3B82F6"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  onMouseDown={(e) => handleAnchorDragStart('from', e)}
                  onTouchStart={(e) => handleAnchorDragStart('from', e)}
                  onMouseEnter={() => setHoveredAnchor('from')}
                  onMouseLeave={() => setHoveredAnchor(null)}
                />
                {hoveredAnchor === 'from' && connection.fromAnchor && (
                  <Text
                    x={fromAnchorPos.x + 8}
                    y={fromAnchorPos.y - 14}
                    text="×"
                    fontSize={14}
                    fill="#666666"
                    onClick={(e) => {
                      e.cancelBubble = true;
                      updateConnectionAnchor(connection.id, 'from', undefined);
                      setHoveredAnchor(null);
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      updateConnectionAnchor(connection.id, 'from', undefined);
                      setHoveredAnchor(null);
                    }}
                  />
                )}
                {/* Target-side anchor handle */}
                <Circle
                  x={toAnchorPos.x}
                  y={toAnchorPos.y}
                  radius={5}
                  fill="#3B82F6"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  onMouseDown={(e) => handleAnchorDragStart('to', e)}
                  onTouchStart={(e) => handleAnchorDragStart('to', e)}
                  onMouseEnter={() => setHoveredAnchor('to')}
                  onMouseLeave={() => setHoveredAnchor(null)}
                />
                {hoveredAnchor === 'to' && connection.toAnchor && (
                  <Text
                    x={toAnchorPos.x + 8}
                    y={toAnchorPos.y - 14}
                    text="×"
                    fontSize={14}
                    fill="#666666"
                    onClick={(e) => {
                      e.cancelBubble = true;
                      updateConnectionAnchor(connection.id, 'to', undefined);
                      setHoveredAnchor(null);
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      updateConnectionAnchor(connection.id, 'to', undefined);
                      setHoveredAnchor(null);
                    }}
                  />
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Arrow head at the end */}
      {!isAttachment && !isCounterclaim && (
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

      {/* Counterclaim marker — short slash across the polyline midpoint.
          Same geometry as svgExport via counterclaimSlash. */}
      {slash && (
        <Line
          points={slash}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineCap="round"
          listening={false}
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

      {/* For arrow attachments, show a small perpendicular indicator.
          Suppressed in 'warning' state — the line is a fallback hint, not a real attachment. */}
      {isAttachment && attachmentStyle === 'normal' && (
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
