import { create } from 'zustand';

export type ToastVariant = 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  /** Returns the new toast's id (for tests or explicit dismiss). */
  addToast: (variant: ToastVariant, message: string) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const INFO_AUTODISMISS_MS = 5000;
const MAX_PERSISTENT = 4;

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (variant, message) => {
    const id = makeId();
    const next: Toast = { id, variant, message, createdAt: Date.now() };

    set((state) => {
      let toasts = [...state.toasts, next];

      // Persistent cap: warning + error count toward the limit; info doesn't
      // (it auto-dismisses after 5s, so it can't pile up).
      const persistent = toasts.filter((t) => t.variant !== 'info');
      if (persistent.length > MAX_PERSISTENT) {
        // FIFO evict the oldest persistent toast.
        const oldestPersistentId = persistent[0].id;
        toasts = toasts.filter((t) => t.id !== oldestPersistentId);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[toastStore] evicted oldest persistent toast (${oldestPersistentId}) to keep at ${MAX_PERSISTENT}`,
          );
        }
      }

      return { toasts };
    });

    if (variant === 'info') {
      setTimeout(() => {
        if (get().toasts.some((t) => t.id === id)) {
          get().dismissToast(id);
        }
      }, INFO_AUTODISMISS_MS);
    }

    return id;
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearAll: () => set({ toasts: [] }),
}));
