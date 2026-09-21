import { useDiagramStore } from '../store';
import { buildDiagramFile } from './saveDiagram';

/**
 * Snapshot of the current diagram store state in the cloud API's save-file
 * shape (same shape as buildDiagramFile / the local .json save file).
 * Shared by saveToLibrary's direct-PUT (already-linked) path and
 * AddToLibraryDialog's first-save POST path so the five-field reconstruction
 * isn't duplicated between them.
 */
export function buildCloudSnapshot(titleOverride?: string) {
  const s = useDiagramStore.getState();
  return buildDiagramFile({
    diagramName: titleOverride ?? s.diagramName,
    elements: s.elements,
    connections: s.connections,
    styleConfig: s.styleConfig,
    transcript: s.transcript,
    notes: s.notes,
  });
}
