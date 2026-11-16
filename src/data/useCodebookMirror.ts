// While the canvas shows a library diagram, keeps styleConfig's question/other
// kinds in step with the group's codebook.
import { useEffect } from 'react';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useCodebookStore } from '../store/codebookStore';
import { docFromStore } from '../live/storeBridge';
import { mirrorIntoStyleConfig } from './codebook';

export function useCodebookMirror(): void {
  const groupId = useCloudStore((s) => s.groupId);
  const diagramId = useCloudStore((s) => s.diagramId);

  useEffect(() => {
    if (groupId === null) return;
    let cancelled = false;
    useCodebookStore
      .getState()
      .ensure(groupId, [docFromStore()])
      .then((cb) => {
        if (cancelled) return;
        const { styleConfig, replaceStyleConfig } = useDiagramStore.getState();
        const next = mirrorIntoStyleConfig(styleConfig, cb);
        if (next !== styleConfig) replaceStyleConfig(next);
      })
      .catch((e) => {
        // Never block the canvas; styleConfig stays as it was.
        console.warn('Codebook mirror failed', e);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, diagramId]);
}
