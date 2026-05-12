import { useRef, useState } from 'react';
import Konva from 'konva';
import {
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  LayoutGrid,
  FileInput,
  PanelRight,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Maximize2,
  ImagePlus,
} from 'lucide-react';
import { useDiagramStore, useTemporalStore } from '../../store';
import { theme } from '../../utils/theme';
import { SAVE_SCHEMA_VERSION } from '../../utils/schema';
import { AboutModal } from './AboutModal';
import { exportToSvg, downloadSvg } from '../../utils/svgExport';
import { exportToPdf } from '../../utils/pdfExport';
import {
  downloadDiagramx,
  exportToDiagramx,
  hasEmbeddedImages,
} from '../../utils/diagramxExport';
import { importDrawingFile } from '../../utils/drawingImporter';
import { IconButton } from './IconButton';
import { ExportMenu } from './ExportMenu';
import { MoreMenu } from './MoreMenu';
import { ToolbarGroup } from './ToolbarGroup';
import { computeExportBounds } from '../../utils/exportBounds';
import { ImageImportModal } from './ImageImportModal';

// Helper to create a safe filename from diagram name
function toFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'diagram';
}

interface ToolbarProps {
  onLoadTranscript: () => void;
  transcriptPanelOpen: boolean;
  onToggleTranscriptPanel: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({ onLoadTranscript, transcriptPanelOpen, onToggleTranscriptPanel, onOpenSettings }: ToolbarProps) {
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

  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;

  // Save diagram as JSON
  const handleSave = () => {
    const data = {
      version: SAVE_SCHEMA_VERSION,
      name: diagramName,
      elements,
      connections,
      styleConfig,
      transcript,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toFilename(diagramName)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          } else {
            alert('Invalid diagram file format');
          }
        } catch {
          alert('Failed to parse diagram file');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('Failed to load file:', err);
      alert(err instanceof Error ? err.message : 'Failed to load file');
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  // Export diagram as PNG
  const handleExportPNG = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    const stages = Konva.stages;
    if (stages.length === 0) {
      alert('No canvas found to export');
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
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${toFilename(diagramName)}.png`;
    a.click();
  };

  // Export diagram as SVG
  const handleExportSVG = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (elements.length === 0) {
      alert('No elements to export');
      return;
    }
    const svgContent = exportToSvg(elements, connections, styleConfig);
    downloadSvg(svgContent, `${toFilename(diagramName)}.svg`);
  };

  // Export diagram as DiagramMix .diagramx (Level A MVP)
  const handleExportDiagramx = async () => {
    if (elements.length === 0) {
      alert('No elements to export');
      return;
    }
    try {
      const json = exportToDiagramx(elements, connections, diagramName, styleConfig);
      downloadDiagramx(json, `${toFilename(diagramName)}.diagramx`);
      if (hasEmbeddedImages(elements)) {
        alert('Embedded images were dropped — DiagramMix does not support inline images.');
      }
    } catch (err) {
      console.error('.diagramx export failed:', err);
      alert('Failed to export .diagramx');
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
      alert('Failed to export PDF');
    }
  };

  // Clear diagram
  const handleClear = () => {
    if (elements.length === 0 && connections.length === 0) return;
    if (confirm('Are you sure you want to clear the diagram? This cannot be undone.')) {
      clearDiagram();
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
            className="text-base font-semibold tracking-tight bg-transparent border-none outline-none min-w-[200px]"
            style={{ color: theme.sidebar.text }}
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

          {/* View — Legend / Load transcript / Transcript panel */}
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
            <IconButton
              onClick={onToggleTranscriptPanel}
              icon={PanelRight}
              tooltip="Toggle transcript panel"
              isActive={transcriptPanelOpen}
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
        </div>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      <ImageImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
    </>
  );
}
