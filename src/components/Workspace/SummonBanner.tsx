import { X } from 'lucide-react';
import { useCollabStore } from '../../live/collabStore';
import { fitView } from '../../live/viewport';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';

/** "Ana wants you to look here" — shown when a teammate summons this tab.
 *  The view only moves when the user chooses Go. */
export function SummonBanner() {
  const summon = useCollabStore((s) => s.summon);
  if (!summon) return null;

  const go = () => {
    const { viewportSize, setZoom, setPan } = useDiagramStore.getState();
    const { zoom, panX, panY } = fitView(summon.view, viewportSize);
    setZoom(zoom);
    setPan(panX, panY);
    useCollabStore.getState().setSummon(null);
  };
  const dismiss = () => useCollabStore.getState().setSummon(null);

  return (
    <div
      role="alert"
      className="fixed left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl border text-sm"
      style={{
        top: 72,
        padding: '0.5rem 0.5rem 0.5rem 0.875rem',
        backgroundColor: theme.sidebar.surface,
        borderColor: summon.from.color,
        boxShadow: theme.shadow.md,
        zIndex: theme.z.dropdown,
        color: theme.sidebar.text,
      }}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: summon.from.color }} aria-hidden />
      <span>
        <strong>{summon.from.name}</strong> wants you to look at their view.
      </span>
      <button
        onClick={go}
        autoFocus
        className="rounded-lg font-medium"
        style={{ padding: '0.375rem 0.75rem', backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
      >
        Go
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-lg"
        style={{ padding: '0.375rem', color: theme.sidebar.textSecondary }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
