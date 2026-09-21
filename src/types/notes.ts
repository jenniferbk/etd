// Analytic notes — researcher memos saved inside the diagram file. A note is
// either general (no anchor) or attached to one element or connection by id.
// Anchors are resolved at render time: if the anchored item is gone the note
// is shown as detached, never deleted (see utils/noteAnchors.ts).

export type NoteAnchorKind = 'element' | 'connection';

export interface NoteAnchor {
  kind: NoteAnchorKind;
  id: string;
}

export interface AnalyticNote {
  id: string;
  text: string;
  /** Display name of the signed-in author at creation; absent when signed out. */
  author?: string;
  /** ISO 8601 with zone, e.g. 2026-09-21T14:03:00.000Z */
  createdAt: string;
  /** Set on every text edit. */
  updatedAt?: string;
  /** Absent → general note about the whole diagram. */
  anchor?: NoteAnchor;
}
