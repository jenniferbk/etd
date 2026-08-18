import { api, ApiError } from '../api/client';
import { friendlyError } from '../api/friendlyError';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';
import { buildCloudSnapshot } from '../utils/buildCloudSnapshot';
import { saveDiagramJson } from '../utils/saveDiagram';

/** The single Save entry point. Signed out it behaves exactly like the old
 *  local save; signed in it targets the team library. */
export async function saveToLibrary(): Promise<void> {
  const user = useAuthStore.getState().user;
  const d = useDiagramStore.getState();

  if (!user) {
    await saveDiagramJson({
      diagramName: d.diagramName,
      elements: d.elements,
      connections: d.connections,
      styleConfig: d.styleConfig,
      transcript: d.transcript,
    });
    return;
  }

  const cloud = useCloudStore.getState();
  if (cloud.diagramId === null) {
    cloud.setAddToLibraryOpen(true);
    return;
  }

  cloud.setStatus('saving');
  try {
    const snapshot = buildCloudSnapshot();
    const title = d.diagramName.trim() || undefined;
    await api(`/api/diagrams/${cloud.diagramId}`, { method: 'PUT', body: { snapshot, title } });
    useCloudStore.getState().setStatus('saved');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const c = useCloudStore.getState();
      c.clearCloudTarget();
      useToastStore.getState().addToast('info', 'That diagram was removed from the library — save it as new.');
      c.setAddToLibraryOpen(true);
      return;
    }
    if (err instanceof TypeError || (err instanceof ApiError && err.status >= 500)) {
      useCloudStore.getState().setStatus('offline');
      return;
    }
    useCloudStore.getState().setStatus('dirty');
    useToastStore.getState().addToast('error', friendlyError(err));
  }
}
