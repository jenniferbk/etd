// Keeps canvas-only UI (note badges) out of PNG/PDF/thumbnail stage snapshots. Konva's
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

export interface SnapshotStage extends HideableStage {
  position(): { x: number; y: number };
  position(pos: { x: number; y: number }): unknown;
  scale(): { x: number; y: number };
  scale(scale: { x: number; y: number }): unknown;
  toDataURL(config: {
    x: number; y: number; width: number; height: number;
    pixelRatio?: number; mimeType?: string; quality?: number;
  }): string;
}

/** Snapshot a canvas-coordinate region of the stage as a data URL, with note
 *  badges hidden. toDataURL's x/y are in *screen* space (after the stage's
 *  pan/zoom), so the view is reset to identity for the capture and restored
 *  after — otherwise a panned or zoomed canvas exports the wrong region. */
export function snapshotStage(
  stage: SnapshotStage,
  bounds: { x: number; y: number; width: number; height: number },
  opts: { pixelRatio?: number; mimeType?: string; quality?: number } = {},
): string {
  return withIdentityView(stage, () =>
    withNodesHidden(stage, NOTE_BADGE_SELECTOR, () => stage.toDataURL({ ...bounds, ...opts })),
  );
}

/** Run fn with the stage at 100% zoom and no pan (so canvas coordinates ==
 *  screen coordinates), restoring the user's view afterwards. */
export function withIdentityView<T>(
  stage: Pick<SnapshotStage, 'position' | 'scale' | 'draw'>,
  fn: () => T,
): T {
  const pos = stage.position();
  const scale = stage.scale();
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  try {
    return fn();
  } finally {
    stage.position(pos);
    stage.scale(scale);
    stage.draw();
  }
}
