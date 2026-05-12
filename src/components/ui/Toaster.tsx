import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { Toast } from './Toast';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed flex flex-col-reverse gap-2 pointer-events-none"
      style={{
        right: 24,
        bottom: 24,
        zIndex: theme.z.toast,
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
