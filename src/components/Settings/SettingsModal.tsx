import { useState } from 'react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import type { StyleConfig } from '../../types';
import { SettingsSidebar } from './SettingsSidebar';
import { TypeStyleEditor } from './TypeStyleEditor';
import { SubtypeListEditor } from './SubtypeListEditor';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';
import { Modal } from '../ui/Modal';

export type SettingsSelection =
  | { kind: 'argument'; type: 'data' | 'claim' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal' }
  | { kind: 'support';  type: 'action' | 'question' | 'other' }
  | { kind: 'subtypes'; supportType: 'action' | 'question' | 'other' };

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
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Element Style Settings"
      size="xl"
      initialFocus="primary"
      footer={
        <>
          <button
            onClick={handleResetAllTypeStyles}
            className="text-xs underline mr-auto"
            style={{ color: theme.sidebar.textSecondary }}
          >
            Reset all type styles
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            data-modal-focus="primary"
            className="px-4 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="flex" style={{ color: theme.sidebar.text, maxHeight: '70vh' }}>
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
            <SubtypeListEditor
              key={selection.supportType}
              supportType={selection.supportType}
              config={workingConfig}
              onChange={setWorkingConfig}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  if (!open) return null;
  return <SettingsModalInner onClose={onClose} />;
}
