import { create } from 'zustand';

/** Tracks which cloud diagram (if any) the canvas currently corresponds to. */
interface CloudState {
  diagramId: number | null;
  groupId: number | null;
  setCloudTarget: (diagramId: number, groupId: number) => void;
  clearCloudTarget: () => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  diagramId: null,
  groupId: null,
  setCloudTarget: (diagramId, groupId) => set({ diagramId, groupId }),
  clearCloudTarget: () => set({ diagramId: null, groupId: null }),
}));
