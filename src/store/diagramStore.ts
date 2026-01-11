import { create } from 'zustand';
import { temporal } from 'zundo';
import type { DiagramElement, Connection, Position, Size, ContributorType, ImageSettings } from '../types';
import { isArgumentElement, isInfoBoxElement } from '../types';
import { calculateElementSize } from '../utils/textMeasure';

interface LegendConfig {
  visible: boolean;
  position: Position;
}

// Helper to calculate auto-size for an element
function getAutoSize(element: DiagramElement): Size {
  const label = isArgumentElement(element) || isInfoBoxElement(element)
    ? element.label
    : element.supportType;

  const hasAttribution = !!(element.attribution?.speaker || element.attribution?.timestamp);
  const hasImage = isArgumentElement(element) && !!element.image;
  const imageScale = hasImage && element.imageSettings?.scale ? element.imageSettings.scale : 1;
  const isImplicit = isArgumentElement(element) && element.contributor === 'implicit';

  const calculated = calculateElementSize({
    label: label || '',
    content: element.content || '',
    hasAttribution,
    hasImage,
    imageScale,
    isImplicit,
    currentWidth: element.size.width,
  });

  // Force height to be at least the calculated height
  const newHeight = Math.max(element.size.height, calculated.height);

  return {
    width: element.size.width,
    height: newHeight,
  };
}

interface DiagramState {
  // Diagram metadata
  diagramName: string;

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
  setElementImageSettings: (id: string, settings: Partial<ImageSettings>) => void;
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

  // Actions - Metadata
  setDiagramName: (name: string) => void;

  // Actions - File operations
  loadDiagram: (elements: DiagramElement[], connections: Connection[], name?: string) => void;
  clearDiagram: () => void;
}

export const useDiagramStore = create<DiagramState>()(
  temporal(
    (set, get) => ({
      diagramName: 'Untitled Diagram',
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
        set((state) => {
          // Auto-size the new element based on its content
          const autoSize = getAutoSize(element);
          const sizedElement = { ...element, size: autoSize };
          return { elements: [...state.elements, sizedElement] };
        }),

      updateElement: (id, updates) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;

            // Apply updates first
            const updated = { ...el, ...updates } as DiagramElement;

            // Check if content-affecting fields changed
            const contentChanged = 'content' in updates ||
              'label' in updates ||
              'attribution' in updates;

            // If content changed, auto-expand to fit
            if (contentChanged) {
              const autoSize = getAutoSize(updated);
              return { ...updated, size: autoSize };
            }

            return updated;
          }),
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
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            const updated = { ...el, image: imageData } as typeof el;
            // Auto-resize when image is added/removed
            const autoSize = getAutoSize(updated as DiagramElement);
            return { ...updated, size: autoSize };
          }),
        })),

      setElementImageSettings: (id, settings) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            const updated = {
              ...el,
              imageSettings: {
                ...el.imageSettings,
                ...settings,
              },
            } as typeof el;
            // Auto-resize when scale changes
            if ('scale' in settings) {
              const autoSize = getAutoSize(updated as DiagramElement);
              return { ...updated, size: autoSize };
            }
            return updated;
          }),
        })),

      duplicateElements: (ids) => {
        const state = get();
        const duplicates: DiagramElement[] = [];
        ids.forEach((id) => {
          const original = state.elements.find((el) => el.id === id);
          if (original) {
            const duplicate = {
              ...original,
              id: `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              position: {
                x: original.position.x + 20,
                y: original.position.y + 20,
              },
            } as DiagramElement;
            duplicates.push(duplicate);
          }
        });
        set({
          elements: [...state.elements, ...duplicates],
          selectedIds: duplicates.map((d) => d.id),
        });
      },

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
              ? { ...el, contributor } as typeof el
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

      setDiagramName: (name) => set({ diagramName: name }),

      loadDiagram: (elements, connections, name) => {
        // Auto-size all elements on load to ensure content fits
        const sizedElements = elements.map((el) => {
          const autoSize = getAutoSize(el);
          return { ...el, size: autoSize };
        });
        set({
          elements: sizedElements,
          connections,
          selectedIds: [],
          diagramName: name || 'Untitled Diagram',
        });
      },

      clearDiagram: () =>
        set({
          diagramName: 'Untitled Diagram',
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
