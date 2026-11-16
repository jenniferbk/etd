// While the canvas shows a library diagram, keeps styleConfig's question/other
// kinds in step with the group's codebook. The rules live in mirrorSync.
import { useEffect } from 'react';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useCodebookStore } from '../store/codebookStore';
import { applyMirroredStyleConfig, docFromStore, isApplyingRemoteDoc } from '../live/storeBridge';
import { createMirrorSync } from './mirrorSync';

export function useCodebookMirror(): void {
  const groupId = useCloudStore((s) => s.groupId);
  const diagramId = useCloudStore((s) => s.diagramId);

  useEffect(() => {
    if (groupId === null) return;
    let cancelled = false;
    const sync = createMirrorSync({
      // Read live, not from the render: a local file load clears the cloud
      // target synchronously before loadDiagram, ahead of this effect's cleanup.
      isActive: () => !cancelled && useCloudStore.getState().groupId === groupId,
      getCodebook: () => useCodebookStore.getState().byGroup[groupId],
      getStyleConfig: () => useDiagramStore.getState().styleConfig,
      write: applyMirroredStyleConfig,
      refresh: () => useCodebookStore.getState().refresh(groupId),
      ensure: () => useCodebookStore.getState().ensure(groupId, [docFromStore()]),
    });
    useCodebookStore
      .getState()
      .ensure(groupId, [docFromStore()])
      .then(() => {
        if (!cancelled) sync.codebookChanged();
      })
      .catch((e) => {
        // Never block the canvas; styleConfig stays as it was.
        console.warn('Codebook mirror failed', e);
      });
    const unsubCodebook = useCodebookStore.subscribe((s, prev) => {
      if (s.byGroup[groupId] !== prev.byGroup[groupId]) sync.codebookChanged();
    });
    const unsubDiagram = useDiagramStore.subscribe((s, prev) => {
      if (s.styleConfig !== prev.styleConfig) sync.styleConfigChanged(isApplyingRemoteDoc());
    });
    return () => {
      cancelled = true;
      unsubCodebook();
      unsubDiagram();
    };
  }, [groupId, diagramId]);
}
