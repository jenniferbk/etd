import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudStore } from './cloudStore';

const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, String(v)),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => void localStorageStore.clear(),
});

describe('cloudStore view/status', () => {
  beforeEach(() =>
    useCloudStore.setState({
      diagramId: null, groupId: null, baseVersionId: null, conflict: null, view: 'canvas',
      status: 'notInLibrary', addToLibraryOpen: false, workspaceTab: 'diagrams',
      preview: null, historyOpen: false, chatOpen: false,
      folderId: null, viewMode: 'grid', sort: { key: 'updatedAt', dir: 'desc' }, newDiagramFolder: null,
    }),
  );

  it('starts on canvas, notInLibrary', () => {
    expect(useCloudStore.getState().view).toBe('canvas');
    expect(useCloudStore.getState().status).toBe('notInLibrary');
  });

  it('setCloudTarget marks the diagram saved', () => {
    useCloudStore.getState().setCloudTarget(7, 1);
    expect(useCloudStore.getState()).toMatchObject({ diagramId: 7, groupId: 1, status: 'saved' });
  });

  it('clearCloudTarget returns to notInLibrary', () => {
    useCloudStore.getState().setCloudTarget(7, 1);
    useCloudStore.getState().clearCloudTarget();
    expect(useCloudStore.getState()).toMatchObject({ diagramId: null, groupId: null, status: 'notInLibrary' });
  });

  it('setCloudTarget with a third arg sets baseVersionId', () => {
    useCloudStore.getState().setCloudTarget(7, 1, 42);
    expect(useCloudStore.getState()).toMatchObject({ diagramId: 7, groupId: 1, baseVersionId: 42 });
  });

  it('setCloudTarget without a third arg leaves baseVersionId unchanged', () => {
    useCloudStore.getState().setBaseVersionId(9);
    useCloudStore.getState().setCloudTarget(7, 1);
    expect(useCloudStore.getState().baseVersionId).toBe(9);
  });

  it('clearCloudTarget nulls baseVersionId and conflict', () => {
    useCloudStore.getState().setCloudTarget(7, 1, 42);
    useCloudStore.getState().setConflict({ currentVersionId: 99 });
    useCloudStore.getState().clearCloudTarget();
    expect(useCloudStore.getState()).toMatchObject({ baseVersionId: null, conflict: null });
  });

  it('setBaseVersionId and setConflict update state', () => {
    useCloudStore.getState().setBaseVersionId(3);
    expect(useCloudStore.getState().baseVersionId).toBe(3);
    useCloudStore.getState().setConflict({ currentVersionId: 5 });
    expect(useCloudStore.getState().conflict).toEqual({ currentVersionId: 5 });
    useCloudStore.getState().setConflict(null);
    expect(useCloudStore.getState().conflict).toBeNull();
  });

  it('setView, setStatus, setAddToLibraryOpen update state', () => {
    useCloudStore.getState().setView('workspace');
    useCloudStore.getState().setStatus('dirty');
    useCloudStore.getState().setAddToLibraryOpen(true);
    expect(useCloudStore.getState()).toMatchObject({ view: 'workspace', status: 'dirty', addToLibraryOpen: true });
  });

  it('starts on the diagrams tab', () => {
    expect(useCloudStore.getState().workspaceTab).toBe('diagrams');
  });

  it('setWorkspaceTab switches to people and back', () => {
    useCloudStore.getState().setWorkspaceTab('people');
    expect(useCloudStore.getState().workspaceTab).toBe('people');
    useCloudStore.getState().setWorkspaceTab('diagrams');
    expect(useCloudStore.getState().workspaceTab).toBe('diagrams');
  });

  it('starts with history closed and no preview', () => {
    expect(useCloudStore.getState().historyOpen).toBe(false);
    expect(useCloudStore.getState().preview).toBeNull();
  });

  it('setHistoryOpen toggles the history panel', () => {
    useCloudStore.getState().setHistoryOpen(true);
    expect(useCloudStore.getState().historyOpen).toBe(true);
    useCloudStore.getState().setHistoryOpen(false);
    expect(useCloudStore.getState().historyOpen).toBe(false);
  });

  it('setPreview sets and clears the previewed version', () => {
    useCloudStore.getState().setPreview({ versionId: 12, createdAt: '2026-08-01T00:00:00' });
    expect(useCloudStore.getState().preview).toEqual({ versionId: 12, createdAt: '2026-08-01T00:00:00' });
    useCloudStore.getState().setPreview(null);
    expect(useCloudStore.getState().preview).toBeNull();
  });

  it('clearCloudTarget also closes history and clears any preview', () => {
    useCloudStore.getState().setCloudTarget(7, 1, 42);
    useCloudStore.getState().setHistoryOpen(true);
    useCloudStore.getState().setPreview({ versionId: 3, createdAt: '2026-08-01T00:00:00' });
    useCloudStore.getState().clearCloudTarget();
    expect(useCloudStore.getState()).toMatchObject({ historyOpen: false, preview: null });
  });
});

describe('cloudStore workspace browsing', () => {
  beforeEach(() => {
    localStorage.clear();
    useCloudStore.setState({
      folderId: null, viewMode: 'grid', sort: { key: 'updatedAt', dir: 'desc' }, newDiagramFolder: null,
    });
  });

  it('remembers grid/list and sort in this browser', () => {
    useCloudStore.getState().setViewMode('list');
    useCloudStore.getState().setSort({ key: 'title', dir: 'asc' });
    expect(JSON.parse(localStorage.getItem('etd.workspaceBrowse')!)).toEqual({
      viewMode: 'list', sort: { key: 'title', dir: 'asc' },
    });
  });

  it('clearCloudTarget does not forget the folder a new diagram is meant for', () => {
    useCloudStore.getState().setNewDiagramFolder({ groupId: 1, folderId: 5 });
    useCloudStore.getState().clearCloudTarget();
    expect(useCloudStore.getState().newDiagramFolder).toEqual({ groupId: 1, folderId: 5 });
  });

  it('setCloudTarget clears the new-diagram folder (the diagram now exists)', () => {
    useCloudStore.getState().setNewDiagramFolder({ groupId: 1, folderId: 5 });
    useCloudStore.getState().setCloudTarget(7, 1);
    expect(useCloudStore.getState().newDiagramFolder).toBeNull();
  });
});
