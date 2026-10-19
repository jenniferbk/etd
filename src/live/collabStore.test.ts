import { beforeEach, describe, expect, it } from 'vitest';
import { useCollabStore, type ChatMessage } from './collabStore';

const msg = (id: number, body = `m${id}`): ChatMessage => ({
  id, body, authorId: 1, author: 'Ana', createdAt: `2026-10-19 10:00:0${id}`,
});

beforeEach(() => useCollabStore.getState().reset());

describe('cursors', () => {
  it('stores a cursor per tab and removes it when it leaves the canvas', () => {
    const s = useCollabStore.getState();
    s.setCursor('tab-1', { x: 1, y: 2 });
    s.setCursor('tab-2', { x: 3, y: 4 });
    s.setCursor('tab-1', null);
    expect(useCollabStore.getState().cursors).toEqual({ 'tab-2': { x: 3, y: 4 } });
  });

  it('prunes cursors of tabs that are no longer present', () => {
    const s = useCollabStore.getState();
    s.setCursor('tab-1', { x: 1, y: 2 });
    s.setCursor('tab-2', { x: 3, y: 4 });
    s.pruneCursors(['tab-2', 'tab-3']);
    expect(Object.keys(useCollabStore.getState().cursors)).toEqual(['tab-2']);
  });
});

describe('chat', () => {
  it('merges history and live messages without duplicates, oldest first', () => {
    const s = useCollabStore.getState();
    s.receiveChat(msg(3), false);
    s.setChatHistory(7, [msg(1), msg(2), msg(3)]);
    s.receiveChat(msg(2), false);
    s.receiveChat(msg(4), false);
    expect(useCollabStore.getState().chat.map((m) => m.id)).toEqual([1, 2, 3, 4]);
    expect(useCollabStore.getState().chatLoadedFor).toBe(7);
  });

  it('counts unread messages from others, not my own, and clears on read', () => {
    const s = useCollabStore.getState();
    s.receiveChat(msg(1), true);
    s.receiveChat(msg(2), false);
    s.receiveChat(msg(2), true); // duplicate does not count again
    expect(useCollabStore.getState().unread).toBe(1);
    s.markRead();
    expect(useCollabStore.getState().unread).toBe(0);
  });
});

describe('summon', () => {
  it('keeps only the latest summon until dismissed', () => {
    const s = useCollabStore.getState();
    const view = { x: 0, y: 0, width: 10, height: 10 };
    s.setSummon({ from: { clientId: 'a', name: 'Ana', color: '#f00' }, view });
    s.setSummon({ from: { clientId: 'b', name: 'Bo', color: '#0f0' }, view });
    expect(useCollabStore.getState().summon?.from.name).toBe('Bo');
    s.setSummon(null);
    expect(useCollabStore.getState().summon).toBeNull();
  });
});
