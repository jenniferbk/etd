import { create } from 'zustand';
import { DEFAULT_SORT, type SortSpec } from '../components/Workspace/workspaceList';

export type LibrarySaveStatus = 'saved' | 'dirty' | 'saving' | 'notInLibrary' | 'offline';
export type AppView = 'workspace' | 'canvas';
export type WorkspaceTab = 'diagrams' | 'people' | 'trash';
export type WorkspaceViewMode = 'grid' | 'list';

// Grid/list and sort are a per-browser convenience; storage can be missing
// or throw (private windows, tests), so every access is guarded.
const BROWSE_KEY = 'etd.workspaceBrowse';
function loadBrowsePrefs(): { viewMode: WorkspaceViewMode; sort: SortSpec } {
  try {
    const raw = JSON.parse(localStorage.getItem(BROWSE_KEY) ?? 'null') as
      { viewMode?: unknown; sort?: { key?: unknown; dir?: unknown } } | null;
    const viewMode = raw?.viewMode === 'list' ? 'list' : 'grid';
    const key = raw?.sort?.key;
    const dir = raw?.sort?.dir;
    const keyOk = key === 'title' || key === 'updatedAt' || key === 'lastEditor' || key === 'versionCount';
    const dirOk = dir === 'asc' || dir === 'desc';
    const sort: SortSpec = keyOk && dirOk ? { key, dir } : DEFAULT_SORT;
    return { viewMode, sort };
  } catch {
    return { viewMode: 'grid', sort: DEFAULT_SORT };
  }
}
function saveBrowsePrefs(prefs: { viewMode: WorkspaceViewMode; sort: SortSpec }): void {
  try {
    localStorage.setItem(BROWSE_KEY, JSON.stringify(prefs));
  } catch { /* not remembered; nothing else depends on it */ }
}

/** Tracks which library diagram (if any) the canvas corresponds to, plus the
 *  signed-in app view and the save-status state machine shown in the canvas
 *  header. Signed-out sessions never read view/status. */
interface CloudState {
  diagramId: number | null;
  groupId: number | null;
  /** The version this canvas was loaded/last-saved at, sent as the PUT's
   *  optimistic-concurrency check. Null when there's nothing to compare yet
   *  (unlinked diagram, or signed out). */
  baseVersionId: number | null;
  /** Set when a save 409s because someone else saved first. Cleared by
   *  resolving the conflict (reload or force-save). */
  conflict: { currentVersionId: number } | null;
  view: AppView;
  status: LibrarySaveStatus;
  addToLibraryOpen: boolean;
  /** Which pane of the Workspace's header nav is showing — the diagram
   *  gallery (default) or the People roster. */
  workspaceTab: WorkspaceTab;
  /** Whether the version-history side panel is open. */
  historyOpen: boolean;
  /** Whether the diagram chat side panel is open. */
  chatOpen: boolean;
  /** Set while the canvas is showing a read-only past version instead of the
   *  live diagram. Null when viewing the current (editable) content. */
  preview: { versionId: number; createdAt: string } | null;
  /** The workspace folder being browsed; null = top level. */
  folderId: number | null;
  viewMode: WorkspaceViewMode;
  sort: SortSpec;
  /** Where "Add to library" files a diagram started from inside a folder.
   *  Survives clearCloudTarget (which "New diagram" calls) and is cleared once
   *  the diagram is in the library. */
  newDiagramFolder: { groupId: number; folderId: number } | null;
  setCloudTarget: (diagramId: number, groupId: number, baseVersionId?: number) => void;
  clearCloudTarget: () => void;
  setBaseVersionId: (id: number | null) => void;
  setConflict: (conflict: { currentVersionId: number } | null) => void;
  setView: (view: AppView) => void;
  setStatus: (status: LibrarySaveStatus) => void;
  setAddToLibraryOpen: (open: boolean) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  setHistoryOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setPreview: (preview: { versionId: number; createdAt: string } | null) => void;
  setFolderId: (folderId: number | null) => void;
  setViewMode: (viewMode: WorkspaceViewMode) => void;
  setSort: (sort: SortSpec) => void;
  setNewDiagramFolder: (target: { groupId: number; folderId: number } | null) => void;
}

export const useCloudStore = create<CloudState>((set, get) => ({
  diagramId: null,
  groupId: null,
  baseVersionId: null,
  conflict: null,
  view: 'canvas',
  status: 'notInLibrary',
  addToLibraryOpen: false,
  workspaceTab: 'diagrams',
  historyOpen: false,
  chatOpen: false,
  preview: null,
  folderId: null,
  ...loadBrowsePrefs(),
  newDiagramFolder: null,
  setCloudTarget: (diagramId, groupId, baseVersionId) =>
    set({
      diagramId,
      groupId,
      status: 'saved',
      newDiagramFolder: null,
      ...(baseVersionId !== undefined ? { baseVersionId } : {}),
    }),
  clearCloudTarget: () =>
    set({
      diagramId: null,
      groupId: null,
      status: 'notInLibrary',
      baseVersionId: null,
      conflict: null,
      preview: null,
      historyOpen: false,
      chatOpen: false,
    }),
  setBaseVersionId: (baseVersionId) => set({ baseVersionId }),
  setConflict: (conflict) => set({ conflict }),
  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setAddToLibraryOpen: (addToLibraryOpen) => set({ addToLibraryOpen }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setPreview: (preview) => set({ preview }),
  setFolderId: (folderId) => set({ folderId }),
  setViewMode: (viewMode) => {
    set({ viewMode });
    saveBrowsePrefs({ viewMode, sort: get().sort });
  },
  setSort: (sort) => {
    set({ sort });
    saveBrowsePrefs({ viewMode: get().viewMode, sort });
  },
  setNewDiagramFolder: (newDiagramFolder) => set({ newDiagramFolder }),
}));
