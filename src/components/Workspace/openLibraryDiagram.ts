import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { CloudDiagram } from '../../api/types';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import type { AnalyticNote, Connection, DiagramElement, EpisodeFields, StyleConfig, Transcript } from '../../types';

/** Load a library diagram onto the canvas and switch to it. Resolves false
 *  (after a toast) when it couldn't be opened. */
export async function openLibraryDiagram(id: number): Promise<boolean> {
  try {
    const d = await api<CloudDiagram>(`/api/diagrams/${id}`);
    const snap = d.snapshot;
    if (!snap.elements || !snap.connections) {
      useToastStore.getState().addToast('error', 'That diagram looks corrupted — ask your group admin.');
      return false;
    }
    // Coming from another group's diagram: drop that target first, so its
    // codebook mirror doesn't write the old group's kinds into this diagram.
    const current = useCloudStore.getState().groupId;
    if (current !== null && current !== d.groupId) useCloudStore.getState().clearCloudTarget();
    // Prefer the diagrams-table title over the snapshot's embedded name:
    // PATCH-renaming a diagram (DiagramCard) updates only the title column,
    // not the snapshot, so snap.name goes stale on rename until the next
    // content save. d.title is always current.
    useDiagramStore.getState().loadDiagram(
      snap.elements as DiagramElement[],
      snap.connections as Connection[],
      d.title,
      (snap.transcript ?? null) as Transcript | null,
      snap.styleConfig as StyleConfig | undefined,
      (snap.notes ?? []) as AnalyticNote[],
      snap.episode as EpisodeFields | undefined,
    );
    useCloudStore.getState().setCloudTarget(d.id, d.groupId, d.currentVersionId);
    useCloudStore.getState().setView('canvas');
    return true;
  } catch (err) {
    useToastStore.getState().addToast('error', friendlyError(err));
    return false;
  }
}
