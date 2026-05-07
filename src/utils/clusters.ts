// Cluster geometry for support→argument linking.
// Pure functions — no React, no Konva.

import type {
  ArgumentElement,
  BaseElement,
  DiagramElement,
  SupportElement,
} from '../types';
import { isArgumentElement, isSupportElement } from '../types';

export interface Cluster {
  argument: ArgumentElement;
  supports: SupportElement[];
}

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard axis-aligned rect intersection. Edge-touching returns false. */
export function bboxesOverlap(a: BaseElement, b: BaseElement): boolean {
  return (
    a.position.x < b.position.x + b.size.width &&
    a.position.x + a.size.width > b.position.x &&
    a.position.y < b.position.y + b.size.height &&
    a.position.y + a.size.height > b.position.y
  );
}

/**
 * BFS over overlap graph from the anchor argument.
 * Walls at non-anchor arguments — the cluster only walks through supports.
 * Returns null if argumentId is missing or not an argument.
 */
export function computeCluster(
  elements: DiagramElement[],
  argumentId: string,
): Cluster | null {
  const anchor = elements.find((el) => el.id === argumentId);
  if (!anchor || !isArgumentElement(anchor)) return null;

  const visited = new Set<string>([anchor.id]);
  const queue: DiagramElement[] = [anchor];
  const supports: SupportElement[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of elements) {
      if (visited.has(candidate.id)) continue;
      if (!bboxesOverlap(current, candidate)) continue;
      // Wall: another argument blocks traversal (it's still marked visited
      // so we don't re-check it, but we don't queue it and don't add to supports).
      if (isArgumentElement(candidate) && candidate.id !== anchor.id) {
        visited.add(candidate.id);
        continue;
      }
      visited.add(candidate.id);
      if (isSupportElement(candidate)) {
        supports.push(candidate);
        queue.push(candidate);
      }
      // Other element types (InfoBox, deprecated TeacherSupport) are absorbed
      // into visited but neither added to supports nor walked from.
    }
  }

  return { argument: anchor, supports };
}

/** Smallest axis-aligned rect enclosing all elements. Assumes non-empty input. */
export function unionBbox(elements: BaseElement[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + el.size.width);
    maxY = Math.max(maxY, el.position.y + el.size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
