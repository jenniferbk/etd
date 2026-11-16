// Row → canvas: select an element and bring it to the middle of the canvas.
import { useDiagramStore } from '../store';
import { centerOn } from '../live/viewport';

/** Select the element, then (once the canvas has laid out and measured
 *  itself) pan so the element sits in the middle of the canvas. */
export function focusElement(elementId: string): void {
  useDiagramStore.getState().setSelectedIds([elementId]);
  // Two frames: one for React to show the canvas, one for its size to land in the store.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const { elements, zoom, viewportSize, setPan } = useDiagramStore.getState();
      const el = elements.find((e) => e.id === elementId);
      if (!el) return;
      const { panX, panY } = centerOn(
        { x: el.position.x + el.size.width / 2, y: el.position.y + el.size.height / 2 },
        zoom,
        viewportSize,
      );
      setPan(panX, panY);
    }),
  );
}
