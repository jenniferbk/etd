import { beforeEach, describe, expect, it } from 'vitest';
import { useCloudStore } from './cloudStore';

describe('cloudStore view/status', () => {
  beforeEach(() =>
    useCloudStore.setState({
      diagramId: null, groupId: null, view: 'canvas', status: 'notInLibrary', addToLibraryOpen: false,
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

  it('setView, setStatus, setAddToLibraryOpen update state', () => {
    useCloudStore.getState().setView('workspace');
    useCloudStore.getState().setStatus('dirty');
    useCloudStore.getState().setAddToLibraryOpen(true);
    expect(useCloudStore.getState()).toMatchObject({ view: 'workspace', status: 'dirty', addToLibraryOpen: true });
  });
});
