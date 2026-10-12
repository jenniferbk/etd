import { usePresenceStore, type PresenceMember } from '../../live/presenceStore';
import { theme } from '../../utils/theme';

function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const MAX_SHOWN = 4;

/** Colored initials for each teammate who has this diagram open right now.
 *  The same color outlines whatever they have selected on the canvas. */
export function PresenceAvatars() {
  const others = usePresenceStore((s) => s.others);
  if (others.length === 0) return null;

  // One avatar per person even if they have the diagram open in two tabs.
  const people = new Map<number, PresenceMember>();
  for (const m of others) if (!people.has(m.userId)) people.set(m.userId, m);
  const list = [...people.values()];
  const shown = list.slice(0, MAX_SHOWN);
  const names = list.map((m) => m.name).join(', ');

  return (
    <div className="flex items-center -space-x-1.5" role="group" aria-label={`Also editing: ${names}`} title={`Also editing: ${names}`}>
      {shown.map((m) => (
        <span
          key={m.userId}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold select-none"
          style={{ backgroundColor: m.color, color: '#FFFFFF', border: `2px solid ${theme.toolbar.bg}` }}
          title={m.name}
          aria-hidden
        >
          {initials(m.name)}
        </span>
      ))}
      {list.length > MAX_SHOWN && (
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
          style={{ backgroundColor: theme.sidebar.hover, color: theme.sidebar.text, border: `2px solid ${theme.toolbar.bg}` }}
          aria-hidden
        >
          +{list.length - MAX_SHOWN}
        </span>
      )}
    </div>
  );
}
