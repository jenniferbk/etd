// The diagram store calls documentWillBeReplaced() at the start of
// loadDiagram and clearDiagram. A running live session registers a handler
// that detaches it first, so opening a file, recovering an autosave, importing
// from an image, or clearing the canvas never pushes that content into the
// shared library diagram. Kept dependency-free to avoid an import cycle
// between the store and the live session.

let handler: (() => void) | null = null;

export function setReplaceHandler(next: (() => void) | null): void {
  handler = next;
}

export function documentWillBeReplaced(): void {
  handler?.();
}
