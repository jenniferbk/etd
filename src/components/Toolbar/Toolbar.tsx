import { useRef, useState } from 'react';
import Konva from 'konva';
import {
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  LayoutGrid,
  FileInput,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Maximize2,
  ImagePlus,
} from 'lucide-react';
import { useDiagramStore, useTemporalStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { useCloudStore } from '../../store/cloudStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { saveDiagramJson, toFilename } from '../../utils/saveDiagram';
import { saveFile, dataUrlToBlob } from '../../utils/saveFile';
import { AboutModal } from './AboutModal';
import { exportToSvg, downloadSvg } from '../../utils/svgExport';
import { exportToPdf } from '../../utils/pdfExport';
import {
  downloadDiagramx,
  exportToDiagramx,
  hasEmbeddedImages,
  hasAttachedQualifiers,
} from '../../utils/diagramxExport';
import { importDrawingFile } from '../../utils/drawingImporter';
import { IconButton } from './IconButton';
import { ExportMenu } from './ExportMenu';
import { MoreMenu } from './MoreMenu';
import { ToolbarGroup } from './ToolbarGroup';
import { computeExportBounds } from '../../utils/exportBounds';
import { ImageImportModal } from './ImageImportModal';
import { CloudMenu } from '../Cloud';

// Helper to create a safe filename from diagram name

interface ToolbarProps {
  onLoadTranscript: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({ onLoadTranscript, onOpenSettings }: ToolbarProps) {
  const {
    zoom, setZoom, setPan, fitToView, elements, connections, loadDiagram, clearDiagram,
    toggleLegend, legendConfig, diagramName, setDiagramName,
    transcript, styleConfig,
  } = useDiagramStore();

  // Reset view: zoom to 100% and pan back to origin — rescues the user when they've
  // panned/zoomed off the canvas and lost the diagram.
  const handleResetView = () => {
    setZoom(1);
    setPan(0, 0);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const temporal = useTemporalStore();
  const addToast = useToastStore((s) => s.addToast);

  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;

  // Save diagram as JSON
  const handleSave = () => {
    void saveDiagramJson({ diagramName, elements, connections, styleConfig, transcript });
  };

  // Load diagram from JSON file
  const handleLoad = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Handle .drawing files (DiagramMix binary plist)
      if (file.name.endsWith('.drawing')) {
        const result = await importDrawingFile(file);
        loadDiagram(result.elements, result.connections, result.name, null);
        useCloudStore.getState().clearCloudTarget();
        e.target.value = '';
        return;
      }

      // Handle .json files
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.elements && data.connections) {
            loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig);
            useCloudStore.getState().clearCloudTarget();
          } else {
            addToast('error', 'Invalid diagram file format');
          }
        } catch {
          addToast('error', 'Failed to parse diagram file');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('Failed to load file:', err);
      addToast('error', err instanceof Error ? err.message : 'Failed to load file');
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  // Export diagram as PNG
  const handleExportPNG = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    const stages = Konva.stages;
    if (stages.length === 0) {
      addToast('error', 'No canvas found to export');
      return;
    }
    const stage = stages[0];
    const bounds = computeExportBounds(elements, connections);
    const dataURL = stage.toDataURL({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio: 2,
      mimeType: 'image/png',
    });
    await saveFile({
      data: dataUrlToBlob(dataURL),
      suggestedName: `${toFilename(diagramName)}.png`,
      mimeType: 'image/png',
      extension: '.png',
      description: 'PNG image',
    });
  };

  // Export diagram as SVG
  const handleExportSVG = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (elements.length === 0) {
      addToast('info', 'No elements to export yet.');
      return;
    }
    const svgContent = exportToSvg(elements, connections, styleConfig);
    await downloadSvg(svgContent, `${toFilename(diagramName)}.svg`);
  };

  // Export diagram as DiagramMix .diagramx (Level A MVP)
  const handleExportDiagramx = async () => {
    if (elements.length === 0) {
      addToast('info', 'No elements to export yet.');
      return;
    }
    try {
      const json = exportToDiagramx(elements, connections, diagramName, styleConfig);
      await downloadDiagramx(json, `${toFilename(diagramName)}.diagramx`);
      if (hasEmbeddedImages(elements)) {
        addToast('warning', 'Embedded images were dropped — DiagramMix does not support inline images.');
      }
      if (hasAttachedQualifiers(elements)) {
        addToast('warning', 'Qualifier-on-connection positions were dropped — DiagramMix does not support inline qualifiers.');
      }
    } catch (err) {
      console.error('.diagramx export failed:', err);
      addToast('error', 'Failed to export .diagramx');
    }
  };

  // Export diagram as PDF
  const handleExportPDF = async () => {
    try {
      await exportToPdf(elements, connections, {
        filename: `${toFilename(diagramName)}.pdf`,
        orientation: 'landscape',
        quality: 2,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      addToast('error', 'Failed to export PDF');
    }
  };

  // Clear diagram
  const handleClear = async () => {
    if (elements.length === 0 && connections.length === 0) return;
    const ok = await confirmAsync({
      title: 'Clear diagram?',
      message: 'This will remove every element and connection. This cannot be undone.',
      confirmLabel: 'Clear diagram',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (ok) {
      clearDiagram();
      useCloudStore.getState().clearCloudTarget();
    }
  };

  const dividerClass = 'w-px h-6 mx-2';

  return (
    <>
      <div
        className="h-14 px-5 flex items-center justify-between border-b"
        style={{
          background: theme.toolbar.bgGradient,
          borderColor: theme.toolbar.border,
          boxShadow: theme.toolbar.shadow,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-medium"
            style={{ color: theme.sidebar.textSecondary }}
          >
            ETD
          </span>
          <span style={{ color: theme.sidebar.border }}>|</span>
          <input
            type="text"
            value={diagramName}
            onChange={(e) => setDiagramName(e.target.value)}
            className="text-base font-semibold tracking-tight bg-transparent border-none min-w-[200px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
            style={{ color: theme.sidebar.text, outlineColor: theme.focus.ring }}
            placeholder="Untitled Diagram"
          />
        </div>

        <div className="flex items-center">
          {/* History — Undo / Redo */}
          <ToolbarGroup label="History">
            <IconButton
              onClick={() => temporal.undo()}
              disabled={!canUndo}
              icon={Undo2}
              tooltip="Undo"
              shortcut="Ctrl+Z"
            />
            <IconButton
              onClick={() => temporal.redo()}
              disabled={!canRedo}
              icon={Redo2}
              tooltip="Redo"
              shortcut="Ctrl+Shift+Z"
            />
          </ToolbarGroup>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* File — Save / Open / Import / Export▾ */}
          <ToolbarGroup label="File">
            <IconButton
              onClick={handleSave}
              icon={Save}
              tooltip="Save diagram"
              shortcut="Ctrl+S"
            />
            <IconButton
              onClick={handleLoad}
              icon={FolderOpen}
              tooltip="Load diagram"
              shortcut="Ctrl+O"
            />
            <IconButton
              onClick={() => setImportModalOpen(true)}
              icon={ImagePlus}
              tooltip="Import diagram from image"
            />
            <ExportMenu
              onExportPNG={handleExportPNG}
              onExportSVG={handleExportSVG}
              onExportPDF={handleExportPDF}
              onExportDiagramx={handleExportDiagramx}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.drawing"
              onChange={handleFileChange}
              className="hidden"
            />
          </ToolbarGroup>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* View — Legend / Load transcript. Transcript panel toggle is
              fully covered by the right-edge open strip + the panel header's
              close icon. */}
          <ToolbarGroup label="View">
            <IconButton
              onClick={toggleLegend}
              icon={LayoutGrid}
              tooltip="Toggle legend"
              isActive={legendConfig.visible}
            />
            <IconButton
              onClick={onLoadTranscript}
              icon={FileInput}
              tooltip="Load transcript"
            />
          </ToolbarGroup>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Zoom — Zoom out / % / Zoom in / Fit / Reset (order per spec §5.1) */}
          <ToolbarGroup label="Zoom">
            <IconButton
              onClick={() => setZoom(zoom / 1.2)}
              icon={ZoomOut}
              tooltip="Zoom out"
              shortcut="Ctrl+-"
            />
            <span
              className="text-sm w-14 text-center font-medium tabular-nums"
              style={{ color: theme.sidebar.textSecondary }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <IconButton
              onClick={() => setZoom(zoom * 1.2)}
              icon={ZoomIn}
              tooltip="Zoom in"
              shortcut="Ctrl+="
            />
            <IconButton
              onClick={fitToView}
              icon={Maximize2}
              tooltip="Fit to window"
              shortcut="Ctrl+0"
            />
            <IconButton
              onClick={handleResetView}
              icon={Crosshair}
              tooltip="Reset view (100%, centered)"
            />
          </ToolbarGroup>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Overflow — More menu (Settings / About / Clear) */}
          <MoreMenu
            onOpenSettings={onOpenSettings}
            onOpenAbout={() => setShowAbout(true)}
            onClear={handleClear}
          />

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Cloud — sign in / account menu */}
          <CloudMenu />
        </div>
      </div>

      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      <ImageImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </>
  );
}
