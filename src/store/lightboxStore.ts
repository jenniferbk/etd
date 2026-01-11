import { create } from 'zustand';

interface LightboxState {
  isOpen: boolean;
  imageData: string | null;
  elementLabel: string | null;
  openLightbox: (imageData: string, elementLabel?: string) => void;
  closeLightbox: () => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  isOpen: false,
  imageData: null,
  elementLabel: null,

  openLightbox: (imageData, elementLabel) =>
    set({
      isOpen: true,
      imageData,
      elementLabel: elementLabel || null,
    }),

  closeLightbox: () =>
    set({
      isOpen: false,
      imageData: null,
      elementLabel: null,
    }),
}));
