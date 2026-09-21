import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAutoSavedData, clearAutoSave } from './useAutoSave';

// Minimal in-memory localStorage stub (node test env has no DOM).
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

const KEY = 'toulmin-diagram-autosave';

describe('autosave persistence contract', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('round-trips diagramName through getAutoSavedData', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ elements: [], connections: [], transcript: null, diagramName: 'My Argument Map', timestamp: 123 }),
    );
    const recovered = getAutoSavedData();
    expect(recovered?.diagramName).toBe('My Argument Map');
  });

  it('leaves diagramName undefined for legacy entries (recovery falls back to default)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ elements: [], connections: [], transcript: null, timestamp: 123 }),
    );
    const recovered = getAutoSavedData();
    expect(recovered).not.toBeNull();
    expect(recovered?.diagramName).toBeUndefined();
  });

  it('returns null after clearAutoSave', () => {
    localStorage.setItem(KEY, JSON.stringify({ elements: [], connections: [], transcript: null, timestamp: 1 }));
    clearAutoSave();
    expect(getAutoSavedData()).toBeNull();
  });

  it('round-trips notes through getAutoSavedData', () => {
    const notes = [{ id: 'note-1', text: 'memo', createdAt: '2026-09-21T10:00:00.000Z' }];
    localStorage.setItem(
      KEY,
      JSON.stringify({ elements: [], connections: [], transcript: null, notes, timestamp: 1 }),
    );
    expect(getAutoSavedData()?.notes).toEqual(notes);
  });

  it('leaves notes undefined for legacy entries (loadDiagram defaults to [])', () => {
    localStorage.setItem(KEY, JSON.stringify({ elements: [], connections: [], transcript: null, timestamp: 1 }));
    expect(getAutoSavedData()?.notes).toBeUndefined();
  });
});
