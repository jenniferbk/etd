import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { theme } from '../utils/theme';
import { formatTimestamp } from '../hooks/useAutoSave';

interface RecoveryPromptProps {
  timestamp: number;
  onRecover: () => void;
  onDiscard: () => void;
}

export function RecoveryPrompt({ timestamp, onRecover, onDiscard }: RecoveryPromptProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.sidebar.bg }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center gap-3"
          style={{ borderColor: theme.sidebar.border }}
        >
          <AlertCircle size={24} style={{ color: theme.sidebar.accent }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: theme.sidebar.text }}
          >
            Recover Unsaved Work?
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: theme.sidebar.muted }}
          >
            We found an auto-saved diagram from your previous session.
            Would you like to recover it?
          </p>
          <p
            className="text-sm"
            style={{ color: theme.sidebar.text }}
          >
            <span className="font-medium">Last saved:</span>{' '}
            <span style={{ color: theme.sidebar.accent }}>
              {formatTimestamp(timestamp)}
            </span>
          </p>
        </div>

        {/* Actions */}
        <div
          className="px-6 py-4 border-t flex gap-3"
          style={{ borderColor: theme.sidebar.border }}
        >
          <button
            onClick={onDiscard}
            className="flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor: theme.sidebar.surface,
              color: theme.sidebar.text,
            }}
          >
            <Trash2 size={16} />
            Discard
          </button>
          <button
            onClick={onRecover}
            className="flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor: theme.sidebar.accent,
              color: theme.sidebar.bg,
            }}
          >
            <RotateCcw size={16} />
            Recover
          </button>
        </div>
      </div>
    </div>
  );
}
