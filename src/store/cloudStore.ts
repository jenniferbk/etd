import { create } from 'zustand';

export type LibrarySaveStatus = 'saved' | 'dirty' | 'saving' | 'notInLibrary' | 'offline';
export type AppView = 'workspace' | 'canvas';
export type WorkspaceTab = 'diagrams' | 'people';

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
  /** Set while the canvas is showing a read-only past version instead of the
   *  live diagram. Null when viewing the current (editable) content. */
  preview: { versionId: number; createdAt: string } | null;
  setCloudTarget: (diagramId: number, groupId: number, baseVersionId?: number) => void;
  clearCloudTarget: () => void;
  setBaseVersionId: (id: number | null) => void;
  setConflict: (conflict: { currentVersionId: number } | null) => void;
  setView: (view: AppView) => void;
  setStatus: (status: LibrarySaveStatus) => void;
  setAddToLibraryOpen: (open: boolean) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  setHistoryOpen: (open: boolean) => void;
  setPreview: (preview: { versionId: number; createdAt: string } | null) => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  diagramId: null,
  groupId: null,
  baseVersionId: null,
  conflict: null,
  view: 'canvas',
  status: 'notInLibrary',
  addToLibraryOpen: false,
  workspaceTab: 'diagrams',
  historyOpen: false,
  preview: null,
  setCloudTarget: (diagramId, groupId, baseVersionId) =>
    set({
      diagramId,
      groupId,
      status: 'saved',
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
    }),
  setBaseVersionId: (baseVersionId) => set({ baseVersionId }),
  setConflict: (conflict) => set({ conflict }),
  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setAddToLibraryOpen: (addToLibraryOpen) => set({ addToLibraryOpen }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setPreview: (preview) => set({ preview }),
}));
