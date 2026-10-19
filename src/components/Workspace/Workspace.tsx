import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, FolderPlus, LayoutGrid, List, Pencil, Search, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { CloudDiagram, DiagramListItem, FolderListItem } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { importDrawingFile } from '../../utils/drawingImporter';
import { nameForLoadedFile } from '../../utils/saveDiagram';
import type { AnalyticNote, Connection, DiagramElement, StyleConfig, Transcript } from '../../types';
import { WorkspaceHeader } from './WorkspaceHeader';
import { DiagramCard } from './DiagramCard';
import { PeoplePage } from './PeoplePage';
import { TrashPage } from './TrashPage';
import { DiagramListView } from './DiagramListView';
import { FolderTile } from './FolderTile';
import { NameModal } from './NameModal';
import { OptionsMenu } from './OptionsMenu';
import { defaultDirFor, visibleDiagrams, type SortKey } from './workspaceList';

const SORT_LABELS: Record<SortKey, string> = {
  updatedAt: 'Last edited',
  title: 'Title',
  lastEditor: 'Editor',
  versionCount: 'Versions',
};

/** Card-gallery home view — the landing page for a signed-in user, before
 *  they've opened any particular diagram onto the canvas. App renders this
 *  when cloudStore.view === 'workspace' and a user exists.
 *
 *  Data logic (effectiveGroupId defaulting + requestSeq stale-response guard)
 *  is ported verbatim in behavior from the now-removed Cloud/LibraryModal.tsx. */
export function Workspace() {
  const groups = useAuthStore((s) => s.groups);
  const workspaceTab = useCloudStore((s) => s.workspaceTab);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<DiagramListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [query, setQuery] = useState('');
  // null = closed; 'new' = create; a folder = rename that folder.
  const [folderDialog, setFolderDialog] = useState<'new' | FolderListItem | null>(null);
  const folderId = useCloudStore((s) => s.folderId);
  const viewMode = useCloudStore((s) => s.viewMode);
  const sort = useCloudStore((s) => s.sort);
  const effectiveGroupId = groupId ?? groups[0]?.id ?? null;
  // Guards against a stale response (e.g. group A's request resolving after
  // group B's, once the user has already switched groups) overwriting the
  // list with out-of-date data. Only the most recently issued request may
  // call setItems / toast.
  const requestSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (effectiveGroupId === null) return;
    const seq = ++requestSeq.current;
    setItems(null);
    setLoadError(false);
    try {
      const [result, folderList] = await Promise.all([
        api<DiagramListItem[]>(`/api/groups/${effectiveGroupId}/diagrams`),
        // A server that predates folders answers 404; treat that as none.
        api<FolderListItem[]>(`/api/groups/${effectiveGroupId}/folders`).catch(() => [] as FolderListItem[]),
      ]);
      if (seq === requestSeq.current) {
        setItems(result);
        setFolders(folderList);
        // The folder being browsed was deleted (here or by a teammate).
        const current = useCloudStore.getState().folderId;
        if (current !== null && !folderList.some((f) => f.id === current)) {
          useCloudStore.getState().setFolderId(null);
        }
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        useToastStore.getState().addToast('error', friendlyError(err));
        setItems([]);
        setLoadError(true);
      }
    }
  }, [effectiveGroupId]);

  // Fetch on mount, whenever the effective group changes, and on returning
  // to the Diagrams tab (a restore from Trash must show up without a reload).
  useEffect(() => {
    if (workspaceTab !== 'diagrams') return;
    void (async () => { await refresh(); })();
  }, [refresh, workspaceTab]);

  // Switching groups starts at the top level of the new group.
  const selectGroup = (id: number) => {
    setGroupId(id);
    useCloudStore.getState().setFolderId(null);
  };

  // Diagrams started from inside a folder are filed there on Add to library.
  const rememberFolderForNewDiagram = () => {
    useCloudStore.getState().setNewDiagramFolder(
      effectiveGroupId !== null && folderId !== null ? { groupId: effectiveGroupId, folderId } : null,
    );
  };

  const handleNewDiagram = () => {
    useDiagramStore.getState().clearDiagram();
    useCloudStore.getState().clearCloudTarget();
    rememberFolderForNewDiagram();
    useCloudStore.getState().setView('canvas');
  };

  const saveFolder = async (name: string) => {
    try {
      if (folderDialog === 'new') {
        await api(`/api/groups/${effectiveGroupId}/folders`, { method: 'POST', body: { name } });
      } else if (folderDialog) {
        await api(`/api/folders/${folderDialog.id}`, { method: 'PATCH', body: { name } });
      }
      void refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
      throw err;
    }
  };

  const deleteFolder = async (folder: FolderListItem) => {
    const n = folder.diagramCount;
    const ok = await confirmAsync({
      title: 'Delete folder',
      message: n === 0
        ? `Delete the empty folder "${folder.name}"?`
        : `Delete "${folder.name}"? Its ${n} ${n === 1 ? 'diagram moves' : 'diagrams move'} back to All diagrams. No diagrams are deleted.`,
      confirmLabel: 'Delete folder',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (useCloudStore.getState().folderId === folder.id) useCloudStore.getState().setFolderId(null);
      void refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const handleOpenFileClick = () => {
    fileInputRef.current?.click();
  };

  // Mirrors Toolbar.tsx's handleFileChange (same JSON.parse → shape check →
  // loadDiagram → clearCloudTarget flow, and the same .drawing importer
  // call), plus the view switch back to the canvas once a file is loaded.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Handle .drawing files (DiagramMix binary plist)
      if (file.name.endsWith('.drawing')) {
        const result = await importDrawingFile(file);
        useDiagramStore.getState().loadDiagram(result.elements, result.connections, result.name, null);
        useCloudStore.getState().clearCloudTarget();
        rememberFolderForNewDiagram();
        useCloudStore.getState().setView('canvas');
        e.target.value = '';
        return;
      }

      // Handle .json files
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.elements && data.connections) {
            useDiagramStore.getState().loadDiagram(
              data.elements, data.connections, nameForLoadedFile(data.name, file.name), data.transcript ?? null, data.styleConfig, data.notes,
            );
            useCloudStore.getState().clearCloudTarget();
            rememberFolderForNewDiagram();
            useCloudStore.getState().setView('canvas');
          } else {
            useToastStore.getState().addToast('error', 'Invalid diagram file format');
          }
        } catch {
          useToastStore.getState().addToast('error', 'Failed to parse diagram file');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  const openDiagram = async (item: DiagramListItem) => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      if (!snap.elements || !snap.connections) {
        useToastStore.getState().addToast('error', 'That diagram looks corrupted — ask your group admin.');
        return;
      }
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
      );
      useCloudStore.getState().setCloudTarget(d.id, d.groupId, d.currentVersionId);
      useCloudStore.getState().setView('canvas');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const selectedGroup = groups.find((g) => g.id === effectiveGroupId) ?? null;
  const currentFolder = folderId === null ? null : folders.find((f) => f.id === folderId) ?? null;
  const searching = query.trim().length > 0;
  const shown = useMemo(
    () => (items ? visibleDiagrams(items, { folderId, query, sort }) : []),
    [items, folderId, query, sort],
  );
  const showFolderTiles = !searching && folderId === null && folders.length > 0;

  const primaryButtonStyle = { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };
  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: theme.canvas.bg }}>
      <WorkspaceHeader
        groupName={selectedGroup?.name ?? ''}
        groups={groups}
        selectedGroupId={effectiveGroupId}
        onSelectGroup={selectGroup}
      />

      {workspaceTab === 'people' ? (
        effectiveGroupId !== null && <PeoplePage groupId={effectiveGroupId} groupName={selectedGroup?.name ?? ''} />
      ) : workspaceTab === 'trash' ? (
        effectiveGroupId !== null && <TrashPage groupId={effectiveGroupId} />
      ) : (
        <div className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={handleNewDiagram}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={primaryButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.primary.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.primary.bg; }}
            >
              ＋ New diagram
            </button>
            <button
              onClick={handleOpenFileClick}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={secondaryButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
            >
              Open a file…
            </button>
            {folderId === null && (
              <button
                onClick={() => setFolderDialog('new')}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                style={secondaryButtonStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
              >
                <FolderPlus size={16} aria-hidden="true" /> New folder
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.drawing"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <label className="relative flex-1 min-w-[12rem] max-w-sm">
              <span className="sr-only">Search diagram titles</span>
              <Search
                size={16}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: theme.sidebar.textSecondary }}
              />
              <input
                type="text"
                role="searchbox"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                placeholder="Search titles in all folders"
                className="w-full text-sm border rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  // Inline: index.css's unlayered reset zeroes Tailwind padding utilities.
                  padding: '0.5rem 2rem 0.5rem 2.25rem',
                  backgroundColor: theme.input.bg,
                  borderColor: theme.input.border,
                  color: theme.input.text,
                  outlineColor: theme.focus.ring,
                }}
              />
              {searching && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                  style={{ color: theme.sidebar.textSecondary }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </label>

            <div className="flex items-center gap-2 ml-auto">
              {viewMode === 'grid' && (
                <>
                  <label className="text-sm flex items-center gap-2" style={{ color: theme.sidebar.textSecondary }}>
                    Sort
                    <select
                      value={sort.key}
                      onChange={(e) => {
                        const key = e.target.value as SortKey;
                        useCloudStore.getState().setSort({ key, dir: defaultDirFor(key) });
                      }}
                      className="px-2 py-1.5 text-sm border rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: theme.input.bg,
                        borderColor: theme.input.border,
                        color: theme.input.text,
                        outlineColor: theme.focus.ring,
                      }}
                    >
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                        <option key={k} value={k}>{SORT_LABELS[k]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => useCloudStore.getState().setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
                    aria-label={sort.dir === 'asc' ? 'Sorted ascending; switch to descending' : 'Sorted descending; switch to ascending'}
                    title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
                    className="p-2 rounded-lg border"
                    style={{ ...secondaryButtonStyle }}
                  >
                    {sort.dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                  </button>
                </>
              )}
              <div
                className="inline-flex rounded-lg border overflow-hidden"
                role="group"
                aria-label="View"
                style={{ borderColor: theme.button.secondary.border }}
              >
                {([['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']] as const).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => useCloudStore.getState().setViewMode(mode)}
                    aria-pressed={viewMode === mode}
                    aria-label={label}
                    title={label}
                    className="p-2"
                    style={{
                      backgroundColor: viewMode === mode ? theme.sidebar.surfaceActive : theme.button.secondary.bg,
                      color: theme.button.secondary.text,
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!searching && currentFolder && (
            <nav className="flex items-center gap-1 mb-4 text-sm" aria-label="Folder">
              <button
                onClick={() => useCloudStore.getState().setFolderId(null)}
                className="px-1 rounded hover:underline"
                style={{ color: theme.sidebar.textSecondary }}
              >
                All diagrams
              </button>
              <ChevronRight size={14} aria-hidden="true" style={{ color: theme.sidebar.textSecondary }} />
              <span className="font-semibold px-1" style={{ color: theme.sidebar.text }} aria-current="page">
                {currentFolder.name}
              </span>
              <OptionsMenu
                tooltip="Folder options"
                ariaLabel={`Options for folder "${currentFolder.name}"`}
                items={[
                  { icon: Pencil, label: 'Rename folder', onClick: () => setFolderDialog(currentFolder) },
                  {
                    icon: Trash2, label: 'Delete folder', variant: 'danger', separatorBefore: true,
                    onClick: () => { void deleteFolder(currentFolder); },
                  },
                ]}
              />
            </nav>
          )}
          {searching && items !== null && !loadError && (
            <p className="text-sm mb-4" style={{ color: theme.sidebar.textSecondary }} role="status">
              {shown.length} {shown.length === 1 ? 'match' : 'matches'} in all folders
            </p>
          )}

          {items === null ? (
            <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
              Loading your diagrams…
            </p>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
                Something went wrong loading your diagrams.
              </p>
              <button
                onClick={() => void refresh()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={secondaryButtonStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {showFolderTiles && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {folders.map((f) => (
                    <FolderTile
                      key={f.id}
                      folder={f}
                      onOpen={() => useCloudStore.getState().setFolderId(f.id)}
                      onRename={() => setFolderDialog(f)}
                      onDelete={() => { void deleteFolder(f); }}
                    />
                  ))}
                </div>
              )}
              {shown.length === 0 ? (
                <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
                  {searching
                    ? `No diagram titles match “${query.trim()}”.`
                    : currentFolder
                      ? 'This folder is empty. To file a diagram here, use its ⋯ menu › Move to folder…'
                      : items.length === 0
                        ? 'No diagrams yet — create the first one.'
                        : 'Every diagram is in a folder.'}
                </p>
              ) : viewMode === 'list' ? (
                <DiagramListView
                  items={shown}
                  folders={folders}
                  showFolder={searching}
                  sort={sort}
                  onSort={(next) => useCloudStore.getState().setSort(next)}
                  onOpen={(item) => void openDiagram(item)}
                  onChanged={() => void refresh()}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shown.map((item) => (
                    <DiagramCard
                      key={item.id}
                      item={item}
                      folders={folders}
                      showFolder={searching}
                      onOpen={() => void openDiagram(item)}
                      onChanged={() => void refresh()}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <NameModal
            open={folderDialog !== null}
            onClose={() => setFolderDialog(null)}
            title={folderDialog === 'new' ? 'New folder' : 'Rename folder'}
            label="Folder name"
            placeholder="e.g. Year 2 lessons"
            initialValue={folderDialog && folderDialog !== 'new' ? folderDialog.name : ''}
            submitLabel={folderDialog === 'new' ? 'Create' : 'Save'}
            onSubmit={saveFolder}
          />
        </div>
      )}
    </div>
  );
}
