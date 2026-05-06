import { Group, Rect, Ellipse, Text, Path } from 'react-konva';
import { generateCloudPath } from '../../../utils/cloudPath';
import type Konva from 'konva';
import type { ArgumentElement } from '../../../types';
import { EmbeddedImage } from './EmbeddedImage';
import { useDiagramStore } from '../../../store';
import { resolveArgumentStyle, dashArrayForBorderStyle } from '../../../utils/styleResolver';

interface ArgumentShapeProps {
  element: ArgumentElement;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDoubleClick?: () => void;
  onDragStart?: () => void;
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
  onDragStart,
  onDragEnd,
  shapeRef,
  onTransformEnd,
  onContextMenu,
}: ArgumentShapeProps) {
  const { position, size, label, content, attribution, image, imageSettings } = element;
  const styleConfig = useDiagramStore((s) => s.styleConfig);
  const style = resolveArgumentStyle(element, styleConfig);

  // Format attribution text
  const attributionText = attribution?.speaker || attribution?.timestamp
    ? `${attribution.speaker || ''}${attribution.speaker && attribution.timestamp ? ' @ ' : ''}${attribution.timestamp || ''}`
    : '';

  // Determine border style from resolver
  const borderColor = style.borderColor;
  const isCloud = style.borderShape === 'cloud';
  const strokeWidth = style.borderWidth;
  const dashArray = dashArrayForBorderStyle(style.borderStyle);

  // Calculate text positioning
  // Cloud shapes inset their interior by the bump radius, so add a bit more padding
  // to keep text off the bumps.
  const padding = isCloud ? 12 : 10;
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
        onDragStart={onDragStart}
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
          fill={style.backgroundColor}
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
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTransformEnd={(e) => onTransformEnd?.(e.target as Konva.Group)}
      onContextMenu={onContextMenu}
    >
      {/* Background */}
      {style.borderShape === 'ellipse' ? (
        <Ellipse
          x={size.width / 2}
          y={size.height / 2}
          radiusX={size.width / 2}
          radiusY={size.height / 2}
          fill={style.backgroundColor}
          stroke={borderColor}
          strokeWidth={strokeWidth}
          dash={dashArray}
        />
      ) : (
        <Rect
          width={size.width}
          height={size.height}
          fill={style.backgroundColor}
          stroke={borderColor}
          strokeWidth={strokeWidth}
          dash={dashArray}
          cornerRadius={style.borderShape === 'rounded' ? 8 : 0}
        />
      )}
      {/* Selection indicator */}
      {isSelected && (
        style.borderShape === 'ellipse' ? (
          <Ellipse
            x={size.width / 2}
            y={size.height / 2}
            radiusX={size.width / 2 + 4}
            radiusY={size.height / 2 + 4}
            stroke="#4A90D9"
            strokeWidth={2}
            fill="transparent"
            dash={[5, 3]}
          />
        ) : (
          <Rect
            width={size.width + 6}
            height={size.height + 6}
            x={-3}
            y={-3}
            stroke="#4A90D9"
            strokeWidth={2}
            fill="transparent"
            dash={[5, 3]}
            cornerRadius={style.borderShape === 'rounded' ? 10 : 0}
          />
        )
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

interface CloudShapeProps {
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  isSelected: boolean;
}

const SELECTION_INFLATE = 0.08;

function CloudShape({
  width,
  height,
  stroke,
  strokeWidth,
  fill,
  isSelected,
}: CloudShapeProps) {
  const cloudPath = generateCloudPath(width, height);

  return (
    <>
      <Path
        data={cloudPath}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {isSelected && (
        <Path
          data={cloudPath}
          scaleX={1 + SELECTION_INFLATE}
          scaleY={1 + SELECTION_INFLATE}
          x={-(width * SELECTION_INFLATE) / 2}
          y={-(height * SELECTION_INFLATE) / 2}
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
          fill=""
        />
      )}
    </>
  );
}
