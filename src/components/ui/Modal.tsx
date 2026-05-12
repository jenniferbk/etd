import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { X } from 'lucide-react';
import { theme } from '../../utils/theme';

type Size = 'sm' | 'md' | 'lg' | 'xl';
type ScrimVariant = 'sage' | 'dark';
type InitialFocus = 'primary' | 'cancel' | 'close';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Right-aligned header tools (e.g., crop modal's lock/reset buttons). */
  headerExtras?: ReactNode;
  /** Slot for footer content. Buttons should be right-aligned by the caller. */
  footer?: ReactNode;
  size?: Size;
  scrim?: ScrimVariant;
  /** Default true. */
  closeOnScrim?: boolean;
  /**
   * Which element to focus when the modal opens. Maps to a `data-modal-focus` attribute
   * on a descendant of `children` / `footer`. `'primary'` is the default; the consumer
   * marks the primary button with `data-modal-focus="primary"`.
   *
   * Cancel-focus is required by spec §7.1.1 for destructive confirmations.
   * Close-focus is used when there is no primary action (about modal).
   */
  initialFocus?: InitialFocus;
  /** Hide the header chrome entirely (used by the lightbox dark variant). */
  hideHeader?: boolean;
  /** Hide the rendered close × in the header. */
  hideCloseButton?: boolean;
  children?: ReactNode;
}

const SIZE_MAX_WIDTH: Record<Size, string> = {
  sm: '420px',
  md: '560px',
  lg: '720px',
  xl: '960px',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerExtras,
  footer,
  size = 'md',
  scrim = 'sage',
  closeOnScrim = true,
  initialFocus = 'primary',
  hideHeader = false,
  hideCloseButton = false,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  // Return-focus chain per spec §7.1.
  const restoreFocus = useCallback(() => {
    const prev = previousFocusRef.current;
    if (prev && document.body.contains(prev) && typeof prev.focus === 'function') {
      prev.focus();
      return;
    }
    // No prior trigger (e.g., Recovery modal opens on app load). Fall through
    // to document.body — log in dev so unintended fallbacks are visible.
    if (import.meta.env.DEV) {
      console.warn('[Modal] return-focus fell through to document.body — no triggering element');
    }
  }, []);

  // Capture the previously-focused element when the modal opens, restore on close.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      restoreFocus();
    };
  }, [open, restoreFocus]);

  // Initial focus.
  useEffect(() => {
    if (!open) return;
    // Wait one tick so descendants have rendered.
    const id = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const focusTarget =
        root.querySelector<HTMLElement>(`[data-modal-focus="${initialFocus}"]`) ??
        root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      focusTarget?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialFocus]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap — Tab / Shift+Tab cycle within the dialog.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const scrimColor = useMemo(
    () => (scrim === 'dark' ? 'rgba(0, 0, 0, 0.9)' : theme.scrim),
    [scrim],
  );

  if (!open) return null;

  const isDark = scrim === 'dark';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: scrimColor, zIndex: isDark ? theme.z.lightbox : theme.z.modalScrim }}
      onClick={(e) => {
        if (closeOnScrim && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        onKeyDown={handleKeyDown}
        className="flex flex-col overflow-hidden mx-4"
        style={{
          backgroundColor: isDark ? 'transparent' : theme.sidebar.bg,
          width: '100%',
          maxWidth: SIZE_MAX_WIDTH[size],
          maxHeight: '90vh',
          borderRadius: isDark ? 0 : theme.radius.xl,
          border: isDark ? 'none' : `1px solid ${theme.sidebar.border}`,
          boxShadow: isDark ? theme.shadow.lg : theme.shadow.xl,
          zIndex: isDark ? theme.z.lightbox : theme.z.modal,
        }}
      >
        {!hideHeader && (
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{
              backgroundColor: theme.toolbar.bg,
              borderBottom: `1px solid ${theme.sidebar.border}`,
            }}
          >
            <div className="min-w-0">
              {title && (
                <h2
                  id={labelId}
                  className="text-base font-semibold truncate"
                  style={{ color: theme.sidebar.text }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs mt-0.5" style={{ color: theme.sidebar.textSecondary }}>
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {headerExtras}
              {!hideCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded transition-colors"
                  style={{ color: theme.sidebar.textSecondary }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  data-modal-focus={initialFocus === 'close' ? 'close' : undefined}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-auto"
          style={{
            backgroundColor: isDark ? 'transparent' : theme.sidebar.bg,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0"
            style={{
              backgroundColor: theme.toolbar.bg,
              borderTop: `1px solid ${theme.sidebar.border}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
