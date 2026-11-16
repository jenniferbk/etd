import { useDiagramStore } from '../store';
import { buildDiagramFile, type DiagramSnapshot } from './saveDiagram';

/** The current diagram store state as a DiagramSnapshot. The one place that
 *  lists which store fields get saved, so local and cloud saves can't drift. */
export function currentDiagramSnapshot(titleOverride?: string): DiagramSnapshot {
  const s = useDiagramStore.getState();
  return {
    diagramName: titleOverride ?? s.diagramName,
    elements: s.elements,
    connections: s.connections,
    styleConfig: s.styleConfig,
    transcript: s.transcript,
    notes: s.notes,
    episode: s.episode,
  };
}

/**
 * Snapshot of the current diagram store state in the cloud API's save-file
 * shape (same shape as buildDiagramFile / the local .json save file).
 * Shared by saveToLibrary's direct-PUT (already-linked) path and
 * AddToLibraryDialog's first-save POST path.
 */
export function buildCloudSnapshot(titleOverride?: string) {
  return buildDiagramFile(currentDiagramSnapshot(titleOverride));
}
