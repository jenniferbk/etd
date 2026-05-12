import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { theme } from '../utils/theme';
import { formatTimestamp } from '../hooks/useAutoSave';
import { Modal } from './ui/Modal';

interface RecoveryPromptProps {
  timestamp: number;
  onRecover: () => void;
  onDiscard: () => void;
}

export function RecoveryPrompt({ timestamp, onRecover, onDiscard }: RecoveryPromptProps) {
  // Recovery opens without a triggering element — Modal's return-focus chain
  // falls through to document.body (logged in dev). That's intentional.
  // Esc and scrim-click are no-ops here: the user must make an explicit choice.
  return (
    <Modal
      open
      onClose={() => { /* recovery requires explicit choice */ }}
      title="Recover Unsaved Work?"
      size="sm"
      initialFocus="primary"
      closeOnScrim={false}
      hideCloseButton
      footer={
        <>
          <button
            onClick={onDiscard}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            <Trash2 size={16} />
            Discard
          </button>
          <button
            onClick={onRecover}
            data-modal-focus="primary"
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            <RotateCcw size={16} />
            Recover
          </button>
        </>
      }
    >
      <div className="px-5 py-4 flex items-start gap-3">
        <AlertCircle size={24} style={{ color: theme.sidebar.accent, flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm leading-relaxed mb-3" style={{ color: theme.sidebar.textSecondary }}>
            We found an auto-saved diagram from your previous session. Would you like to recover it?
          </p>
          <p className="text-sm" style={{ color: theme.sidebar.text }}>
            <span className="font-medium">Last saved:</span>{' '}
            <span style={{ color: theme.sidebar.accent }}>{formatTimestamp(timestamp)}</span>
          </p>
        </div>
      </div>
    </Modal>
  );
}
