import { AlertTriangle } from 'lucide-react';
import { theme } from '../../utils/theme';
import { saveToLibrary } from '../../hooks/librarySave';

interface OfflineBannerProps {
  groupName: string;
}

/** Slim bar rendered by CanvasHeader while cloudStore.status === 'offline'.
 *  Reassures that local edits are safe and offers a manual retry — the copy
 *  here is binding (Task 7 brief), keep it byte-exact. */
export function OfflineBanner({ groupName }: OfflineBannerProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 px-5 py-2"
      style={{
        backgroundColor: theme.toolbar.bg,
        borderBottom: `1px solid ${theme.sidebar.border}`,
        borderLeft: `3px solid ${theme.colors.warning}`,
        boxShadow: theme.toolbar.shadow,
      }}
    >
      <AlertTriangle size={16} style={{ color: theme.colors.warning, flexShrink: 0 }} aria-hidden />
      <p className="text-sm flex-1" style={{ color: theme.sidebar.text }}>
        Can't reach the {groupName} server — your work is safe on this computer. We'll save to the library
        when you reconnect.
      </p>
      <button
        onClick={() => void saveToLibrary()}
        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.button.secondary.bg,
          color: theme.button.secondary.text,
          border: `1px solid ${theme.button.secondary.border}`,
          outlineColor: theme.focus.ring,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
      >
        Try again
      </button>
    </div>
  );
}
