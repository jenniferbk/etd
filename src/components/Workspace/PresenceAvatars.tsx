import { Crosshair, Megaphone } from 'lucide-react';
import { usePresenceStore, type PresenceMember } from '../../live/presenceStore';
import { useCollabStore } from '../../live/collabStore';
import { getLiveSession } from '../../live/liveSession';
import { centerOn } from '../../live/viewport';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { friendlyError } from '../../api/friendlyError';
import { useMenu } from '../Toolbar/useMenu';
import { theme } from '../../utils/theme';

function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const MAX_SHOWN = 4;

function Avatar({ m }: { m: PresenceMember }) {
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold select-none flex-shrink-0"
      style={{ backgroundColor: m.color, color: '#FFFFFF', border: `2px solid ${theme.toolbar.bg}` }}
      aria-hidden
    >
      {initials(m.name)}
    </span>
  );
}

/** Colored initials for each teammate who has this diagram open right now.
 *  The same color outlines whatever they have selected and marks their
 *  pointer. Clicking opens a list to jump to someone or ask them over. */
export function PresenceAvatars() {
  const others = usePresenceStore((s) => s.others);
  const cursors = useCollabStore((s) => s.cursors);
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  if (others.length === 0) return null;

  // One entry per person even if they have the diagram open in two tabs.
  const people = new Map<number, PresenceMember[]>();
  for (const m of others) people.set(m.userId, [...(people.get(m.userId) ?? []), m]);
  const list = [...people.values()].map((tabs) => tabs[0]);
  const shown = list.slice(0, MAX_SHOWN);
  const names = list.map((m) => m.name).join(', ');

  const cursorOf = (userId: number) => {
    for (const tab of people.get(userId) ?? []) if (cursors[tab.clientId]) return cursors[tab.clientId];
    return null;
  };

  const goTo = (userId: number) => {
    const pos = cursorOf(userId);
    if (!pos) return;
    const { zoom, viewportSize, setPan } = useDiagramStore.getState();
    const { panX, panY } = centerOn(pos, zoom, viewportSize);
    setPan(panX, panY);
    close();
  };

  const summon = async (who: PresenceMember | null) => {
    close();
    const session = getLiveSession();
    if (!session) return;
    try {
      await session.summon(who?.userId);
      useToastStore.getState().addToast('info', who ? `Asked ${who.name} to look at your view.` : 'Asked everyone to look at your view.');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const rowButton = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Also here: ${names}. Show people`}
        title={`Also here: ${names}`}
        className="flex items-center -space-x-1.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: theme.focus.ring }}
      >
        {shown.map((m) => <Avatar key={m.userId} m={m} />)}
        {list.length > MAX_SHOWN && (
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
            style={{ backgroundColor: theme.sidebar.hover, color: theme.sidebar.text, border: `2px solid ${theme.toolbar.bg}` }}
            aria-hidden
          >
            +{list.length - MAX_SHOWN}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="People here"
          className="absolute right-0 rounded-lg py-2"
          style={{
            top: 'calc(100% + 6px)',
            width: 280,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider" style={{ color: theme.sidebar.textSecondary }}>
            Here now
          </div>
          {list.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-3 py-1.5">
              <Avatar m={m} />
              <span className="flex-1 min-w-0 truncate text-sm" style={{ color: theme.sidebar.text }}>{m.name}</span>
              <button
                onClick={() => goTo(m.userId)}
                disabled={!cursorOf(m.userId)}
                title={cursorOf(m.userId) ? `Go to ${m.name}'s pointer` : `${m.name}'s pointer isn't on the canvas`}
                className={rowButton}
                style={{ color: theme.sidebar.text, backgroundColor: theme.sidebar.hover }}
              >
                <Crosshair size={12} aria-hidden="true" /> Go to
              </button>
              <button
                onClick={() => void summon(m)}
                title={`Ask ${m.name} to look at what you're looking at`}
                className={rowButton}
                style={{ color: theme.sidebar.text, backgroundColor: theme.sidebar.hover }}
              >
                <Megaphone size={12} aria-hidden="true" /> Summon
              </button>
            </div>
          ))}
          {list.length > 1 && (
            <div className="px-3 pt-2 mt-1" style={{ borderTop: `1px solid ${theme.sidebar.border}` }}>
              <button
                onClick={() => void summon(null)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-sm"
                style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
              >
                <Megaphone size={14} aria-hidden="true" /> Summon everyone here
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
