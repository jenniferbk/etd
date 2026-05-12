import { create } from 'zustand';

export type ConfirmVariant = 'default' | 'destructive';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;   // default 'Confirm'
  cancelLabel?: string;    // default 'Cancel'
  variant?: ConfirmVariant; // default 'default'
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolver: ((value: boolean) => void) | null;
  open: (req: ConfirmRequest) => Promise<boolean>;
  resolve: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,

  open: (req) =>
    new Promise<boolean>((resolve) => {
      const prev = get().resolver;
      if (prev) {
        // Defensive: if a previous prompt was somehow still open, cancel it.
        prev(false);
      }
      set({ request: req, resolver: resolve });
    }),

  resolve: (value) => {
    const resolver = get().resolver;
    set({ request: null, resolver: null });
    if (resolver) resolver(value);
  },
}));

/** Imperative helper for non-component contexts (event handlers, hooks). */
export function confirmAsync(req: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().open(req);
}
