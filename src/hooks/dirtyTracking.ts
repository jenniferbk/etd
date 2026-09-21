import { useEffect } from 'react';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';

// Incremented on every tracked diagram edit, regardless of the current
// library save status — including while a save is in flight ('saving').
// saveToLibrary compares a tick captured before its PUT against this value
// after the request resolves to detect edits that happened mid-save, which
// the saved→dirty flip below cannot catch (it's a no-op while status is
// 'saving', not 'saved').
let editTick = 0;

/** Current edit-tick value. Monotonically increasing for the lifetime of the
 *  page; only meaningful as a before/after comparison. */
export function getEditTick(): number {
  return editTick;
}

/** Flip the library save status to 'dirty' on any diagram content change.
 *  Reference inequality is enough: the store replaces arrays/objects on edit.
 *
 *  Suspended while previewing a read-only past version (cloudStore.preview !==
 *  null): loading a previewed snapshot mutates this same store, and that load
 *  must not mark the diagram dirty. This check reads cloudStore's live state
 *  synchronously — it does not depend on React re-rendering useDirtyTracking's
 *  caller with a new `enabled` value, which could otherwise race the
 *  subscription's own (also synchronous) notification. Callers that enter
 *  preview must call setPreview() *before* loadDiagram() so this check sees
 *  preview already set when the load's mutation fires. */
export function startDirtyTracking(): () => void {
  return useDiagramStore.subscribe((state, prev) => {
    if (
      state.elements !== prev.elements ||
      state.connections !== prev.connections ||
      state.styleConfig !== prev.styleConfig ||
      state.transcript !== prev.transcript ||
      state.notes !== prev.notes ||
      state.diagramName !== prev.diagramName
    ) {
      editTick += 1;
      const cloud = useCloudStore.getState();
      if (cloud.preview !== null) return;
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
