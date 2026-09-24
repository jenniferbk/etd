// Small JPEG of the whole diagram for the workspace card, sent with every
// library save. Best-effort: any failure returns undefined and the save
// goes ahead without a thumbnail.

import Konva from 'konva';
import { useDiagramStore } from '../store';
import { computeExportBounds } from './exportBounds';
import { NOTE_BADGE_SELECTOR, withIdentityView, withNodesHidden } from './exportHideNodes';

// Cards show ~300px wide; 2× that stays sharp on retina screens.
const MAX_WIDTH = 640;
const MAX_HEIGHT = 400;

export function captureThumbnail(): string | undefined {
  try {
    const stage = Konva.stages[0];
    const { elements, connections } = useDiagramStore.getState();
    if (!stage || elements.length === 0) return undefined;

    const bounds = computeExportBounds(elements, connections);
    const ratio = Math.min(MAX_WIDTH / bounds.width, MAX_HEIGHT / bounds.height, 1);

    const rendered = withIdentityView(stage, () =>
      // The selection Transformer and note badges are editing UI, not diagram.
      withNodesHidden(stage, `Transformer, ${NOTE_BADGE_SELECTOR}`, () =>
        stage.toCanvas({ ...bounds, pixelRatio: ratio }),
      ),
    );

    // JPEG has no alpha: paint white first or empty canvas turns black.
    const out = document.createElement('canvas');
    out.width = rendered.width;
    out.height = rendered.height;
    const ctx = out.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(rendered, 0, 0);
    return out.toDataURL('image/jpeg', 0.82);
  } catch {
    return undefined;
  }
}
