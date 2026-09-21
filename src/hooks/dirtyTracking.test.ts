import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';
import { getEditTick, startDirtyTracking } from './dirtyTracking';

let stop: (() => void) | null = null;

describe('startDirtyTracking', () => {
  beforeEach(() => {
    useCloudStore.setState({ diagramId: 1, groupId: 1, status: 'saved' });
  });
  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('marks saved → dirty when the diagram name changes', () => {
    stop = startDirtyTracking();
    useDiagramStore.getState().setDiagramName('Renamed');
    expect(useCloudStore.getState().status).toBe('dirty');
  });

  it('does not touch status when not saved (e.g. notInLibrary)', () => {
    useCloudStore.setState({ status: 'notInLibrary' });
    stop = startDirtyTracking();
    useDiagramStore.getState().setDiagramName('Another name');
    expect(useCloudStore.getState().status).toBe('notInLibrary');
  });

  it('stops tracking after unsubscribe', () => {
    stop = startDirtyTracking();
    stop();
    stop = null;
    useDiagramStore.getState().setDiagramName('Late change');
    expect(useCloudStore.getState().status).toBe('saved');
  });

  it('increments getEditTick on a tracked change even while not "saved" (e.g. "saving")', () => {
    useCloudStore.setState({ status: 'saving' });
    stop = startDirtyTracking();
    const before = getEditTick();
    useDiagramStore.getState().setDiagramName('Edited mid-save');
    expect(getEditTick()).toBe(before + 1);
    // The saved→dirty flip only fires from 'saved'; getEditTick is the
    // mechanism that still records the edit happened while 'saving'.
    expect(useCloudStore.getState().status).toBe('saving');
  });

  it('does not increment getEditTick for unrelated store fields', () => {
    stop = startDirtyTracking();
    const before = getEditTick();
    useDiagramStore.setState({ selectedIds: ['x'] });
    expect(getEditTick()).toBe(before);
  });

  it('does not flip saved -> dirty while a version preview is active', () => {
    useCloudStore.setState({ status: 'saved', preview: { versionId: 3, createdAt: '2026-08-01T00:00:00' } });
    stop = startDirtyTracking();
    useDiagramStore.getState().setDiagramName('Previewed snapshot');
    expect(useCloudStore.getState().status).toBe('saved');
    useCloudStore.setState({ preview: null });
  });

  it('marks saved → dirty when a note is added', () => {
    stop = startDirtyTracking();
    useDiagramStore.getState().addNote({ text: 'memo' });
    expect(useCloudStore.getState().status).toBe('dirty');
  });

  it('does not increment getEditTick when the notes panel is toggled', () => {
    stop = startDirtyTracking();
    const before = getEditTick();
    useDiagramStore.getState().setNotesPanelOpen(true);
    expect(getEditTick()).toBe(before);
    useDiagramStore.getState().setNotesPanelOpen(false);
  });
});
