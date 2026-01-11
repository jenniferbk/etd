import { X, Keyboard } from 'lucide-react';
import { theme } from '../../utils/theme';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const shortcuts = [
    { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
    { keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo' },
    { keys: 'Ctrl/Cmd + S', action: 'Save diagram' },
    { keys: 'Ctrl/Cmd + O', action: 'Load diagram' },
    { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected' },
    { keys: 'Ctrl/Cmd + A', action: 'Select all' },
    { keys: 'Ctrl/Cmd + +', action: 'Zoom in' },
    { keys: 'Ctrl/Cmd + -', action: 'Zoom out' },
    { keys: 'Ctrl/Cmd + 0', action: 'Fit to view' },
    { keys: 'C', action: 'Toggle connect mode' },
    { keys: 'Delete / Backspace', action: 'Delete selected' },
    { keys: 'Escape', action: 'Cancel / Deselect' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.sidebar.bg }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: theme.sidebar.border }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: theme.sidebar.text }}
          >
            About Extended Toulmin Diagram Editor
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#45475a] transition-colors"
            style={{ color: theme.sidebar.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Version Info */}
          <div>
            <p style={{ color: theme.sidebar.text }}>
              <span className="font-medium">Version:</span>{' '}
              <span style={{ color: theme.sidebar.muted }}>1.0.0</span>
            </p>
          </div>

          {/* Credits */}
          <div>
            <h3
              className="text-sm font-medium mb-2"
              style={{ color: theme.sidebar.text }}
            >
              Credits
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: theme.sidebar.muted }}
            >
              App coding and design by{' '}
              <span style={{ color: theme.sidebar.accent }}>
                Jennifer Kleiman
              </span>{' '}
              <br />
              Based on the Extended Toulmin Framework developed by{' '}
              <span style={{ color: theme.sidebar.accent }}>
                AnnaMarie Conner
              </span>{' '}
              for analyzing mathematical argumentation in classroom discourse.
            </p>
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <h3
              className="text-sm font-medium mb-3 flex items-center gap-2"
              style={{ color: theme.sidebar.text }}
            >
              <Keyboard size={16} />
              Keyboard Shortcuts
            </h3>
            <div
              className="rounded-lg overflow-hidden border"
              style={{ borderColor: theme.sidebar.border }}
            >
              <table className="w-full text-sm">
                <tbody>
                  {shortcuts.map((shortcut, index) => (
                    <tr
                      key={shortcut.keys}
                      className={index % 2 === 0 ? 'bg-[#313244]/50' : ''}
                    >
                      <td
                        className="px-3 py-2 font-mono text-xs"
                        style={{ color: theme.sidebar.accent }}
                      >
                        {shortcut.keys}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: theme.sidebar.muted }}
                      >
                        {shortcut.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t"
          style={{ borderColor: theme.sidebar.border }}
        >
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: theme.sidebar.accent,
              color: theme.sidebar.bg,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
