import { Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { NOTE_BADGE_NAME } from '../../../utils/exportHideNodes';

interface NoteBadgeProps {
  x: number;
  y: number;
  count: number;
  onClick?: () => void;
}

/** Small "has analytic notes" marker. Rendered inside a shape's Group so it
 *  follows drags; named `note-badge` so exports can hide it
 *  (utils/exportHideNodes). Never emitted by svgExport. */
export function NoteBadge({ x, y, count, onClick }: NoteBadgeProps) {
  const handle = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onClick?.();
  };
  const width = count > 1 ? 18 : 14;
  return (
    <Group
      x={x}
      y={y}
      name={NOTE_BADGE_NAME}
      onClick={handle}
      onTap={handle}
      onDblClick={handle}
      onDblTap={handle}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      <Rect
        width={width}
        height={14}
        fill="#F5D76E"
        stroke="#8a6f47"
        strokeWidth={1}
        cornerRadius={3}
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={0.2}
      />
      <Text
        x={0}
        y={2}
        width={width}
        align="center"
        text={count > 1 ? String(count) : '≡'}
        fontSize={9}
        fontStyle="bold"
        fill="#2a3324"
        listening={false}
      />
    </Group>
  );
}
