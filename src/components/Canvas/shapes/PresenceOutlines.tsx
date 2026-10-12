import { Group, Rect, Text } from 'react-konva';
import type { DiagramElement } from '../../../types';
import { usePresenceStore } from '../../../live/presenceStore';
import { PRESENCE_OUTLINE_NAME } from '../../../utils/exportHideNodes';

interface PresenceOutlinesProps {
  elements: DiagramElement[];
}

/** A colored outline and name tag around each element a teammate has
 *  selected. Canvas-only: hidden from every export (exportHideNodes). */
export function PresenceOutlines({ elements }: PresenceOutlinesProps) {
  const others = usePresenceStore((s) => s.others);
  if (others.length === 0) return null;
  const byId = new Map(elements.map((e) => [e.id, e]));
  return (
    <>
      {others.flatMap((m) =>
        m.selectedIds.map((id, i) => {
          const el = byId.get(id);
          if (!el) return null;
          const pad = 6;
          return (
            <Group key={`${m.clientId}:${id}`} name={PRESENCE_OUTLINE_NAME} listening={false}>
              <Rect
                x={el.position.x - pad}
                y={el.position.y - pad}
                width={el.size.width + pad * 2}
                height={el.size.height + pad * 2}
                stroke={m.color}
                strokeWidth={2}
                cornerRadius={4}
              />
              {i === 0 && (
                <>
                  <Rect
                    x={el.position.x - pad}
                    y={el.position.y - pad - 16}
                    width={Math.min(160, m.name.length * 6.5 + 10)}
                    height={16}
                    fill={m.color}
                    cornerRadius={[3, 3, 0, 0]}
                  />
                  <Text
                    x={el.position.x - pad + 5}
                    y={el.position.y - pad - 13}
                    width={150}
                    text={m.name}
                    fontSize={11}
                    fill="#FFFFFF"
                    wrap="none"
                    ellipsis
                  />
                </>
              )}
            </Group>
          );
        }),
      )}
    </>
  );
}
