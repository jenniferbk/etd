import { Group, Rect, Ellipse, Text, Line } from 'react-konva';
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
  // Cloud shapes need more padding because the elliptical boundary curves inward
  const padding = isCloud ? 18 : 10;
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

// Classic comic-style thought bubble shape with scalloped bumps
interface CloudShapeProps {
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  isSelected: boolean;
}

// Generate thought bubble path using absolute cosine modulation
// All bumps go outward (no inward cusps) creating classic cloud appearance
function generateThoughtBubblePath(width: number, height: number): number[] {
  const cx = width / 2;
  const cy = height / 2;

  // Bump depth - how far out each bump extends (calculated first)
  const baseBumpDepth = Math.min(width, height) * 0.08;

  // Base ellipse dimensions - sized so bumps reach the bounding box edge
  // rx + bumpDepth ≈ width/2, so rx ≈ width/2 - bumpDepth
  const rx = (width / 2) - baseBumpDepth;
  const ry = (height / 2) - baseBumpDepth;

  // Number of bumps - scales with size
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const numBumps = Math.max(8, Math.min(18, Math.round(perimeter / 35)));

  // Actual bump depth
  const bumpDepth = baseBumpDepth;

  const points: number[] = [];
  const pointsPerBump = 8;
  const totalPoints = numBumps * pointsPerBump;

  for (let i = 0; i <= totalPoints; i++) {
    const t = (i / totalPoints) * Math.PI * 2;

    // Base position on ellipse
    const baseX = cx + rx * Math.cos(t);
    const baseY = cy + ry * Math.sin(t);

    // Absolute cosine - ALL bumps go outward, no inward cusps
    // |cos| oscillates between 0 and 1, creating smooth bumps
    const bumpPhase = t * numBumps;
    const bumpWave = Math.abs(Math.cos(bumpPhase));

    // Apply bump outward
    const bumpAmount = bumpWave * bumpDepth;

    // Normal direction (outward from center)
    const normalX = Math.cos(t);
    const normalY = Math.sin(t);

    // Final position - base + outward bump
    const finalX = baseX + normalX * bumpAmount;
    const finalY = baseY + normalY * bumpAmount;

    points.push(finalX, finalY);
  }

  return points;
}

function CloudShape({
  width,
  height,
  stroke,
  strokeWidth,
  fill,
  isSelected,
}: CloudShapeProps) {
  const cx = width / 2;
  const cy = height / 2;

  // Generate the thought bubble path
  const points = generateThoughtBubblePath(width, height);

  // Generate selection outline (slightly larger)
  const selectionPoints = points.map((p, i) => {
    if (i % 2 === 0) {
      return p + (p > cx ? 5 : -5);
    } else {
      return p + (p > cy ? 5 : -5);
    }
  });

  return (
    <>
      <Line
        points={points}
        closed
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        tension={0.2}
        lineCap="round"
        lineJoin="round"
      />
      {isSelected && (
        <Line
          points={selectionPoints}
          closed
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
          tension={0.2}
        />
      )}
    </>
  );
}
