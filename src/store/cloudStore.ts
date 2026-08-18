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
  view: AppView;
  status: LibrarySaveStatus;
  addToLibraryOpen: boolean;
  /** Which pane of the Workspace's header nav is showing — the diagram
   *  gallery (default) or the People roster. */
  workspaceTab: WorkspaceTab;
  setCloudTarget: (diagramId: number, groupId: number) => void;
  clearCloudTarget: () => void;
  setView: (view: AppView) => void;
  setStatus: (status: LibrarySaveStatus) => void;
  setAddToLibraryOpen: (open: boolean) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  diagramId: null,
  groupId: null,
  view: 'canvas',
  status: 'notInLibrary',
  addToLibraryOpen: false,
  workspaceTab: 'diagrams',
  setCloudTarget: (diagramId, groupId) => set({ diagramId, groupId, status: 'saved' }),
  clearCloudTarget: () => set({ diagramId: null, groupId: null, status: 'notInLibrary' }),
  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setAddToLibraryOpen: (addToLibraryOpen) => set({ addToLibraryOpen }),
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
}));
