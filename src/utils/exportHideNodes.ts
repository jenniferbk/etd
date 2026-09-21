// Keeps canvas-only UI (note badges) out of PNG/PDF stage snapshots. Konva's
// stage.toDataURL renders whatever is visible, so we hide the badge nodes,
// take the snapshot, then restore. Typed against a minimal surface so the
// helper is unit-testable without Konva.

/** Konva node name for analytic-note badges; `stage.find(NOTE_BADGE_SELECTOR)` finds them all. */
export const NOTE_BADGE_NAME = 'note-badge';
export const NOTE_BADGE_SELECTOR = `.${NOTE_BADGE_NAME}`;

export interface HideableNode {
  visible(): boolean;
  visible(value: boolean): unknown;
}

export interface HideableStage {
  find(selector: string): HideableNode[];
  draw(): unknown;
}

export function withNodesHidden<T>(stage: HideableStage, selector: string, fn: () => T): T {
  const nodes = stage.find(selector);
  const previous = nodes.map((n) => n.visible());
  nodes.forEach((n) => n.visible(false));
  stage.draw();
  try {
    return fn();
  } finally {
    nodes.forEach((n, i) => n.visible(previous[i]));
    stage.draw();
  }
}
