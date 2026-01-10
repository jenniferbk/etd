import { create } from 'zustand';
import { temporal } from 'zundo';
import type { DiagramElement, Connection, Position, Size, ContributorType } from '../types';

interface LegendConfig {
  visible: boolean;
  position: Position;
}

interface DiagramState {
  // Elements and connections
  elements: DiagramElement[];
  connections: Connection[];

  // Canvas state
  zoom: number;
  panX: number;
  panY: number;

  // Selection
  selectedIds: string[];

  // Legend
  legendConfig: LegendConfig;

  // Actions - Elements
  addElement: (element: DiagramElement) => void;
  updateElement: (id: string, updates: Partial<DiagramElement>) => void;
  removeElement: (id: string) => void;
  moveElement: (id: string, position: Position) => void;
  resizeElement: (id: string, size: Size) => void;
  setElementImage: (id: string, imageData: string | null) => void;
  duplicateElements: (ids: string[]) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  changeContributor: (id: string, contributor: ContributorType) => void;

  // Actions - Connections
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;

  // Actions - Selection
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Actions - Canvas
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  fitToView: () => void;

  // Actions - Legend
  toggleLegend: () => void;
  moveLegend: (position: Position) => void;

  // Actions - File operations
  loadDiagram: (elements: DiagramElement[], connections: Connection[]) => void;
  clearDiagram: () => void;
}

export const useDiagramStore = create<DiagramState>()(
  temporal(
    (set, get) => ({
      elements: [],
      connections: [],
      zoom: 1,
      panX: 0,
      panY: 0,
      selectedIds: [],
      legendConfig: {
        visible: false,
        position: { x: 50, y: 50 },
      },

      addElement: (element) =>
        set((state) => ({ elements: [...state.elements, element] })),

      updateElement: (id, updates) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? { ...el, ...updates } : el
          ),
        })),

      removeElement: (id) =>
        set((state) => ({
          elements: state.elements.filter((el) => el.id !== id),
          connections: state.connections.filter(
            (conn) => conn.from !== id && conn.to !== id
          ),
          selectedIds: state.selectedIds.filter((sid) => sid !== id),
        })),

      moveElement: (id, position) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? { ...el, position } : el
          ),
        })),

      resizeElement: (id, size) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? { ...el, size } : el
          ),
        })),

      setElementImage: (id, imageData) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? { ...el, image: imageData } : el
          ),
        })),

      duplicateElements: (ids) =>
        set((state) => {
          const duplicates: DiagramElement[] = [];
          ids.forEach((id) => {
            const original = state.elements.find((el) => el.id === id);
            if (original) {
              const duplicate: DiagramElement = {
                ...original,
                id: `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                position: {
                  x: original.position.x + 20,
                  y: original.position.y + 20,
                },
              };
              duplicates.push(duplicate);
            }
          });
          return {
            elements: [...state.elements, ...duplicates],
            selectedIds: duplicates.map((d) => d.id),
          };
        }),

      bringToFront: (id) =>
        set((state) => {
          const element = state.elements.find((el) => el.id === id);
          if (!element) return state;
          return {
            elements: [
              ...state.elements.filter((el) => el.id !== id),
              element,
            ],
          };
        }),

      sendToBack: (id) =>
        set((state) => {
          const element = state.elements.find((el) => el.id === id);
          if (!element) return state;
          return {
            elements: [
              element,
              ...state.elements.filter((el) => el.id !== id),
            ],
          };
        }),

      changeContributor: (id, contributor) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id && el.type === 'argument'
              ? { ...el, contributor }
              : el
          ),
        })),

      addConnection: (connection) =>
        set((state) => ({ connections: [...state.connections, connection] })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((conn) => conn.id !== id),
        })),

      setSelectedIds: (ids) => set({ selectedIds: ids }),

      clearSelection: () => set({ selectedIds: [] }),

      selectAll: () =>
        set((state) => ({
          selectedIds: state.elements.map((el) => el.id),
        })),

      setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),

      setPan: (panX, panY) => set({ panX, panY }),

      fitToView: () => {
        const state = get();
        if (state.elements.length === 0) {
          set({ zoom: 1, panX: 0, panY: 0 });
          return;
        }

        // Calculate bounding box of all elements
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        state.elements.forEach((el) => {
          minX = Math.min(minX, el.position.x);
          minY = Math.min(minY, el.position.y);
          maxX = Math.max(maxX, el.position.x + el.size.width);
          maxY = Math.max(maxY, el.position.y + el.size.height);
        });

        const contentWidth = maxX - minX + 100; // Add padding
        const contentHeight = maxY - minY + 100;

        // Assume canvas size of 800x600 (will be adjusted by actual canvas)
        const canvasWidth = 800;
        const canvasHeight = 600;

        const scaleX = canvasWidth / contentWidth;
        const scaleY = canvasHeight / contentHeight;
        const newZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        set({
          zoom: Math.max(0.25, newZoom),
          panX: canvasWidth / 2 - centerX * newZoom,
          panY: canvasHeight / 2 - centerY * newZoom,
        });
      },

      toggleLegend: () =>
        set((state) => ({
          legendConfig: {
            ...state.legendConfig,
            visible: !state.legendConfig.visible,
          },
        })),

      moveLegend: (position) =>
        set((state) => ({
          legendConfig: {
            ...state.legendConfig,
            position,
          },
        })),

      loadDiagram: (elements, connections) =>
        set({ elements, connections, selectedIds: [] }),

      clearDiagram: () =>
        set({
          elements: [],
          connections: [],
          selectedIds: [],
          zoom: 1,
          panX: 0,
          panY: 0,
          legendConfig: { visible: false, position: { x: 50, y: 50 } },
        }),
    }),
    {
      // Only track elements and connections for undo/redo
      partialize: (state) => ({
        elements: state.elements,
        connections: state.connections,
      }),
      limit: 50,
    }
  )
);

// Export temporal store for undo/redo access
export const useTemporalStore = () => useDiagramStore.temporal.getState();
