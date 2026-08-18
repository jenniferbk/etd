import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';
import { startDirtyTracking } from './dirtyTracking';

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
});
