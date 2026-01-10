import { useState, useCallback } from 'react';
import type { DiagramElement } from '../types';

interface MarqueeState {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface UseMarqueeSelectionResult {
  marqueeState: MarqueeState;
  startMarquee: (x: number, y: number) => void;
  updateMarquee: (x: number, y: number) => void;
  endMarquee: (elements: DiagramElement[], zoom: number, panX: number, panY: number) => string[];
  cancelMarquee: () => void;
}

const initialState: MarqueeState = {
  isSelecting: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

export function useMarqueeSelection(): UseMarqueeSelectionResult {
  const [marqueeState, setMarqueeState] = useState<MarqueeState>(initialState);

  const startMarquee = useCallback((x: number, y: number) => {
    setMarqueeState({
      isSelecting: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, []);

  const updateMarquee = useCallback((x: number, y: number) => {
    setMarqueeState((prev) => ({
      ...prev,
      currentX: x,
      currentY: y,
    }));
  }, []);

  const endMarquee = useCallback(
    (elements: DiagramElement[], zoom: number, panX: number, panY: number): string[] => {
      const { startX, startY, currentX, currentY } = marqueeState;

      // Calculate selection rectangle in canvas coordinates
      const selX1 = (Math.min(startX, currentX) - panX) / zoom;
      const selY1 = (Math.min(startY, currentY) - panY) / zoom;
      const selX2 = (Math.max(startX, currentX) - panX) / zoom;
      const selY2 = (Math.max(startY, currentY) - panY) / zoom;

      // Find elements that intersect with the selection rectangle
      const selectedIds = elements
        .filter((el) => {
          const elX1 = el.position.x;
          const elY1 = el.position.y;
          const elX2 = el.position.x + el.size.width;
          const elY2 = el.position.y + el.size.height;

          // Check for intersection
          return !(elX2 < selX1 || elX1 > selX2 || elY2 < selY1 || elY1 > selY2);
        })
        .map((el) => el.id);

      // Reset marquee state
      setMarqueeState(initialState);

      return selectedIds;
    },
    [marqueeState]
  );

  const cancelMarquee = useCallback(() => {
    setMarqueeState(initialState);
  }, []);

  return {
    marqueeState,
    startMarquee,
    updateMarquee,
    endMarquee,
    cancelMarquee,
  };
}
