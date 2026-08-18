import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, String(v)),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => void localStorageStore.clear(),
});

import { saveToLibrary } from './librarySave';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';

const USER = { id: 1, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('saveToLibrary', () => {
  beforeEach(() => {
    localStorage?.clear?.();
    useAuthStore.setState({ user: USER, groups: [{ id: 1, name: 'COMS', role: 'member' }] });
    useCloudStore.setState({ diagramId: 9, groupId: 1, status: 'dirty', addToLibraryOpen: false });
    useDiagramStore.getState().setDiagramName('My diagram');
    useToastStore.getState().clearAll();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PUTs a linked diagram and lands on saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('saved');
  });

  it('opens the Add-to-library dialog for an unlinked diagram', async () => {
    useCloudStore.setState({ diagramId: null, groupId: null, status: 'notInLibrary' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await saveToLibrary();
    expect(useCloudStore.getState().addToLibraryOpen).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('recovers from a 404 by clearing the target and opening the dialog', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'diagram not found' }, 404));
    await saveToLibrary();
    const s = useCloudStore.getState();
    expect(s.diagramId).toBeNull();
    expect(s.addToLibraryOpen).toBe(true);
  });

  it('goes offline on network failure without a toast', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('offline');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('surfaces other errors as dirty + friendly toast', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'invalid request' }, 400));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('dirty');
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'error')).toBe(true);
  });
});
