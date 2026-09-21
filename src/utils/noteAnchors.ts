// Pure helpers for analytic-note anchors: resolving an anchor against the
// current elements/connections and producing the short labels shown in the
// Notes panel ("Claim 2", "Data 1 → Claim 2", "Detached — item deleted").
// No React, no Konva — unit-tested in Node.

import type { AnalyticNote, Connection, DiagramElement, NoteAnchor } from '../types';
import { isArgumentElement, isArrowAttachment, isInfoBoxElement, isSupportElement } from '../types';
import { deriveClaimLabel, getClaimRole } from './claimRoleDerivation';

export type ResolvedAnchor =
  | { status: 'general' }
  | { status: 'attached'; anchor: NoteAnchor; label: string }
  | { status: 'detached'; anchor: NoteAnchor };

export const DETACHED_LABEL = 'Detached — item deleted';

/** Collapse whitespace and cap at `max` characters (ellipsis counts as one). */
export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

/** Short label for an element as shown in anchor chips. Claims use the live
 *  role derivation so a claim wired as data reads "Dataclaim 1" here too. */
export function describeElement(
  el: DiagramElement,
  connections: readonly Connection[],
  elementsById: ReadonlyMap<string, DiagramElement>,
): string {
  if (isArgumentElement(el)) {
    if (el.argumentType === 'claim') {
      return deriveClaimLabel(el.label, getClaimRole(el, connections, elementsById));
    }
    return el.label;
  }
  if (isSupportElement(el)) {
    const kind = el.supportType.charAt(0).toUpperCase() + el.supportType.slice(1);
    return el.content.trim() ? `${kind}: ${truncate(el.content, 24)}` : kind;
  }
  if (isInfoBoxElement(el)) return el.label;
  // Deprecated TeacherSupportElement
  return el.content.trim() ? truncate(el.content, 24) : 'Teacher support';
}

/** "Data 1 → Claim 2"; "Claim 1 –/– Claim 2" for counterclaims;
 *  "Warrant 1 → line" when the target is another connection. */
export function describeConnection(
  conn: Connection,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): string {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const from = byId.get(conn.from);
  const fromLabel = from ? describeElement(from, connections, byId) : '?';
  const joiner = conn.type === 'counterclaim' ? ' –/– ' : ' → ';
  if (isArrowAttachment(conn.to)) return `${fromLabel}${joiner}line`;
  const to = byId.get(conn.to);
  return `${fromLabel}${joiner}${to ? describeElement(to, connections, byId) : '?'}`;
}

/** Label for an anchor, or null when the anchored item no longer exists. */
export function describeAnchor(
  anchor: NoteAnchor,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): string | null {
  if (anchor.kind === 'element') {
    const el = elements.find((e) => e.id === anchor.id);
    if (!el) return null;
    return describeElement(el, connections, new Map(elements.map((e) => [e.id, e])));
  }
  const conn = connections.find((c) => c.id === anchor.id);
  if (!conn) return null;
  return describeConnection(conn, elements, connections);
}

export function resolveAnchor(
  note: AnalyticNote,
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): ResolvedAnchor {
  if (!note.anchor) return { status: 'general' };
  const label = describeAnchor(note.anchor, elements, connections);
  if (label === null) return { status: 'detached', anchor: note.anchor };
  return { status: 'attached', anchor: note.anchor, label };
}

/** The anchor a new note would attach to: exactly one selected id that is an
 *  element or a connection. Nothing / multi-selection / unknown id → null. */
export function selectionAnchor(
  selectedIds: readonly string[],
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
): NoteAnchor | null {
  if (selectedIds.length !== 1) return null;
  const id = selectedIds[0];
  if (elements.some((e) => e.id === id)) return { kind: 'element', id };
  if (connections.some((c) => c.id === id)) return { kind: 'connection', id };
  return null;
}

/** Number of notes per anchored item id — drives the canvas badges. */
export function countNotesByAnchor(notes: readonly AnalyticNote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (!n.anchor) continue;
    counts.set(n.anchor.id, (counts.get(n.anchor.id) ?? 0) + 1);
  }
  return counts;
}
