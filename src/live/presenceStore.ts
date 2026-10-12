import { create } from 'zustand';

export interface PresenceMember {
  clientId: string;
  userId: number;
  name: string;
  color: string;
  selectedIds: string[];
}

/** Who else has the current library diagram open, and what they have
 *  selected. Filled by the live session; empty when not collaborating. */
interface PresenceState {
  /** Everyone in the session except this browser tab. */
  others: PresenceMember[];
  /** This tab's color in the session (null when not connected). */
  myColor: string | null;
  /** True while the live stream is connected. */
  connected: boolean;
  setOthers: (others: PresenceMember[]) => void;
  setSelf: (myColor: string | null, connected: boolean) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  others: [],
  myColor: null,
  connected: false,
  setOthers: (others) => set({ others }),
  setSelf: (myColor, connected) => set({ myColor, connected }),
  reset: () => set({ others: [], myColor: null, connected: false }),
}));
