import { AlertCircle, AlertTriangle, Copy, Info, X } from 'lucide-react';
import { theme } from '../../utils/theme';
import type { Toast as ToastModel } from '../../store/toastStore';

interface ToastProps {
  toast: ToastModel;
  onDismiss: () => void;
}

const VARIANT_BORDER: Record<ToastModel['variant'], string> = {
  info:    theme.sidebar.accent,  // sage
  warning: theme.colors.warning,  // clay
  error:   theme.colors.error,    // danger
};

const VARIANT_ICON: Record<ToastModel['variant'], typeof Info> = {
  info:    Info,
  warning: AlertTriangle,
  error:   AlertCircle,
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = VARIANT_ICON[toast.variant];
  const borderColor = VARIANT_BORDER[toast.variant];

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(toast.message).catch(() => {
        /* clipboard denied — silent; user can still read the message */
      });
    }
  };

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className="flex items-start gap-3 rounded-lg overflow-hidden"
      style={{
        minWidth: 320,
        maxWidth: 520,
        backgroundColor: theme.toolbar.bg,
        border: `1px solid ${theme.sidebar.border}`,
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: theme.shadow.md,
        padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
      }}
    >
      <Icon
        size={18}
        style={{ color: borderColor, flexShrink: 0, marginTop: 2 }}
        aria-hidden
      />
      <p
        className="text-sm leading-snug flex-1"
        style={{ color: theme.sidebar.text }}
      >
        {toast.message}
      </p>
      {toast.variant === 'error' && (
        <button
          onClick={handleCopy}
          aria-label="Copy error message"
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Copy"
        >
          <Copy size={14} />
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss"
        className="p-1 rounded transition-colors flex-shrink-0"
        style={{ color: theme.sidebar.textSecondary }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
