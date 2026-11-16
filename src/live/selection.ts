/** The part of a selection that still points at something in the document
 *  (elements or connections), in its original order. */
export function keepSelection(
  selectedIds: string[],
  doc: { elements: { id: string }[]; connections: { id: string }[] },
): string[] {
  const ids = new Set([...doc.elements.map((e) => e.id), ...doc.connections.map((c) => c.id)]);
  return selectedIds.filter((id) => ids.has(id));
}
