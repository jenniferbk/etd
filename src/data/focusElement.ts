// Row → canvas: select an element and bring it to the middle of the canvas.
import { useDiagramStore } from '../store';
import { centerOn } from '../live/viewport';

/** Select the element, then (once the canvas has laid out and measured
 *  itself) pan so the element sits in the middle of the canvas. */
export function focusElement(elementId: string): void {
  useDiagramStore.getState().setSelectedIds([elementId]);
  const center = () => {
    const { elements, zoom, viewportSize, setPan } = useDiagramStore.getState();
    const el = elements.find((e) => e.id === elementId);
    if (!el) return;
    const { panX, panY } = centerOn(
      { x: el.position.x + el.size.width / 2, y: el.position.y + el.size.height / 2 },
      zoom,
      viewportSize,
    );
    setPan(panX, panY);
  };
  // Center once the canvas is showing, then once more a frame later: the
  // Properties panel opening for the new selection shortens the canvas.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      center();
      requestAnimationFrame(center);
    }),
  );
}
