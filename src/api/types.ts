export interface CloudUser {
  id: number;
  email: string;
  displayName: string;
  isSiteAdmin: boolean;
}

export interface CloudGroup {
  id: number;
  name: string;
  role: 'admin' | 'member';
}

export interface DiagramListItem {
  id: number;
  title: string;
  updatedAt: string;
  lastEditor: string;
  versionCount: number;
}

/** Exactly the shape saveDiagramJson writes to local .json files. */
export interface SavedDiagramFile {
  version: string;
  name: string;
  elements: unknown[];
  connections: unknown[];
  styleConfig?: unknown;
  transcript?: unknown;
}

export interface CloudDiagram {
  id: number;
  groupId: number;
  title: string;
  currentVersionId: number;
  updatedAt: string;
  snapshot: SavedDiagramFile;
}
