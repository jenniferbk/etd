// Container rules: an ordinary argument element flagged isContainer holds a
// one-level sub-argument. Members carry containerId. Pure functions — no
// React, no Konva, never mutate input; return the same array when unchanged.

import type {
  ArgumentElement, Connection, DiagramElement, Position, Size, SupportElement,
} from '../types';
import { isArgumentElement, isArrowAttachment, isSupportElement } from '../types';
import { bboxesOverlap, computeCluster } from './clusters';

export const CONTAINER_MIN_SIZE: Size = { width: 400, height: 250 };

export function isContainerElement(el: DiagramElement): el is ArgumentElement {
  return isArgumentElement(el) && el.isContainer === true;
}

function isQualifier(el: DiagramElement): boolean {
  return isArgumentElement(el) && el.argumentType === 'qualifier';
}

function isAttachedQualifier(el: DiagramElement): boolean {
  return isQualifier(el) && !!(el as ArgumentElement).attachedTo;
}

export function elementCenter(el: DiagramElement): Position {
  return { x: el.position.x + el.size.width / 2, y: el.position.y + el.size.height / 2 };
}

function containsCenter(container: DiagramElement, el: DiagramElement): boolean {
  const c = elementCenter(el);
  const { position: p, size: s } = container;
  return c.x >= p.x && c.x <= p.x + s.width && c.y >= p.y && c.y <= p.y + s.height;
}

/** Id of the topmost (last) container whose bounds contain el's center. */
export function containerAt(elements: readonly DiagramElement[], el: DiagramElement): string | null {
  if (isContainerElement(el) || isAttachedQualifier(el)) return null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const c = elements[i];
    if (c.id !== el.id && isContainerElement(c) && containsCenter(c, el)) return c.id;
  }
  return null;
}

export function membersOf(elements: readonly DiagramElement[], containerId: string): DiagramElement[] {
  return elements.filter((el) => el.containerId === containerId);
}

function omitKey(el: DiagramElement, key: string): DiagramElement {
  const copy: Record<string, unknown> = { ...el };
  delete copy[key];
  return copy as unknown as DiagramElement;
}

function withContainerId(el: DiagramElement, containerId: string | null): DiagramElement {
  if ((el.containerId ?? null) === containerId) return el;
  if (containerId === null) {
    return omitKey(el, 'containerId');
  }
  return { ...el, containerId };
}

function mapChanged(elements: DiagramElement[], fn: (el: DiagramElement) => DiagramElement): DiagramElement[] {
  let changed = false;
  const out = elements.map((el) => {
    const next = fn(el);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : elements;
}

export function retestMembership(elements: DiagramElement[], ids: ReadonlySet<string>): DiagramElement[] {
  return mapChanged(elements, (el) =>
    ids.has(el.id) && !isContainerElement(el) ? withContainerId(el, containerAt(elements, el)) : el,
  );
}

/** Re-test current members plus every non-container whose center is inside. */
export function retestAroundContainer(elements: DiagramElement[], containerId: string): DiagramElement[] {
  const container = elements.find((el) => el.id === containerId);
  if (!container) return elements;
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.containerId === containerId || (!isContainerElement(el) && containsCenter(container, el))) {
      ids.add(el.id);
    }
  }
  return retestMembership(elements, ids);
}

export function makeContainer(elements: DiagramElement[], id: string): DiagramElement[] {
  const el = elements.find((e) => e.id === id);
  // Qualifiers never contain, attached or not.
  if (!el || !isArgumentElement(el) || isQualifier(el)) return elements;
  const width = Math.max(el.size.width, CONTAINER_MIN_SIZE.width);
  const height = Math.max(el.size.height, CONTAINER_MIN_SIZE.height);
  const next = mapChanged(elements, (e) => {
    if (e.id !== id) return e;
    const unchanged = el.isContainer === true && el.containerId === undefined &&
      width === el.size.width && height === el.size.height;
    if (unchanged) return e;
    return { ...(withContainerId(el, null) as ArgumentElement), isContainer: true, size: { width, height } };
  });
  return retestAroundContainer(next, id);
}

export function unmakeContainer(elements: DiagramElement[], id: string): DiagramElement[] {
  return mapChanged(elements, (el) => {
    if (el.id === id && isArgumentElement(el)) {
      return el.isContainer === undefined ? el : (omitKey(el, 'isContainer') as ArgumentElement);
    }
    return el.containerId === id ? withContainerId(el, null) : el;
  });
}

function dropIsContainer(el: DiagramElement): DiagramElement {
  return omitKey(el, 'isContainer');
}

export function normalizeContainers(elements: DiagramElement[]): DiagramElement[] {
  const containerIds = new Set(
    elements.filter((el) => isContainerElement(el) && !isQualifier(el)).map((el) => el.id),
  );
  return mapChanged(elements, (el) => {
    const flagged = (el as { isContainer?: boolean }).isContainer !== undefined;
    const badFlag = flagged && (!isArgumentElement(el) || isQualifier(el));
    const next = badFlag ? dropIsContainer(el) : el;
    const cid = next.containerId;
    const badId =
      cid !== undefined &&
      (isContainerElement(next) || isAttachedQualifier(next) || cid === next.id || !containerIds.has(cid));
    return badId ? withContainerId(next, null) : next;
  });
}

/**
 * Container + members + supports hanging off the container's cluster. A
 * non-member support rides along only when it is unlinked or linked to the
 * container itself; one linked to another argument stays with that argument.
 */
export function containerDragIds(elements: readonly DiagramElement[], containerId: string): string[] {
  const ids = new Set<string>([containerId]);
  for (const m of membersOf(elements, containerId)) ids.add(m.id);
  const cluster = computeCluster(elements as DiagramElement[], containerId);
  for (const s of cluster?.supports ?? []) {
    if (s.containerId === containerId) { ids.add(s.id); continue; }
    if (s.containerId !== undefined) continue;
    if (s.associatedWith === undefined || s.associatedWith === containerId) ids.add(s.id);
  }
  return [...ids];
}

export function linkCandidates(
  support: DiagramElement,
  overlappedArgIds: ReadonlySet<string>,
  elementsById: ReadonlyMap<string, DiagramElement>,
): Set<string> {
  const out = new Set<string>();
  for (const id of overlappedArgIds) {
    const el = elementsById.get(id);
    if (el && isContainerElement(el) && containsCenter(el, support)) continue;
    out.add(id);
  }
  return out;
}

/**
 * Arguments a support dropped at `position` could link to: one BFS over the
 * overlap graph from the support's would-be bounds, walking through supports
 * and walling at arguments, then filtered through linkCandidates.
 */
export function dropLinkCandidates(
  elements: readonly DiagramElement[], supportId: string, position: Position,
): Set<string> {
  const support = elements.find((el) => el.id === supportId);
  if (!support) return new Set();
  const hypothetical = elements.map((el) => (el.id === supportId ? { ...el, position } : el));
  const start = hypothetical.find((el) => el.id === supportId)!;
  const visited = new Set<string>([supportId]);
  const queue: DiagramElement[] = [start];
  const overlappedArgIds = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of hypothetical) {
      if (visited.has(candidate.id) || !bboxesOverlap(current, candidate)) continue;
      visited.add(candidate.id);
      if (isArgumentElement(candidate)) overlappedArgIds.add(candidate.id);
      else if (isSupportElement(candidate)) queue.push(candidate);
    }
  }
  return linkCandidates(start, overlappedArgIds, new Map(hypothetical.map((el) => [el.id, el])));
}

export function splitForRender<T extends DiagramElement>(
  elements: readonly T[],
): { containers: T[]; others: T[] } {
  const containers: T[] = [];
  const others: T[] = [];
  for (const el of elements) (isContainerElement(el) ? containers : others).push(el);
  return { containers, others };
}

function copiedConnectionIds(
  connections: readonly Connection[], copied: ReadonlySet<string>,
): Set<string> {
  const picked = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of connections) {
      if (picked.has(c.id) || !copied.has(c.from)) continue;
      const ok = isArrowAttachment(c.to) ? picked.has(c.to.connectionId) : copied.has(c.to);
      if (ok) { picked.add(c.id); grew = true; }
    }
  }
  return picked;
}

/** Grows `wanted` with qualifiers attached to copied connections; returns copied connection ids. */
function closeOverQualifiers(
  elements: readonly DiagramElement[], connections: readonly Connection[], wanted: Set<string>,
): Set<string> {
  for (;;) {
    const picked = copiedConnectionIds(connections, wanted);
    const before = wanted.size;
    for (const el of elements) {
      if (isArgumentElement(el) && el.attachedTo && picked.has(el.attachedTo.connectionId)) wanted.add(el.id);
    }
    if (wanted.size === before) return picked;
  }
}

export function duplicateWithMembers(
  elements: readonly DiagramElement[],
  connections: readonly Connection[],
  ids: readonly string[],
  makeId: () => string,
  offset: Position,
): { elements: DiagramElement[]; connections: Connection[]; newIds: string[] } {
  const wanted = new Set(ids);
  for (const id of ids) {
    const el = elements.find((e) => e.id === id);
    if (el && isContainerElement(el)) membersOf(elements, id).forEach((m) => wanted.add(m.id));
  }
  const picked = closeOverQualifiers(elements, connections, wanted);
  const sources = elements.filter((el) => wanted.has(el.id));
  const idMap = new Map(sources.map((el) => [el.id, makeId()]));
  const connMap = new Map<string, string>();
  for (const c of connections) if (picked.has(c.id)) connMap.set(c.id, makeId());

  const copies = sources.map((el) => copyElement(el, idMap, connMap, offset));
  const combined = [...elements, ...copies];
  const placed = copies.map((c, i) => {
    const old = sources[i].containerId;
    return old !== undefined && idMap.has(old) ? c : withContainerId(c, containerAt(combined, c));
  });
  const newConns = connections.filter((c) => picked.has(c.id)).map((c): Connection => ({
    ...c,
    id: connMap.get(c.id)!,
    from: idMap.get(c.from)!,
    to: isArrowAttachment(c.to)
      ? { ...c.to, connectionId: connMap.get(c.to.connectionId)! }
      : idMap.get(c.to)!,
    ...(c.waypoints ? { waypoints: c.waypoints.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) } : {}),
  }));
  return { elements: placed, connections: newConns, newIds: [...idMap.values()] };
}

function copyElement(
  el: DiagramElement, idMap: Map<string, string>, connMap: Map<string, string>, offset: Position,
): DiagramElement {
  const copy: DiagramElement = {
    ...el,
    id: idMap.get(el.id)!,
    position: { x: el.position.x + offset.x, y: el.position.y + offset.y },
  };
  if (el.containerId !== undefined && idMap.has(el.containerId)) copy.containerId = idMap.get(el.containerId);
  if (isSupportElement(el) && el.associatedWith && idMap.has(el.associatedWith)) {
    (copy as SupportElement).associatedWith = idMap.get(el.associatedWith);
  }
  if (isArgumentElement(el) && el.attachedTo && connMap.has(el.attachedTo.connectionId)) {
    (copy as ArgumentElement).attachedTo = { ...el.attachedTo, connectionId: connMap.get(el.attachedTo.connectionId)! };
  }
  return copy;
}
