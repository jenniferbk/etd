import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, String(v)),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => void localStorageStore.clear(),
});

import { saveToLibrary } from './librarySave';
import { startDirtyTracking } from './dirtyTracking';
import { ApiError } from '../api/client';
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
    useCloudStore.setState({
      diagramId: 9, groupId: 1, baseVersionId: 3, conflict: null, status: 'dirty', addToLibraryOpen: false,
    });
    useDiagramStore.getState().setDiagramName('My diagram');
    useToastStore.getState().clearAll();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PUTs a linked diagram and lands on saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('saved');
  });

  it('sends the current baseVersionId in the PUT body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary();
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init!.body as string) as { baseVersionId?: number };
    expect(body.baseVersionId).toBe(3);
  });

  it('updates baseVersionId from the PUT response on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary();
    expect(useCloudStore.getState().baseVersionId).toBe(4);
  });

  it('force: true omits baseVersionId from the PUT body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary({ force: true });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init!.body as string) as { baseVersionId?: number };
    expect(body).not.toHaveProperty('baseVersionId');
  });

  it('on 409, sets conflict + dirty status with no toast', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'someone else saved this diagram while you were editing', currentVersionId: 11 }, 409),
    );
    await saveToLibrary();
    const s = useCloudStore.getState();
    expect(s.status).toBe('dirty');
    expect(s.conflict).toEqual({ currentVersionId: 11 });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not mutate state if the diagram target changes while the PUT is in flight (e.g. opening another diagram)', async () => {
    let resolveFetch!: (res: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const savePromise = saveToLibrary(); // suspends at the PUT with diagramId 9
    useCloudStore.setState({ diagramId: 22, groupId: 1, baseVersionId: 7 }); // switched diagrams mid-save
    resolveFetch(jsonResponse({ currentVersionId: 4 }));
    await savePromise;

    const s = useCloudStore.getState();
    expect(s.diagramId).toBe(22);
    expect(s.baseVersionId).toBe(7); // not clobbered by the stale response
  });

  it('does not mutate state if the user signs out while the PUT is in flight', async () => {
    let resolveFetch!: (res: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const savePromise = saveToLibrary(); // suspends at the PUT while signed in
    useAuthStore.setState({ user: null, groups: [] }); // signed out mid-save
    resolveFetch(jsonResponse({ currentVersionId: 4 }));
    await savePromise;

    expect(useCloudStore.getState().status).not.toBe('saved');
    expect(useCloudStore.getState().baseVersionId).toBe(3); // untouched
  });

  it('does not set conflict/dirty from a 409 if the diagram target changed mid-flight', async () => {
    let rejectFetch!: (err: unknown) => void;
    const pending = new Promise<Response>((_resolve, reject) => { rejectFetch = reject; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const savePromise = saveToLibrary();
    useCloudStore.setState({ diagramId: 22, groupId: 1, conflict: null });
    rejectFetch(new ApiError(409, 'conflict', { currentVersionId: 11 }));
    await savePromise;

    expect(useCloudStore.getState().conflict).toBeNull();
    expect(useCloudStore.getState().diagramId).toBe(22);
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

  it('lands on dirty (not saved) if the diagram is edited while the PUT is in flight', async () => {
    let resolveFetch!: (res: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const stop = startDirtyTracking();
    try {
      const savePromise = saveToLibrary(); // not awaited yet — suspends at the PUT
      // Mid-flight edit: simulates the user typing while the save is in flight.
      useDiagramStore.getState().setDiagramName('Edited mid-save');
      resolveFetch(jsonResponse({ currentVersionId: 5 }));
      await savePromise;
      expect(useCloudStore.getState().status).toBe('dirty');
    } finally {
      stop();
    }
  });
});
