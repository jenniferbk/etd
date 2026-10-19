import { Group, Line, Rect, Text } from 'react-konva';
import { useCollabStore } from '../../../live/collabStore';
import { usePresenceStore } from '../../../live/presenceStore';
import { PRESENCE_OUTLINE_NAME } from '../../../utils/exportHideNodes';

// Pointer arrow, tip at (0,0), in screen pixels.
const ARROW = [0, 0, 0, 16, 4.5, 12, 7.5, 18.5, 10, 17.5, 7, 11.5, 12, 11.5];

/** Teammates' pointers with name tags, drawn at a constant on-screen size.
 *  Canvas-only: shares the presence-outline name so exports hide it. */
export function LiveCursors({ zoom }: { zoom: number }) {
  const cursors = useCollabStore((s) => s.cursors);
  const others = usePresenceStore((s) => s.others);
  const scale = 1 / zoom;
  return (
    <>
      {others.map((m) => {
        const pos = cursors[m.clientId];
        if (!pos) return null;
        const labelWidth = Math.min(160, m.name.length * 6.5 + 12);
        return (
          <Group
            key={m.clientId}
            name={PRESENCE_OUTLINE_NAME}
            listening={false}
            x={pos.x}
            y={pos.y}
            scaleX={scale}
            scaleY={scale}
          >
            <Line points={ARROW} closed fill={m.color} stroke="#FFFFFF" strokeWidth={1.5} lineJoin="round" />
            <Rect x={12} y={18} width={labelWidth} height={17} fill={m.color} cornerRadius={4} />
            <Text x={18} y={21} width={labelWidth - 10} text={m.name} fontSize={11} fill="#FFFFFF" wrap="none" ellipsis />
          </Group>
        );
      })}
    </>
  );
}
