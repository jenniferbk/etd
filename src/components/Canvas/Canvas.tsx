import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import { useDiagramStore } from '../../store';
import { ArgumentShape } from './shapes/ArgumentShape';
import { TeacherSupportShape } from './shapes/TeacherSupportShape';
import { ConnectionArrow } from './shapes/Arrow';
import { isArgumentElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';
import { InfoBoxShape } from './shapes/InfoBoxShape';

interface CanvasProps {
  connectMode: boolean;
  onConnectionStart: (id: string) => void;
  connectingFrom: string | null;
}

export function Canvas({ connectMode, onConnectionStart, connectingFrom }: CanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [hoveredArrowId, setHoveredArrowId] = useState<string | null>(null);

  const {
    elements,
    connections,
    zoom,
    panX,
    panY,
    selectedIds,
    setZoom,
    setPan,
    setSelectedIds,
    clearSelection,
    moveElement,
    addConnection,
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

  // Handle element selection (or connection)
  const handleElementSelect = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
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
    (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      if (!connectMode) {
        setSelectedIds([id]);
      }
    },
    [setSelectedIds, connectMode]
  );

  // Handle element drag
  const handleElementDragEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
      moveElement(id, {
        x: e.target.x(),
        y: e.target.y(),
      });
    },
    [moveElement]
  );

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
      className={`flex-1 overflow-hidden ${connectMode ? 'cursor-crosshair' : ''}`}
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

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        draggable={!connectMode}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPan(e.target.x(), e.target.y());
          }
        }}
      >
        <Layer>
          {/* Render connections first (behind elements) */}
          {connections.map((connection) => (
            <ConnectionArrow
              key={connection.id}
              connection={connection}
              elements={elements}
              connections={connections}
              isSelected={selectedIds.includes(connection.id)}
              isHovered={hoveredArrowId === connection.id}
              connectModeActive={connectMode && !!connectingFrom && isWarrantConnection}
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
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                />
              );
            }
            if (isTeacherSupportElement(element)) {
              return (
                <TeacherSupportShape
                  key={element.id}
                  element={element}
                  isSelected={selectedIds.includes(element.id) || connectingFrom === element.id}
                  onSelect={(e) => handleElementSelect(element.id, e)}
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
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
                  onDragEnd={(e) => handleElementDragEnd(element.id, e)}
                />
              );
            }
            return null;
          })}
        </Layer>
      </Stage>
    </div>
  );
}
