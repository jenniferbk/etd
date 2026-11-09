import { isArgumentElement, isArrowAttachment } from '../types';
import type { Connection, DiagramElement } from '../types';

type ElementMap = ReadonlyMap<string, DiagramElement>;

/** True when the connection targets a qualifier that is attached to a parent connection. */
export function isRebuttalToAttachedQualifier(conn: Connection, elementsById: ElementMap): boolean {
  if (typeof conn.to !== 'string') return false;
  const target = elementsById.get(conn.to);
  return (
    target !== undefined &&
    isArgumentElement(target) &&
    target.argumentType === 'qualifier' &&
    target.attachedTo !== undefined
  );
}

/** The automatic arrowhead rule used when a connection has no override. */
export function defaultArrowhead(conn: Connection, elementsById: ElementMap): boolean {
  if (conn.type === 'counterclaim') return false;
  if (isArrowAttachment(conn.to)) return false;
  if (isRebuttalToAttachedQualifier(conn, elementsById)) return false;
  return true;
}

/** Explicit override wins; otherwise the automatic rule. */
export function resolveArrowhead(conn: Connection, elementsById: ElementMap): boolean {
  return conn.arrowhead ?? defaultArrowhead(conn, elementsById);
}
