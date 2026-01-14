import { Group, Rect, Text, Line } from 'react-konva';
import type Konva from 'konva';
import type { DiagramElement, ArgumentElement, TeacherSupportElement } from '../../../types';
import { COLORS, getTeacherSupportColors } from '../../../utils/colors';

interface LegendProps {
  elements: DiagramElement[];
  position: { x: number; y: number };
  onDragEnd: (position: { x: number; y: number }) => void;
}

interface LegendItem {
  label: string;
  color: string;
  fill?: string;
  isDashed?: boolean;
  isCloud?: boolean;
  isEllipse?: boolean;
}

export function Legend({ elements, position, onDragEnd }: LegendProps) {
  // Analyze elements to determine which legend items to show
  const legendItems: LegendItem[] = [];

  // Track what types are used
  const usedContributors = new Set<string>();
  const usedTeacherSupport = new Set<string>();
  let hasInfoBox = false;

  elements.forEach((el) => {
    if (el.type === 'argument') {
      const argEl = el as ArgumentElement;
      usedContributors.add(argEl.contributor);
    } else if (el.type === 'teacherSupport') {
      const tsEl = el as TeacherSupportElement;
      usedTeacherSupport.add(tsEl.supportType);
    } else if (el.type === 'infoBox') {
      hasInfoBox = true;
    }
  });

  // Add contributor types
  if (usedContributors.has('given')) {
    legendItems.push({
      label: 'Given',
      color: COLORS.given,
      fill: '#F0FFF0',
    });
  }
  if (usedContributors.has('teacher')) {
    legendItems.push({
      label: 'Teacher',
      color: COLORS.teacher,
      isEllipse: true,
    });
  }
  if (usedContributors.has('student')) {
    legendItems.push({
      label: 'Student Contribution',
      color: COLORS.student,
      isDashed: true,
    });
  }
  if (usedContributors.has('joint')) {
    legendItems.push({
      label: 'Joint Contribution',
      color: COLORS.joint,
      isDashed: true,
    });
  }
  if (usedContributors.has('implicit')) {
    legendItems.push({
      label: 'Implicit (Unstated)',
      color: COLORS.implicit,
      isCloud: true,
    });
  }

  // Add teacher support types
  if (usedTeacherSupport.has('action')) {
    const colors = getTeacherSupportColors('action');
    legendItems.push({
      label: 'Teacher Action',
      color: colors.border,
      isEllipse: true,
    });
  }
  if (usedTeacherSupport.has('question')) {
    const colors = getTeacherSupportColors('question');
    legendItems.push({
      label: 'Question',
      color: colors.border,
      fill: colors.fill,
    });
  }
  if (usedTeacherSupport.has('other')) {
    const colors = getTeacherSupportColors('other');
    legendItems.push({
      label: 'Other Support',
      color: colors.border,
      fill: colors.fill,
    });
  }

  // Add info box if used
  if (hasInfoBox) {
    legendItems.push({
      label: 'Info Box',
      color: '#000000',
      fill: '#FFFFFF',
    });
  }

  // Don't render if no items
  if (legendItems.length === 0) {
    return null;
  }

  const padding = 12;
  const itemHeight = 24;
  const swatchWidth = 30;
  const swatchHeight = 16;
  const labelOffset = 40;
  const legendWidth = 180;
  const legendHeight = padding * 2 + 24 + legendItems.length * itemHeight;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd({
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  return (
    <Group x={position.x} y={position.y} draggable onDragEnd={handleDragEnd}>
      {/* Background */}
      <Rect
        width={legendWidth}
        height={legendHeight}
        fill="#FFFFFF"
        stroke="#333333"
        strokeWidth={1}
        cornerRadius={4}
        shadowColor="black"
        shadowBlur={8}
        shadowOpacity={0.15}
        shadowOffset={{ x: 2, y: 2 }}
      />

      {/* Title */}
      <Text
        x={padding}
        y={padding}
        text="Legend"
        fontSize={14}
        fontStyle="bold"
        fill="#333333"
      />

      {/* Legend items */}
      {legendItems.map((item, index) => {
        const y = padding + 24 + index * itemHeight;

        return (
          <Group key={item.label} y={y}>
            {/* Swatch */}
            {item.isEllipse ? (
              // Ellipse for teacher action
              <>
                <Rect
                  x={padding}
                  y={0}
                  width={swatchWidth}
                  height={swatchHeight}
                  fill="#FFFFFF"
                />
                <Line
                  points={generateEllipsePoints(padding + swatchWidth / 2, swatchHeight / 2, swatchWidth / 2 - 2, swatchHeight / 2 - 2)}
                  closed
                  fill="#FFFFFF"
                  stroke={item.color}
                  strokeWidth={2}
                />
              </>
            ) : item.isCloud ? (
              // Cloud shape for implicit
              <>
                <Line
                  points={generateCloudPoints(padding, 0, swatchWidth, swatchHeight)}
                  closed
                  fill="#FFFFFF"
                  stroke={item.color}
                  strokeWidth={1.5}
                  tension={0.5}
                />
              </>
            ) : (
              // Rectangle for other types
              <Rect
                x={padding}
                y={0}
                width={swatchWidth}
                height={swatchHeight}
                fill={item.fill || '#FFFFFF'}
                stroke={item.color}
                strokeWidth={2}
                dash={item.isDashed ? [6, 3] : undefined}
              />
            )}

            {/* Label */}
            <Text
              x={padding + labelOffset}
              y={2}
              text={item.label}
              fontSize={11}
              fill="#333333"
            />
          </Group>
        );
      })}
    </Group>
  );
}

// Helper to generate ellipse points
function generateEllipsePoints(cx: number, cy: number, rx: number, ry: number): number[] {
  const points: number[] = [];
  const segments = 20;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return points;
}

// Helper to generate cloud points
function generateCloudPoints(x: number, y: number, width: number, height: number): number[] {
  const points: number[] = [];
  const bumps = 6;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2 - 1;
  const ry = height / 2 - 1;

  for (let i = 0; i <= bumps * 4; i++) {
    const angle = (i / (bumps * 4)) * Math.PI * 2;
    const bumpOffset = Math.sin(i * Math.PI / 2) * 2;
    const px = cx + (rx + bumpOffset) * Math.cos(angle);
    const py = cy + (ry + bumpOffset) * Math.sin(angle);
    points.push(px, py);
  }
  return points;
}
