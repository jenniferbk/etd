import { create } from 'zustand';
import type { ViewRect } from './viewport';

export interface ChatMessage {
  id: number;
  body: string;
  authorId: number;
  author: string;
  /** SQLite UTC datetime, e.g. "2026-10-19 13:42:29". */
  createdAt: string;
}

export interface Summon {
  from: { clientId: string; name: string; color: string };
  view: ViewRect;
}

/** Fast-changing collaboration state, kept apart from presenceStore so cursor
 *  frames (~12/s per teammate) don't re-render avatars and outlines. */
interface CollabState {
  /** Teammates' pointers by tab, in diagram coordinates. */
  cursors: Record<string, { x: number; y: number }>;
  /** The latest "come look" request, until acted on or dismissed. */
  summon: Summon | null;
  chat: ChatMessage[];
  /** Which diagram's history `chat` holds (null = not fetched yet). */
  chatLoadedFor: number | null;
  /** Messages from others since the chat panel was last open. */
  unread: number;
  setCursor: (clientId: string, pos: { x: number; y: number } | null) => void;
  pruneCursors: (presentClientIds: string[]) => void;
  setSummon: (summon: Summon | null) => void;
  setChatHistory: (diagramId: number, messages: ChatMessage[]) => void;
  /** Add one message; `seen` = the user can see it (panel open, or their own). */
  receiveChat: (message: ChatMessage, seen: boolean) => void;
  markRead: () => void;
  reset: () => void;
}

function mergeById(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

export const useCollabStore = create<CollabState>((set, get) => ({
  cursors: {},
  summon: null,
  chat: [],
  chatLoadedFor: null,
  unread: 0,
  setCursor: (clientId, pos) =>
    set((s) => {
      const cursors = { ...s.cursors };
      if (pos) cursors[clientId] = pos;
      else delete cursors[clientId];
      return { cursors };
    }),
  pruneCursors: (present) =>
    set((s) => {
      const keep = new Set(present);
      const ids = Object.keys(s.cursors);
      if (ids.every((id) => keep.has(id))) return s;
      return { cursors: Object.fromEntries(ids.filter((id) => keep.has(id)).map((id) => [id, s.cursors[id]])) };
    }),
  setSummon: (summon) => set({ summon }),
  setChatHistory: (diagramId, messages) =>
    set((s) => ({ chat: mergeById(s.chat, messages), chatLoadedFor: diagramId })),
  receiveChat: (message, seen) => {
    if (get().chat.some((m) => m.id === message.id)) return;
    set((s) => ({ chat: mergeById(s.chat, [message]), unread: seen ? s.unread : s.unread + 1 }));
  },
  markRead: () => set({ unread: 0 }),
  reset: () => set({ cursors: {}, summon: null, chat: [], chatLoadedFor: null, unread: 0 }),
}));
