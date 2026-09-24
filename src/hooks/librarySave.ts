import { api, ApiError } from '../api/client';
import { friendlyError } from '../api/friendlyError';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';
import { buildCloudSnapshot } from '../utils/buildCloudSnapshot';
import { saveDiagramJson } from '../utils/saveDiagram';
import { getEditTick } from './dirtyTracking';
import { captureThumbnail } from '../utils/thumbnail';

/** The single Save entry point. Signed out it behaves exactly like the old
 *  local save; signed in it targets the team library.
 *
 *  `opts.force` skips the optimistic-concurrency check (used by "save
 *  anyway" once the user has seen the conflict dialog) — the PUT omits
 *  baseVersionId entirely, so the server accepts it unconditionally. */
export async function saveToLibrary(opts: { force?: boolean } = {}): Promise<void> {
  const user = useAuthStore.getState().user;
  const d = useDiagramStore.getState();

  if (!user) {
    await saveDiagramJson({
      diagramName: d.diagramName,
      elements: d.elements,
      connections: d.connections,
      styleConfig: d.styleConfig,
      transcript: d.transcript,
      notes: d.notes,
    });
    return;
  }

  const cloud = useCloudStore.getState();
  if (cloud.diagramId === null) {
    cloud.setAddToLibraryOpen(true);
    return;
  }

  // Guard against concurrent PUTs (double ⌘S, double "Try again") which
  // would otherwise create duplicate version rows.
  if (cloud.status === 'saving') return;

  // The save is async; the signed-in user could sign out, or the canvas
  // could be re-pointed at a different library diagram, before it resolves.
  // Every handler below re-checks against this snapshot before touching
  // state so a stale response can't clobber whatever's current now.
  const diagramIdAtStart = cloud.diagramId;
  const staleContext = () =>
    useCloudStore.getState().diagramId !== diagramIdAtStart || !useAuthStore.getState().user;

  cloud.setStatus('saving');
  try {
    const tickBefore = getEditTick();
    const snapshot = buildCloudSnapshot();
    const title = d.diagramName.trim() || undefined;
    const baseVersionId = opts.force ? undefined : (useCloudStore.getState().baseVersionId ?? undefined);
    const res = await api<{ currentVersionId: number }>(`/api/diagrams/${cloud.diagramId}`, {
      method: 'PUT',
      body: { snapshot, title, baseVersionId, thumbnail: captureThumbnail() },
    });

    if (staleContext()) return;
    useCloudStore.getState().setBaseVersionId(res.currentVersionId);
    // If the diagram was edited while this PUT was in flight, the snapshot
    // we just saved is already stale — reflect that instead of lying 'saved'.
    useCloudStore.getState().setStatus(getEditTick() === tickBefore ? 'saved' : 'dirty');
  } catch (err) {
    if (staleContext()) return;

    if (err instanceof ApiError && err.status === 409) {
      // Someone else saved first. The AddToLibraryDialog's sibling — the
      // conflict dialog — reads `conflict` and offers Overwrite, Save as a
      // copy, or Cancel; no toast here, that dialog *is* the UI for this.
      useCloudStore.getState().setStatus('dirty');
      const body = err.body as { currentVersionId?: number } | undefined;
      if (typeof body?.currentVersionId === 'number') {
        useCloudStore.getState().setConflict({ currentVersionId: body.currentVersionId });
      }
      return;
    }
    if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
      // 410 = someone moved it to the trash while it was open here. Either
      // way the local edits are kept and offered as a new library diagram.
      const c = useCloudStore.getState();
      c.clearCloudTarget();
      useToastStore.getState().addToast(
        'info',
        err.status === 410
          ? 'Someone moved this diagram to the trash — save your work as a new diagram, or restore the original from the Trash tab.'
          : 'That diagram was removed from the library — save it as new.',
      );
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
