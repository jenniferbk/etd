import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  DiagramElement, Connection, Position, Size, ContributorType,
  ImageSettings, SupportType, SupportSubtype, ArgumentType,
  SupportContributor, ArgumentElement, SupportElement,
  Transcript, TranscriptLine, EdgeAnchor,
} from '../types';
import type { StyleConfig } from '../types/styleConfig';
import { createCurrentDefaults, createV1_2_MigrationDefaults } from '../utils/styleConfigDefaults';
import { isArgumentElement, isInfoBoxElement, isSupportElement, isTeacherSupportElement } from '../types';
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

  // Transcript
  transcript: Transcript | null;

  // Style configuration (per-diagram)
  styleConfig: StyleConfig;

  // Actions - Elements
  addElement: (element: DiagramElement) => void;
  updateElement: (id: string, updates: Partial<DiagramElement>) => void;
  removeElement: (id: string) => void;
  moveElement: (id: string, position: Position) => void;
  moveCluster: (startPositions: Map<string, Position>, delta: Position) => void;
  moveAndLink: (id: string, position: Position, associatedArgumentId: string | null) => void;
  resizeElement: (id: string, size: Size) => void;
  setElementImage: (id: string, imageData: string | null) => void;
  setElementImageSettings: (id: string, settings: Partial<ImageSettings>) => void;
  duplicateElements: (ids: string[]) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  changeContributor: (id: string, contributor: ContributorType) => void;
  changeSupportType: (id: string, supportType: SupportType, subtype?: SupportSubtype) => void;
  convertToArgument: (id: string, argumentType: ArgumentType) => void;
  convertToSupport: (id: string, supportType: SupportType, subtype?: SupportSubtype) => void;

  // Actions - Connections
  addConnection: (connection: Connection) => void;
  removeConnection: (id: string) => void;
  updateConnectionWaypoints: (id: string, waypoints: Position[] | undefined) => void;
  updateConnectionAnchor: (id: string, end: 'from' | 'to', anchor: EdgeAnchor | undefined) => void;

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

  // Actions - Transcript
  setTranscript: (transcript: Transcript | null) => void;
  updateTranscriptLine: (lineIndex: number, patch: Partial<TranscriptLine>) => void;

  // Actions - Style config
  replaceStyleConfig: (config: StyleConfig) => void;

  // Actions - File operations
  loadDiagram: (
    elements: DiagramElement[],
    connections: Connection[],
    name?: string,
    transcript?: Transcript | null,
    styleConfig?: StyleConfig,
  ) => void;
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
      transcript: null,
      styleConfig: createCurrentDefaults(),

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
        set((state) => {
          const removed = state.elements.find((el) => el.id === id);
          const isArg = removed?.type === 'argument';
          return {
            elements: state.elements
              .filter((el) => el.id !== id)
              .map((el) => {
                if (!isArg) return el;
                if (el.type !== 'support') return el;
                const supEl = el as SupportElement;
                if (supEl.associatedWith !== id) return el;
                const { associatedWith: _omit, ...rest } = supEl;
                void _omit;
                return rest as SupportElement;
              }),
            connections: state.connections.filter(
              (conn) => conn.from !== id && conn.to !== id
            ),
            selectedIds: state.selectedIds.filter((sid) => sid !== id),
          };
        }),

      moveElement: (id, position) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? { ...el, position } : el
          ),
        })),

      moveCluster: (startPositions, delta) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            const start = startPositions.get(el.id);
            if (!start) return el;
            return { ...el, position: { x: start.x + delta.x, y: start.y + delta.y } };
          }),
        })),

      moveAndLink: (id, position, associatedArgumentId) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            if (el.type !== 'support') return el;  // no-op for non-supports
            const supEl = el as SupportElement;
            if (associatedArgumentId === null) {
              const { associatedWith: _omit, ...rest } = supEl;
              void _omit;
              return { ...rest, position };
            }
            return { ...supEl, position, associatedWith: associatedArgumentId };
          }),
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

      changeSupportType: (id, supportType, subtype) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            if (!isSupportElement(el) && !isTeacherSupportElement(el)) return el;

            // Clear subtype if not 'other', otherwise use provided subtype
            const newSubtype = supportType === 'other' ? (subtype || 'displays') : undefined;

            return {
              ...el,
              supportType,
              subtype: newSubtype,
            } as typeof el;
          }),
        })),

      convertToArgument: (id, argumentType) =>
        set((state) => {
          // Count existing elements of this argument type to generate label
          const existingCount = state.elements.filter(
            (el) => isArgumentElement(el) && el.argumentType === argumentType
          ).length;
          const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${existingCount + 1}`;

          return {
            elements: state.elements.map((el) => {
              if (el.id !== id) return el;
              if (!isSupportElement(el) && !isTeacherSupportElement(el)) return el;

              // Map support contributor to argument contributor
              const supportContributor = isSupportElement(el) ? el.contributor : 'teacher';
              const contributor: ContributorType = supportContributor === 'teacher' ? 'teacher' : 'student';

              const newElement: ArgumentElement = {
                id: el.id,
                type: 'argument',
                argumentType,
                contributor,
                label,
                position: el.position,
                size: el.size,
                content: el.content,
                attribution: el.attribution,
              };

              return newElement;
            }),
          };
        }),

      convertToSupport: (id, supportType, subtype) =>
        set((state) => ({
          elements: state.elements.map((el) => {
            if (el.id !== id) return el;
            if (!isArgumentElement(el)) return el;

            // Map argument contributor to support contributor
            // teacher, given -> teacher; student, joint, implicit -> student
            const contributor: SupportContributor =
              (el.contributor === 'teacher' || el.contributor === 'given') ? 'teacher' : 'student';

            const newElement: SupportElement = {
              id: el.id,
              type: 'support',
              supportType,
              contributor,
              subtype: supportType === 'other' ? (subtype || 'displays') : undefined,
              position: el.position,
              size: el.size,
              content: el.content,
              attribution: el.attribution,
            };

            return newElement;
          }),
        })),

      addConnection: (connection) =>
        set((state) => ({ connections: [...state.connections, connection] })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((conn) => conn.id !== id),
        })),

      updateConnectionWaypoints: (id, waypoints) =>
        set((state) => ({
          connections: state.connections.map((conn) => {
            if (conn.id !== id) return conn;
            if (waypoints === undefined) {
              // Strip the waypoints key entirely so undo can restore the
              // virtual-Z (no-waypoints) state. Spread + delete on a clone
              // keeps the result `Connection`-typed without an unused-var.
              const next = { ...conn };
              delete next.waypoints;
              return next;
            }
            return { ...conn, waypoints };
          }),
        })),

      updateConnectionAnchor: (id, end, anchor) =>
        set((state) => ({
          connections: state.connections.map((conn) => {
            if (conn.id !== id) return conn;
            const key = end === 'from' ? 'fromAnchor' : 'toAnchor';
            const next = { ...conn };
            if (anchor === undefined) {
              delete next[key];
            } else {
              next[key] = anchor;
            }
            return next;
          }),
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

      setTranscript: (transcript) => set({ transcript }),

      replaceStyleConfig: (config) => set({ styleConfig: config }),

      updateTranscriptLine: (lineIndex, patch) =>
        set((state) => {
          if (!state.transcript) return state;
          return {
            transcript: {
              ...state.transcript,
              lines: state.transcript.lines.map((line) =>
                line.index === lineIndex ? { ...line, ...patch } : line,
              ),
            },
          };
        }),

      setDiagramName: (name) => set({ diagramName: name }),

      loadDiagram: (elements, connections, name, transcript, styleConfig) => {
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
          transcript: transcript ?? null,
          // v1.2 files have no styleConfig — apply the FROZEN migration defaults.
          // v1.3+ files pass their saved config through.
          styleConfig: styleConfig ?? createV1_2_MigrationDefaults(),
        });
      },

      clearDiagram: () =>
        set((state) => ({
          diagramName: 'Untitled Diagram',
          elements: [],
          connections: [],
          selectedIds: [],
          zoom: 1,
          panX: 0,
          panY: 0,
          legendConfig: { visible: false, position: { x: 50, y: 50 } },
          transcript: state.transcript, // preserved intentionally
          styleConfig: createCurrentDefaults(),
        })),
    }),
    {
      // Track elements, connections, and styleConfig for undo/redo
      partialize: (state) => ({
        elements: state.elements,
        connections: state.connections,
        styleConfig: state.styleConfig,
      }),
      limit: 50,
    }
  )
);

// Export temporal store for undo/redo access
export const useTemporalStore = () => useDiagramStore.temporal.getState();
