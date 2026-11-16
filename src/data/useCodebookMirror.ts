// While the canvas shows a library diagram, keeps styleConfig's question/other
// kinds in step with the group's codebook.
import { useEffect } from 'react';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useCodebookStore } from '../store/codebookStore';
import { applyMirroredStyleConfig, docFromStore } from '../live/storeBridge';
import { mirrorIntoStyleConfig } from './codebook';

export function useCodebookMirror(): void {
  const groupId = useCloudStore((s) => s.groupId);
  const diagramId = useCloudStore((s) => s.diagramId);

  useEffect(() => {
    if (groupId === null) return;
    let cancelled = false;
    // Re-applies the mirror; a no-op (same reference) once styleConfig already matches.
    const applyMirror = () => {
      const cb = useCodebookStore.getState().byGroup[groupId];
      if (!cb) return;
      const { styleConfig } = useDiagramStore.getState();
      const next = mirrorIntoStyleConfig(styleConfig, cb);
      if (next !== styleConfig) applyMirroredStyleConfig(next);
    };
    useCodebookStore
      .getState()
      .ensure(groupId, [docFromStore()])
      .then(() => {
        if (!cancelled) applyMirror();
      })
      .catch((e) => {
        // Never block the canvas; styleConfig stays as it was.
        console.warn('Codebook mirror failed', e);
      });
    // Keep following: codebook edits, and loads that replace styleConfig.
    const unsubCodebook = useCodebookStore.subscribe((s, prev) => {
      if (s.byGroup[groupId] !== prev.byGroup[groupId]) applyMirror();
    });
    const unsubDiagram = useDiagramStore.subscribe((s, prev) => {
      if (s.styleConfig !== prev.styleConfig) applyMirror();
    });
    return () => {
      cancelled = true;
      unsubCodebook();
      unsubDiagram();
    };
  }, [groupId, diagramId]);
}
