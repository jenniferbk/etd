import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { InfoBoxElement } from '../../../types';

interface InfoBoxShapeProps {
  element: InfoBoxElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  shapeRef?: (node: Konva.Group | null) => void;
  onTransformEnd?: (node: Konva.Group) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}

export function InfoBoxShape({
  element,
  isSelected,
  onSelect,
  onDragEnd,
  shapeRef,
  onTransformEnd,
  onContextMenu,
}: InfoBoxShapeProps) {
  const { position, size, label, content, attribution } = element;

  // Format attribution text
  const attributionText = attribution?.speaker || attribution?.timestamp
    ? `${attribution.speaker || ''}${attribution.speaker && attribution.timestamp ? ' @ ' : ''}${attribution.timestamp || ''}`
    : '';

  return (
    <Group
      ref={shapeRef}
      x={position.x}
      y={position.y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={onDragEnd}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onContextMenu={onContextMenu}
    >
      {/* Black-bordered rectangle */}
      <Rect
        width={size.width}
        height={size.height}
        fill="#FFFFFF"
        stroke={isSelected ? '#4A90D9' : '#000000'}
        strokeWidth={isSelected ? 3 : 2}
      />

      {/* Label */}
      <Text
        x={8}
        y={6}
        width={size.width - 16}
        text={label}
        fontSize={12}
        fontStyle="bold"
        fill="#000000"
      />

      {/* Content - multi-line text */}
      <Text
        x={8}
        y={24}
        width={size.width - 16}
        height={size.height - 32 - (attributionText ? 12 : 0)}
        text={content}
        fontSize={11}
        fill="#333333"
        wrap="word"
        ellipsis={true}
      />
      {/* Attribution */}
      {attributionText && (
        <Text
          x={8}
          y={size.height - 16}
          width={size.width - 16}
          text={attributionText}
          fontSize={9}
          fill="#666666"
          fontStyle="italic"
          align="right"
        />
      )}
    </Group>
  );
}
