import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { FolderListItem } from '../../api/types';
import { useLibraryDataSource } from '../../data/sources';
import { focusElement } from '../../data/focusElement';
import { useCloudStore } from '../../store/cloudStore';
import { useToastStore } from '../../store/toastStore';
import { DataView } from '../DataView';
import { openLibraryDiagram } from './openLibraryDiagram';

/** The Workspace's Data tab: every diagram in the group, optionally one folder. */
export function LibraryDataPage({ groupId }: { groupId: number }) {
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);

  // A different group starts on All diagrams.
  const [shownGroup, setShownGroup] = useState(groupId);
  if (shownGroup !== groupId) {
    setShownGroup(groupId);
    setFolderId(null);
    setFolders([]);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: FolderListItem[];
      try {
        list = await api<FolderListItem[]>(`/api/groups/${groupId}/folders`);
      } catch (err) {
        if (cancelled) return;
        // A server that predates folders answers 404; that means none.
        if (!(err instanceof ApiError && err.status === 404)) {
          useToastStore.getState().addToast('error', friendlyError(err));
        }
        list = [];
      }
      if (cancelled) return;
      setFolders(list);
      // The chosen folder is gone (deleted here or by a teammate).
      setFolderId((current) => (current !== null && !list.some((f) => f.id === current) ? null : current));
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const openElement = useCallback((diagramId: number | null, elementId: string) => {
    if (diagramId === null) return;
    // Leaving the canvas keeps its diagram loaded (← only switches views), and
    // going back restarts the live session, which brings it up to date. So
    // the open diagram is shown again, not refetched over local state.
    const cloud = useCloudStore.getState();
    if (cloud.diagramId === diagramId && cloud.preview === null) {
      cloud.setView('canvas');
      cloud.setCanvasMode('diagram');
      focusElement(elementId);
      return;
    }
    void (async () => {
      if (await openLibraryDiagram(diagramId)) focusElement(elementId);
    })();
  }, []);

  const source = useLibraryDataSource(groupId, folderId, openElement);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--chrome-bg)] px-4! py-2!">
        <label className="inline-flex items-center gap-2 text-[13px]! font-normal! tracking-normal! normal-case! text-[var(--text-secondary)]!">
          Folder
          <select
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value === '' ? null : Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-white! px-1.5! py-1! text-[13px] text-[var(--text)] hover:border-[var(--border-strong)]"
          >
            <option value="">All diagrams</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1">
        <DataView source={source} />
      </div>
    </div>
  );
}
