import { Group, Rect, Ellipse, Text } from 'react-konva';
import type Konva from 'konva';
import type { SupportElement } from '../../../types';
import { useDiagramStore } from '../../../store';
import { resolveSupportStyle, dashArrayForBorderStyle } from '../../../utils/styleResolver';

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

  const styleConfig = useDiagramStore((s) => s.styleConfig);
  const style = resolveSupportStyle(element, styleConfig);
  const dashArray = dashArrayForBorderStyle(style.borderStyle);

  const padding = 8;

  // Format attribution text
  const attributionText = attribution?.speaker || attribution?.timestamp
    ? `${attribution.speaker || ''}${attribution.speaker && attribution.timestamp ? ' @ ' : ''}${attribution.timestamp || ''}`
    : '';

  // Contributor label
  const contributorLabel = contributor === 'teacher' ? 'T' : 'S';

  // Build header label (action has no header)
  const supportTypeLabel = styleConfig.supportTypes[supportType].label;
  const subtypeLabel = supportType === 'other' && subtype
    ? styleConfig.otherSubtypes.find((s) => s.id === subtype)?.label ?? subtype
    : null;
  const headerLabel =
    supportType === 'action' ? '' :
    supportType === 'question' ? `[${contributorLabel}] ${supportTypeLabel}` :
    `[${contributorLabel}] ${subtypeLabel ?? supportTypeLabel}`;

  // Shape node: ellipse for action, rounded/plain rect otherwise
  const shapeNode =
    style.borderShape === 'ellipse' ? (
      <>
        <Ellipse
          x={size.width / 2}
          y={size.height / 2}
          radiusX={size.width / 2}
          radiusY={size.height / 2}
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          dash={dashArray}
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
      </>
    ) : (
      <>
        <Rect
          width={size.width}
          height={size.height}
          fill={style.backgroundColor}
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          dash={dashArray}
          cornerRadius={style.borderShape === 'rounded' ? 8 : 0}
        />
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
            cornerRadius={style.borderShape === 'rounded' ? 10 : 0}
          />
        )}
      </>
    );

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
      {shapeNode}
      {/* Contributor indicator */}
      {style.borderShape === 'ellipse' && (
        <Text
          x={4}
          y={4}
          text={contributorLabel}
          fontSize={10}
          fontStyle="bold"
          fill={style.borderColor}
        />
      )}
      {/* Header label (empty for action) */}
      {headerLabel !== '' && (
        <Text
          x={padding}
          y={padding}
          width={size.width - padding * 2}
          text={headerLabel}
          fontSize={10}
          fontStyle="bold"
          fill={style.borderColor}
        />
      )}
      {/* Content */}
      <Text
        x={style.borderShape === 'ellipse' ? padding * 2 : padding}
        y={style.borderShape === 'ellipse'
          ? size.height * 0.15
          : headerLabel !== '' ? padding + 14 : padding}
        width={style.borderShape === 'ellipse'
          ? size.width - padding * 4
          : size.width - padding * 2}
        height={style.borderShape === 'ellipse'
          ? (attributionText ? size.height * 0.55 : size.height * 0.7)
          : size.height - padding * 2 - (headerLabel !== '' ? 14 : 0) - (attributionText ? 12 : 0)}
        text={content}
        fontSize={11}
        fill="#000000"
        align={style.borderShape === 'ellipse' ? 'center' : 'left'}
        verticalAlign={style.borderShape === 'ellipse' ? 'middle' : 'top'}
        wrap="word"
      />
      {/* Attribution */}
      {attributionText && (
        <Text
          x={style.borderShape === 'ellipse' ? padding * 2 : padding}
          y={style.borderShape === 'ellipse' ? size.height * 0.72 : size.height - 14}
          width={style.borderShape === 'ellipse'
            ? size.width - padding * 4
            : size.width - padding * 2}
          text={attributionText}
          fontSize={9}
          fill="#666666"
          fontStyle="italic"
          align={style.borderShape === 'ellipse' ? 'center' : 'right'}
        />
      )}
    </Group>
  );
}
