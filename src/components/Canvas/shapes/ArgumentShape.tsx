import { Group, Rect, Text, Line } from 'react-konva';
import type Konva from 'konva';
import type { ArgumentElement } from '../../../types';
import { getContributorColor } from '../../../utils/colors';
import { EmbeddedImage } from './EmbeddedImage';

interface ArgumentShapeProps {
  element: ArgumentElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDoubleClick?: () => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  shapeRef?: (node: Konva.Group | null) => void;
  onTransformEnd?: (node: Konva.Group) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}

export function ArgumentShape({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  onDragEnd,
  shapeRef,
  onTransformEnd,
  onContextMenu,
}: ArgumentShapeProps) {
  const { position, size, label, content, contributor, attribution, image, imageSettings } = element;
  const borderColor = getContributorColor(contributor);

  // Format attribution text
  const attributionText = attribution?.speaker || attribution?.timestamp
    ? `${attribution.speaker || ''}${attribution.speaker && attribution.timestamp ? ' @ ' : ''}${attribution.timestamp || ''}`
    : '';

  // Determine border style
  const isDashed = contributor === 'student' || contributor === 'joint';
  const isCloud = contributor === 'implicit';
  const strokeWidth = contributor === 'implicit' ? 2 : 3;

  // Calculate text positioning
  // Cloud shapes need more padding because the elliptical boundary curves inward
  const padding = isCloud ? 25 : 10;
  const labelHeight = 20;

  if (isCloud) {
    // Render cloud shape for implicit elements
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
        onDragEnd={onDragEnd}
        onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
        onContextMenu={onContextMenu}
      >
        {/* Cloud shape using bezier curves */}
        <CloudShape
          width={size.width}
          height={size.height}
          stroke={borderColor}
          strokeWidth={strokeWidth}
          fill="#FFFFFF"
          isSelected={isSelected}
        />
        {/* Label - underlined */}
        <Text
          x={padding}
          y={padding}
          width={size.width - padding * 2}
          text={label}
          fontSize={14}
          fontStyle="bold"
          textDecoration="underline"
          fill="#000000"
        />
        {/* Content */}
        <Text
          x={padding}
          y={padding + labelHeight}
          width={size.width - padding * 2}
          height={size.height - padding * 2 - labelHeight - (attributionText ? 12 : 0) - (image ? 100 : 0)}
          text={content}
          fontSize={12}
          fill="#000000"
          wrap="word"
        />
        {/* Embedded Image */}
        {image && (
          <EmbeddedImage
            imageData={image}
            x={padding}
            y={size.height - 110 - (attributionText ? 16 : 0)}
            maxWidth={size.width - padding * 2}
            maxHeight={100}
            scale={imageSettings?.scale ?? 1}
            offsetX={imageSettings?.offsetX ?? 0}
            offsetY={imageSettings?.offsetY ?? 0}
            cropArea={imageSettings?.cropArea}
            elementLabel={label}
            elementId={element.id}
            isSelected={isSelected}
          />
        )}
        {/* Attribution */}
        {attributionText && (
          <Text
            x={padding}
            y={size.height - 16}
            width={size.width - padding * 2}
            text={attributionText}
            fontSize={10}
            fill="#666666"
            fontStyle="italic"
            align="right"
          />
        )}
      </Group>
    );
  }

  // Standard rectangle shape
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
      onDragEnd={onDragEnd}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onContextMenu={onContextMenu}
    >
      {/* Background */}
      <Rect
        width={size.width}
        height={size.height}
        fill={contributor === 'given' ? '#F0FFF0' : '#FFFFFF'}
        stroke={borderColor}
        strokeWidth={strokeWidth}
        dash={isDashed ? [10, 5] : undefined}
        cornerRadius={0}
      />
      {/* Selection indicator */}
      {isSelected && (
        <Rect
          width={size.width + 6}
          height={size.height + 6}
          x={-3}
          y={-3}
          stroke="#4A90D9"
          strokeWidth={2}
          fill="transparent"
          dash={[5, 3]}
        />
      )}
      {/* Label - underlined */}
      <Text
        x={padding}
        y={padding}
        width={size.width - padding * 2}
        text={label}
        fontSize={14}
        fontStyle="bold"
        textDecoration="underline"
        fill={borderColor}
      />
      {/* Content */}
      <Text
        x={padding}
        y={padding + labelHeight}
        width={size.width - padding * 2}
        height={size.height - padding * 2 - labelHeight - (attributionText ? 12 : 0) - (image ? 100 : 0)}
        text={content}
        fontSize={12}
        fill="#000000"
        wrap="word"
      />
      {/* Embedded Image */}
      {image && (
        <EmbeddedImage
          imageData={image}
          x={padding}
          y={size.height - 110 - (attributionText ? 16 : 0)}
          maxWidth={size.width - padding * 2}
          maxHeight={100}
          scale={imageSettings?.scale ?? 1}
          offsetX={imageSettings?.offsetX ?? 0}
          offsetY={imageSettings?.offsetY ?? 0}
          cropArea={imageSettings?.cropArea}
          elementLabel={label}
          elementId={element.id}
          isSelected={isSelected}
        />
      )}
      {/* Attribution */}
      {attributionText && (
        <Text
          x={padding}
          y={size.height - 16}
          width={size.width - padding * 2}
          text={attributionText}
          fontSize={10}
          fill="#666666"
          fontStyle="italic"
          align="right"
        />
      )}
    </Group>
  );
}

// Cloud/thought bubble shape component
interface CloudShapeProps {
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  isSelected: boolean;
}

function CloudShape({
  width,
  height,
  stroke,
  strokeWidth,
  fill,
  isSelected,
}: CloudShapeProps) {
  // Create cloud outline using a series of arcs
  // This creates a bumpy cloud-like border
  const bumps = 8;
  const points: number[] = [];

  // Generate cloud path points
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 5;
  const ry = height / 2 - 5;

  for (let i = 0; i <= bumps * 4; i++) {
    const angle = (i / (bumps * 4)) * Math.PI * 2;
    const bumpOffset = Math.sin(i * Math.PI / 2) * 5;
    const x = cx + (rx + bumpOffset) * Math.cos(angle);
    const y = cy + (ry + bumpOffset) * Math.sin(angle);
    points.push(x, y);
  }

  return (
    <>
      <Line
        points={points}
        closed
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        tension={0.5}
      />
      {isSelected && (
        <Line
          points={points.map((p, i) =>
            i % 2 === 0 ? p + (p > cx ? 3 : -3) : p + (p > cy ? 3 : -3)
          )}
          closed
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
          tension={0.5}
        />
      )}
    </>
  );
}
