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

export interface GroupMember {
  id: number;
  email: string;
  displayName: string;
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

/** One row of a diagram's version history list (GET /api/diagrams/:id/versions). */
export interface DiagramVersionListItem {
  id: number;
  author: string;
  createdAt: string;
  isCurrent: boolean;
}

/** A single version's full content (GET /api/diagrams/:id/versions/:versionId). */
export interface DiagramVersion {
  id: number;
  author: string;
  createdAt: string;
  snapshot: SavedDiagramFile;
}
