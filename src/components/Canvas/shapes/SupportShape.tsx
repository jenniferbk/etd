import { Group, Ellipse, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { SupportElement } from '../../../types';
import { getSupportColors } from '../../../utils/colors';

interface SupportShapeProps {
  element: SupportElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDoubleClick?: () => void;
  onDragStart?: () => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  shapeRef?: (node: Konva.Group | null) => void;
  onTransformEnd?: (node: Konva.Group) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}

export function SupportShape({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  shapeRef,
  onTransformEnd,
  onContextMenu,
}: SupportShapeProps) {
  const { position, size, content, supportType, subtype, contributor, attribution } = element;
  const { border, fill } = getSupportColors(supportType, contributor);

  const padding = 8;

  // Format attribution text
  const attributionText = attribution?.speaker || attribution?.timestamp
    ? `${attribution.speaker || ''}${attribution.speaker && attribution.timestamp ? ' @ ' : ''}${attribution.timestamp || ''}`
    : '';

  // Contributor label
  const contributorLabel = contributor === 'teacher' ? 'T' : 'S';

  // Action - Ellipse shape
  if (supportType === 'action') {
    return (
      <Group
        ref={shapeRef}
        x={position.x}
        y={position.y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDoubleClick}
        onDblTap={onDoubleClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
        onContextMenu={onContextMenu}
      >
        <Ellipse
          x={size.width / 2}
          y={size.height / 2}
          radiusX={size.width / 2}
          radiusY={size.height / 2}
          fill={fill}
          stroke={border}
          strokeWidth={2}
        />
        {isSelected && (
          <Ellipse
            x={size.width / 2}
            y={size.height / 2}
            radiusX={size.width / 2 + 4}
            radiusY={size.height / 2 + 4}
            stroke="#4A90D9"
            strokeWidth={2}
            dash={[5, 3]}
          />
        )}
        {/* Contributor indicator */}
        <Text
          x={4}
          y={4}
          text={contributorLabel}
          fontSize={10}
          fontStyle="bold"
          fill={border}
        />
        <Text
          x={padding}
          y={size.height / 2 - 12}
          width={size.width - padding * 2}
          text={content}
          fontSize={11}
          fill={border}
          align="center"
          wrap="word"
        />
        {/* Attribution */}
        {attributionText && (
          <Text
            x={padding}
            y={size.height - 16}
            width={size.width - padding * 2}
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

  // Question - Rounded Rectangle
  if (supportType === 'question') {
    return (
      <Group
        ref={shapeRef}
        x={position.x}
        y={position.y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDoubleClick}
        onDblTap={onDoubleClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
        onContextMenu={onContextMenu}
      >
        <Rect
          width={size.width}
          height={size.height}
          fill={fill}
          stroke={border}
          strokeWidth={2}
          cornerRadius={8}
        />
        {isSelected && (
          <Rect
            width={size.width + 6}
            height={size.height + 6}
            x={-3}
            y={-3}
            stroke="#4A90D9"
            strokeWidth={2}
            dash={[5, 3]}
            cornerRadius={10}
          />
        )}
        {/* Label with contributor */}
        <Text
          x={padding}
          y={padding}
          width={size.width - padding * 2}
          text={`[${contributorLabel}] Question`}
          fontSize={10}
          fontStyle="bold"
          fill={border}
        />
        {/* Content */}
        <Text
          x={padding}
          y={padding + 14}
          width={size.width - padding * 2}
          height={size.height - padding * 2 - 14 - (attributionText ? 12 : 0)}
          text={content}
          fontSize={11}
          fill="#000000"
          wrap="word"
        />
        {/* Attribution */}
        {attributionText && (
          <Text
            x={padding}
            y={size.height - 14}
            width={size.width - padding * 2}
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

  // Other Support - Rounded Rectangle
  return (
    <Group
      ref={shapeRef}
      x={position.x}
      y={position.y}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDoubleClick}
      onDblTap={onDoubleClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onContextMenu={onContextMenu}
    >
      <Rect
        width={size.width}
        height={size.height}
        fill={fill}
        stroke={border}
        strokeWidth={2}
        cornerRadius={8}
      />
      {isSelected && (
        <Rect
          width={size.width + 6}
          height={size.height + 6}
          x={-3}
          y={-3}
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
          cornerRadius={10}
        />
      )}
      {/* Label with subtype and contributor */}
      <Text
        x={padding}
        y={padding}
        width={size.width - padding * 2}
        text={`[${contributorLabel}] ${subtype ? subtype.charAt(0).toUpperCase() + subtype.slice(1) : 'Other'}`}
        fontSize={10}
        fontStyle="bold"
        fill="#000000"
      />
      {/* Content */}
      <Text
        x={padding}
        y={padding + 14}
        width={size.width - padding * 2}
        height={size.height - padding * 2 - 14 - (attributionText ? 12 : 0)}
        text={content}
        fontSize={11}
        fill="#000000"
        wrap="word"
      />
      {/* Attribution */}
      {attributionText && (
        <Text
          x={padding}
          y={size.height - 14}
          width={size.width - padding * 2}
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
