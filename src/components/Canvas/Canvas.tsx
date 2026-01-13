import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer, Transformer, Line } from 'react-konva';
import type Konva from 'konva';
import { useDiagramStore } from '../../store';
import { ArgumentShape } from './shapes/ArgumentShape';
import { TeacherSupportShape } from './shapes/TeacherSupportShape';
import { SupportShape } from './shapes/SupportShape';
import { ConnectionArrow } from './shapes/Arrow';
import { isArgumentElement, isSupportElement, isTeacherSupportElement, isInfoBoxElement, type ContributorType, type DiagramElement } from '../../types';
import { InfoBoxShape } from './shapes/InfoBoxShape';
import { ContextMenu } from './ContextMenu';
import { Legend } from './shapes/Legend';
import { SelectionRect } from './SelectionRect';
import { useMarqueeSelection } from '../../hooks/useMarqueeSelection';
import { InlineEditor } from './InlineEditor';

// Lane configuration
const LANE_CONFIG = {
  startY: 50,           // First lane Y position
  spacing: 150,         // Distance between lanes
  count: 6,             // Number of lanes
  snapThreshold: 40,    // Snap to lane if within this distance
  width: 3000,          // Lane guide line width
};

// Calculate lane Y positions
const getLanePositions = () => {
  const lanes: number[] = [];
  for (let i = 0; i < LANE_CONFIG.count; i++) {
    lanes.push(LANE_CONFIG.startY + i * LANE_CONFIG.spacing);
  }
  return lanes;
};

// Snap to nearest lane if within threshold
const snapToLane = (y: number, elementHeight: number): number => {
  const lanes = getLanePositions();
  const elementCenterY = y + elementHeight / 2;

  for (const laneY of lanes) {
    if (Math.abs(elementCenterY - laneY) < LANE_CONFIG.snapThreshold) {
      // Snap element center to lane
      return laneY - elementHeight / 2;
    }
  }

  return y; // No snap, return original
};

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  elementId: string;
  elementType: 'argument' | 'support' | 'teacherSupport' | 'infoBox' | 'connection';
}

interface CanvasProps {
  connectMode: boolean;
  onConnectionStart: (id: string) => void;
  connectingFrom: string | null;
}

export function Canvas({ connectMode, onConnectionStart, connectingFrom }: CanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [hoveredArrowId, setHoveredArrowId] = useState<string | null>(null);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    elementId: '',
    elementType: 'argument',
  });

  // Inline editing state
  const [editingElement, setEditingElement] = useState<DiagramElement | null>(null);

  // Marquee selection
  const { marqueeState, startMarquee, updateMarquee, endMarquee, cancelMarquee } = useMarqueeSelection();

  // Handle Space key for pan mode
  useEffect(() => {
    const isInputFocused = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e)) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsPanMode(true);
        cancelMarquee();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsPanMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [cancelMarquee]);

  const {
    elements,
    connections,
    zoom,
    panX,
    panY,
    selectedIds,
    legendConfig,
    setZoom,
    setPan,
    setSelectedIds,
    clearSelection,
    moveElement,
    resizeElement,
    updateElement,
    addConnection,
    removeElement,
    removeConnection,
    duplicateElements,
    bringToFront,
    sendToBack,
    changeContributor,
    moveLegend,
  } = useDiagramStore();

  // Update stage size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Attach transformer to selected elements
  useEffect(() => {
    if (!transformerRef.current) return;

    // Get all selected element shapes (not connections)
    const selectedNodes: Konva.Node[] = [];
    selectedIds.forEach((id) => {
      const node = shapeRefs.current.get(id);
      if (node) {
        selectedNodes.push(node);
      }
    });

    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds, elements]);

  // Register shape ref callback
  const registerShapeRef = useCallback((id: string, node: Konva.Group | null) => {
    if (node) {
      shapeRefs.current.set(id, node);
    } else {
      shapeRefs.current.delete(id);
    }
  }, []);

  // Handle transform end (resize)
  const handleTransformEnd = useCallback(
    (id: string, node: Konva.Group) => {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Get the element to find its current size
      const element = elements.find((el) => el.id === id);
      if (!element) return;

      // Calculate new size based on scale
      const newWidth = Math.max(80, element.size.width * scaleX);
      const newHeight = Math.max(60, element.size.height * scaleY);

      // Reset scale and update position
      node.scaleX(1);
      node.scaleY(1);

      // Update position (transformer may have moved it)
      moveElement(id, {
        x: node.x(),
        y: node.y(),
      });

      // Update size
      resizeElement(id, {
        width: newWidth,
        height: newHeight,
      });
    },
    [elements, moveElement, resizeElement]
  );

  // Handle zoom with mouse wheel
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = zoom;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - panX) / oldScale,
        y: (pointer.y - panY) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const scaleBy = 1.1;
      const newScale =
        direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

      const clampedScale = Math.max(0.25, Math.min(4, newScale));

      setZoom(clampedScale);
      setPan(
        pointer.x - mousePointTo.x * clampedScale,
        pointer.y - mousePointTo.y * clampedScale
      );
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  // Handle stage click for deselection
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        clearSelection();
        if (connectMode) {
          onConnectionStart('');
        }
      }
    },
    [clearSelection, connectMode, onConnectionStart]
  );

  // Handle mouse down on stage for marquee selection
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only start marquee if clicking on empty stage (not on an element)
      // Don't start marquee if in pan mode or using middle mouse button
      if (e.target === e.target.getStage() && !connectMode && !isPanMode && e.evt.button !== 1) {
        const stage = stageRef.current;
        if (!stage) return;

        const pos = stage.getPointerPosition();
        if (pos) {
          startMarquee(pos.x, pos.y);
        }
      }
    },
    [connectMode, isPanMode, startMarquee]
  );

  // Handle mouse move for marquee selection
  const handleStageMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!marqueeState.isSelecting) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (pos) {
        updateMarquee(pos.x, pos.y);
      }
    },
    [marqueeState.isSelecting, updateMarquee]
  );

  // Handle mouse up for marquee selection
  const handleStageMouseUp = useCallback(() => {
    if (!marqueeState.isSelecting) return;

    const selectedIds = endMarquee(elements, zoom, panX, panY);
    if (selectedIds.length > 0) {
      setSelectedIds(selectedIds);
    }
  }, [marqueeState.isSelecting, endMarquee, elements, zoom, panX, panY, setSelectedIds]);

  // Handle element selection (or connection)
  const handleElementSelect = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;

      // If in connect mode and we have a source, create the connection
      if (connectMode && connectingFrom && connectingFrom !== id) {
        addConnection({
          id: `conn-${Date.now()}`,
          from: connectingFrom,
          to: id,
          type: 'support',
        });
        onConnectionStart(''); // Clear connecting state
        return;
      }

      // If in connect mode, start a connection
      if (connectMode) {
        onConnectionStart(id);
        return;
      }

      // Normal selection
      if (e.evt.shiftKey) {
        if (selectedIds.includes(id)) {
          setSelectedIds(selectedIds.filter((sid) => sid !== id));
        } else {
          setSelectedIds([...selectedIds, id]);
        }
      } else {
        setSelectedIds([id]);
      }
    },
    [connectMode, connectingFrom, selectedIds, setSelectedIds, addConnection, onConnectionStart]
  );

  // Handle arrow click - for attaching warrants to arrows
  const handleArrowClick = useCallback(
    (connectionId: string, position: number, _point: { x: number; y: number }) => {
      if (connectMode && connectingFrom) {
        // Create a connection that attaches to this arrow
        addConnection({
          id: `conn-${Date.now()}`,
          from: connectingFrom,
          to: { connectionId, position },
          type: 'support',
        });
        onConnectionStart(''); // Clear connecting state
      }
    },
    [connectMode, connectingFrom, addConnection, onConnectionStart]
  );

  // Handle arrow hover
  const handleArrowHover = useCallback((arrowId: string | null) => {
    setHoveredArrowId(arrowId);
  }, []);

  // Handle connection selection
  const handleConnectionSelect = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      if (!connectMode) {
        setSelectedIds([id]);
      }
    },
    [setSelectedIds, connectMode]
  );

  // Handle element drag start
  const handleElementDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Handle element drag end with snap-to-lane
  const handleElementDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      setIsDragging(false);

      const element = elements.find((el) => el.id === id);
      const x = e.target.x();
      let y = e.target.y();

      // Snap to lane if close enough
      if (element) {
        y = snapToLane(y, element.size.height);
        e.target.y(y); // Update visual position immediately
      }

      moveElement(id, { x, y });
    },
    [moveElement, elements]
  );

  // Handle context menu (right-click)
  const handleContextMenu = useCallback(
    (id: string, elementType: ContextMenuState['elementType'], e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;

      // Get position relative to the container
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      setContextMenu({
        visible: true,
        x: e.evt.clientX,
        y: e.evt.clientY,
        elementId: id,
        elementType,
      });

      // Select the element if not already selected
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
    },
    [selectedIds, setSelectedIds]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  // Context menu actions
  const handleContextMenuDuplicate = useCallback(() => {
    if (contextMenu.elementId) {
      duplicateElements([contextMenu.elementId]);
    }
  }, [contextMenu.elementId, duplicateElements]);

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu.elementId) {
      if (contextMenu.elementType === 'connection') {
        removeConnection(contextMenu.elementId);
      } else {
        removeElement(contextMenu.elementId);
      }
    }
  }, [contextMenu.elementId, contextMenu.elementType, removeElement, removeConnection]);

  const handleContextMenuBringToFront = useCallback(() => {
    if (contextMenu.elementId) {
      bringToFront(contextMenu.elementId);
    }
  }, [contextMenu.elementId, bringToFront]);

  const handleContextMenuSendToBack = useCallback(() => {
    if (contextMenu.elementId) {
      sendToBack(contextMenu.elementId);
    }
  }, [contextMenu.elementId, sendToBack]);

  const handleContextMenuChangeContributor = useCallback(
    (contributor: ContributorType) => {
      if (contextMenu.elementId) {
        changeContributor(contextMenu.elementId, contributor);
      }
    },
    [contextMenu.elementId, changeContributor]
  );

  // Handle double-click for inline editing
  const handleElementDoubleClick = useCallback(
    (element: DiagramElement) => {
      setEditingElement(element);
    },
    []
  );

  // Handle inline edit save
  const handleInlineEditSave = useCallback(
    (id: string, content: string) => {
      updateElement(id, { content });
      setEditingElement(null);
    },
    [updateElement]
  );

  // Handle inline edit cancel
  const handleInlineEditCancel = useCallback(() => {
    setEditingElement(null);
  }, []);

  // Determine if we're connecting from a warrant-type element
  const connectingFromElement = connectingFrom
    ? elements.find((el) => el.id === connectingFrom)
    : null;
  const isWarrantConnection = connectingFromElement &&
    isArgumentElement(connectingFromElement) &&
    (connectingFromElement.argumentType === 'warrant' ||
     connectingFromElement.argumentType === 'backing' ||
     connectingFromElement.contributor === 'implicit');

  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden relative ${connectMode ? 'cursor-crosshair' : isPanMode ? 'cursor-grab' : ''}`}
      style={{ backgroundColor: '#f8f9fa' }}
    >
      {/* Status bar for connect mode */}
      {connectMode && (
        <div className="absolute top-16 left-64 z-10 bg-blue-500 text-white px-3 py-1 rounded-b text-sm">
          {connectingFrom
            ? isWarrantConnection
              ? 'Click an element OR an arrow to attach'
              : 'Click target element'
            : 'Click source element'}
        </div>
      )}

      {/* Pan mode indicator */}
      {isPanMode && (
        <div className="absolute top-16 left-64 z-10 bg-gray-700 text-white px-3 py-1 rounded-b text-sm flex items-center gap-2">
          <span>Pan Mode</span>
          <span className="text-gray-400 text-xs">Release Space to exit</span>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        draggable={!connectMode && isPanMode}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPan(e.target.x(), e.target.y());
          }
        }}
      >
        <Layer>
          {/* Lane guides - shown when dragging elements */}
          {isDragging && getLanePositions().map((laneY, index) => (
            <Line
              key={`lane-${index}`}
              points={[-500, laneY, LANE_CONFIG.width, laneY]}
              stroke="#4A90D9"
              strokeWidth={1}
              dash={[10, 5]}
              opacity={0.4}
              listening={false}
            />
          ))}

          {/* Render connections first (behind elements) */}
          {connections.map((connection) => (
            <ConnectionArrow
              key={connection.id}
              connection={connection}
              elements={elements}
              connections={connections}
              isSelected={selectedIds.includes(connection.id)}
              isHovered={hoveredArrowId === connection.id}
              connectModeActive={connectMode && !!connectingFrom && !!isWarrantConnection}
              onSelect={(e) => handleConnectionSelect(connection.id, e)}
              onArrowClick={handleArrowClick}
              onHover={handleArrowHover}
            />
          ))}

          {/* Render elements */}
          {elements.map((element) => {
            if (isArgumentElement(element)) {
              return (
                <ArgumentShape
                  key={element.id}
                  element={element}
                  isSelected={selectedIds.includes(element.id) || connectingFrom === element.id}
                  onSelect={(e) => handleElementSelect(element.id, e)}
                  onDoubleClick={() => handleElementDoubleClick(element)}
                  onDragStart={handleElementDragStart}
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                  shapeRef={(node) => registerShapeRef(element.id, node)}
                  onTransformEnd={(node) => handleTransformEnd(element.id, node)}
                  onContextMenu={(e) => handleContextMenu(element.id, 'argument', e)}
                />
              );
            }
            if (isSupportElement(element)) {
              return (
                <SupportShape
                  key={element.id}
                  element={element}
                  isSelected={selectedIds.includes(element.id) || connectingFrom === element.id}
                  onSelect={(e) => handleElementSelect(element.id, e)}
                  onDoubleClick={() => handleElementDoubleClick(element)}
                  onDragStart={handleElementDragStart}
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                  shapeRef={(node) => registerShapeRef(element.id, node)}
                  onTransformEnd={(node) => handleTransformEnd(element.id, node)}
                  onContextMenu={(e) => handleContextMenu(element.id, 'support', e)}
                />
              );
            }
            // Deprecated: TeacherSupportElement (for backwards compatibility)
            if (isTeacherSupportElement(element)) {
              return (
                <TeacherSupportShape
                  key={element.id}
                  element={element}
                  isSelected={selectedIds.includes(element.id) || connectingFrom === element.id}
                  onSelect={(e) => handleElementSelect(element.id, e)}
                  onDoubleClick={() => handleElementDoubleClick(element)}
                  onDragStart={handleElementDragStart}
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                  shapeRef={(node) => registerShapeRef(element.id, node)}
                  onTransformEnd={(node) => handleTransformEnd(element.id, node)}
                  onContextMenu={(e) => handleContextMenu(element.id, 'teacherSupport', e)}
                />
              );
            }
            if (isInfoBoxElement(element)) {
              return (
                <InfoBoxShape
                  key={element.id}
                  element={element}
                  isSelected={selectedIds.includes(element.id)}
                  onSelect={(e) => handleElementSelect(element.id, e)}
                  onDoubleClick={() => handleElementDoubleClick(element)}
                  onDragStart={handleElementDragStart}
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                  shapeRef={(node) => registerShapeRef(element.id, node)}
                  onTransformEnd={(node) => handleTransformEnd(element.id, node)}
                  onContextMenu={(e) => handleContextMenu(element.id, 'infoBox', e)}
                />
              );
            }
            return null;
          })}

          {/* Transformer for resizing selected elements */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Minimum size constraint
              if (newBox.width < 80 || newBox.height < 60) {
                return oldBox;
              }
              return newBox;
            }}
            rotateEnabled={false}
            keepRatio={false}
            borderStroke="#4A90D9"
            borderStrokeWidth={2}
            anchorStroke="#4A90D9"
            anchorFill="#FFFFFF"
            anchorSize={10}
            anchorCornerRadius={2}
          />

          {/* Legend */}
          {legendConfig.visible && (
            <Legend
              elements={elements}
              position={legendConfig.position}
              onDragEnd={moveLegend}
            />
          )}

          {/* Marquee Selection Rectangle */}
          <SelectionRect
            x={marqueeState.startX}
            y={marqueeState.startY}
            width={marqueeState.currentX - marqueeState.startX}
            height={marqueeState.currentY - marqueeState.startY}
            visible={marqueeState.isSelecting}
          />
        </Layer>
      </Stage>

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          elementId={contextMenu.elementId}
          elementType={contextMenu.elementType}
          onClose={closeContextMenu}
          onDuplicate={handleContextMenuDuplicate}
          onDelete={handleContextMenuDelete}
          onBringToFront={handleContextMenuBringToFront}
          onSendToBack={handleContextMenuSendToBack}
          onChangeContributor={contextMenu.elementType === 'argument' ? handleContextMenuChangeContributor : undefined}
        />
      )}

      {/* Inline Editor */}
      {editingElement && (
        <InlineEditor
          elementId={editingElement.id}
          content={editingElement.content}
          position={editingElement.position}
          size={editingElement.size}
          zoom={zoom}
          panX={panX}
          panY={panY}
          onSave={handleInlineEditSave}
          onCancel={handleInlineEditCancel}
        />
      )}
    </div>
  );
}
