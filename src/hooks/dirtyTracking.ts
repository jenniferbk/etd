import { useEffect } from 'react';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';

/** Flip the library save status to 'dirty' on any diagram content change.
 *  Reference inequality is enough: the store replaces arrays/objects on edit. */
export function startDirtyTracking(): () => void {
  return useDiagramStore.subscribe((state, prev) => {
    if (
      state.elements !== prev.elements ||
      state.connections !== prev.connections ||
      state.styleConfig !== prev.styleConfig ||
      state.transcript !== prev.transcript ||
      state.diagramName !== prev.diagramName
    ) {
      const cloud = useCloudStore.getState();
      if (cloud.status === 'saved') cloud.setStatus('dirty');
    }
  });
}

export function useDirtyTracking(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return startDirtyTracking();
  }, [enabled]);
}
