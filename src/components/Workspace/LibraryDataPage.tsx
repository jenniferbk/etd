import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { FolderListItem } from '../../api/types';
import { useLibraryDataSource } from '../../data/sources';
import { focusElement } from '../../data/focusElement';
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
    // A server that predates folders answers 404; treat that as none.
    void api<FolderListItem[]>(`/api/groups/${groupId}/folders`)
      .catch(() => [] as FolderListItem[])
      .then((list) => { if (!cancelled) setFolders(list); });
    return () => { cancelled = true; };
  }, [groupId]);

  const openElement = useCallback((diagramId: number | null, elementId: string) => {
    if (diagramId === null) return;
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
