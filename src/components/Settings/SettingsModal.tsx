import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import type { StyleConfig } from '../../types';
import { SettingsSidebar } from './SettingsSidebar';
import { TypeStyleEditor } from './TypeStyleEditor';
import { SubtypeListEditor } from './SubtypeListEditor';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';

export type SettingsSelection =
  | { kind: 'argument'; type: 'data' | 'claim' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal' }
  | { kind: 'support';  type: 'action' | 'question' | 'other' }
  | { kind: 'subtypes' };

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
  const [workingConfig, setWorkingConfig] = useState<StyleConfig>(committedConfig);

  // Selection state — resets to Data on each open because SettingsModalInner remounts.
  const [selection, setSelection] = useState<SettingsSelection>({ kind: 'argument', type: 'data' });

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

  const handleResetAllTypeStyles = () => {
    const ok = window.confirm(
      'Reset all argument and support type styles to defaults? This does NOT affect your custom subtypes.'
    );
    if (!ok) return;
    const defaults = createCurrentDefaults();
    setWorkingConfig({
      ...workingConfig,
      argumentTypes: defaults.argumentTypes,
      supportTypes:  defaults.supportTypes,
      // otherSubtypes intentionally preserved
    });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: theme.scrim, zIndex: theme.z.modalScrim }}
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
            className="p-1 rounded transition-colors"
            aria-label="Close settings"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={18} style={{ color: theme.sidebar.muted }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex" style={{ color: theme.sidebar.text }}>
          <SettingsSidebar
            config={workingConfig}
            selection={selection}
            onSelect={setSelection}
          />
          <div className="flex-1 p-6 overflow-y-auto">
            {selection.kind === 'argument' && (
              <TypeStyleEditor
                key={`argument:${selection.type}`}
                kind="argument"
                typeKey={selection.type}
                config={workingConfig}
                onChange={setWorkingConfig}
              />
            )}
            {selection.kind === 'support' && (
              <TypeStyleEditor
                key={`support:${selection.type}`}
                kind="support"
                typeKey={selection.type}
                config={workingConfig}
                onChange={setWorkingConfig}
              />
            )}
            {selection.kind === 'subtypes' && (
              <SubtypeListEditor config={workingConfig} onChange={setWorkingConfig} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between items-center" style={{ borderColor: theme.sidebar.border }}>
          <button
            onClick={handleResetAllTypeStyles}
            className="text-xs underline"
            style={{ color: theme.sidebar.muted }}
          >
            Reset all type styles
          </button>
          <div className="flex gap-2">
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
              style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  if (!open) return null;
  return <SettingsModalInner onClose={onClose} />;
}
