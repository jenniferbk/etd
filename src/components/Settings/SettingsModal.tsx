import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import type { StyleConfig } from '../../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Inner modal — only rendered when open is true, so useState initializes
 * fresh from committedConfig on each open without needing a reseed effect.
 */
function SettingsModalInner({ onClose }: { onClose: () => void }) {
  const committedConfig = useDiagramStore((s) => s.styleConfig);
  const replaceStyleConfig = useDiagramStore((s) => s.replaceStyleConfig);

  // Local working copy. Initialized once when the inner modal mounts (i.e. on open).
  // Apply commits to the store; Cancel discards by simply closing.
  // Setter will be wired to editors in Tasks 12–16.
  const workingConfigState = useState<StyleConfig>(committedConfig);
  const workingConfig = workingConfigState[0];
  // setWorkingConfig = workingConfigState[1] (used in Tasks 12–16)

  // Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleApply = () => {
    replaceStyleConfig(workingConfig);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl mx-4 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.sidebar.bg, maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: theme.sidebar.border }}
        >
          <h2 className="text-lg font-semibold" style={{ color: theme.sidebar.text }}>
            Element Style Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Close settings"
          >
            <X size={18} style={{ color: theme.sidebar.muted }} />
          </button>
        </div>

        {/* Body — placeholder until Tasks 12–16 fill this in. */}
        <div className="flex-1 overflow-hidden flex" style={{ color: theme.sidebar.text }}>
          <div className="p-6 text-sm" style={{ color: theme.sidebar.muted }}>
            Settings UI under construction. Working config snapshot of{' '}
            {Object.keys(workingConfig.argumentTypes).length} argument types and{' '}
            {workingConfig.otherSubtypes.length} subtypes is staged.
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t flex justify-end gap-2"
          style={{ borderColor: theme.sidebar.border }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{ backgroundColor: theme.sidebar.surface, color: theme.sidebar.text }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: theme.sidebar.accent, color: theme.colors.void[950] }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  if (!open) return null;
  return <SettingsModalInner onClose={onClose} />;
}
