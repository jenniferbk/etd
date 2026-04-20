import { useRef, useState } from 'react';
import Konva from 'konva';
import {
  Save,
  FolderOpen,
  Download,
  Image,
  FileText,
  Trash2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Info,
  LayoutGrid,
  Loader2,
  FileInput,
  PanelRight,
  Crosshair,
  Maximize2,
} from 'lucide-react';
import { useDiagramStore, useTemporalStore } from '../../store';
import { theme } from '../../utils/theme';
import { AboutModal } from './AboutModal';
import { exportToSvg, downloadSvg } from '../../utils/svgExport';
import { exportToPdf } from '../../utils/pdfExport';
import { Tooltip } from '../ui/Tooltip';
import { importDrawingFile } from '../../utils/drawingImporter';

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
}

export function Toolbar({ onLoadTranscript, transcriptPanelOpen, onToggleTranscriptPanel }: ToolbarProps) {
  const {
    zoom, setZoom, setPan, fitToView, elements, connections, loadDiagram, clearDiagram,
    toggleLegend, legendConfig, diagramName, setDiagramName,
    transcript,
  } = useDiagramStore();

  // Reset view: zoom to 100% and pan back to origin — rescues the user when they've
  // panned/zoomed off the canvas and lost the diagram.
  const handleResetView = () => {
    setZoom(1);
    setPan(0, 0);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'svg' | 'pdf' | null>(null);
  const temporal = useTemporalStore();

  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;

  // Save diagram as JSON
  const handleSave = () => {
    const data = {
      version: '1.1',
      name: diagramName,
      elements,
      connections,
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
        loadDiagram(result.elements, result.connections, result.name);
        e.target.value = '';
        return;
      }

      // Handle .json files
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.elements && data.connections) {
            loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null);
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
    setExporting('png');
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI to update
      const stages = Konva.stages;
      if (stages.length === 0) {
        alert('No canvas found to export');
        return;
      }

      const stage = stages[0];
      const dataURL = stage.toDataURL({
        pixelRatio: 2,
        mimeType: 'image/png',
      });

      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `${toFilename(diagramName)}.png`;
      a.click();
    } finally {
      setExporting(null);
    }
  };

  // Export diagram as SVG
  const handleExportSVG = async () => {
    setExporting('svg');
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (elements.length === 0) {
        alert('No elements to export');
        return;
      }
      const svgContent = exportToSvg(elements, connections);
      downloadSvg(svgContent, `${toFilename(diagramName)}.svg`);
    } finally {
      setExporting(null);
    }
  };

  // Export diagram as PDF
  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      await exportToPdf({
        filename: `${toFilename(diagramName)}.pdf`,
        orientation: 'landscape',
        quality: 2,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF');
    } finally {
      setExporting(null);
    }
  };

  // Clear diagram
  const handleClear = () => {
    if (elements.length === 0 && connections.length === 0) return;
    if (confirm('Are you sure you want to clear the diagram? This cannot be undone.')) {
      clearDiagram();
    }
  };

  const iconButtonClass = `
    w-9 h-9 flex items-center justify-center rounded-lg
    transition-all duration-150 ease-out
    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
  `;

  const dividerClass = 'w-px h-6 mx-2';

  const IconButton = ({
    onClick,
    disabled,
    icon: Icon,
    tooltip,
    shortcut,
    variant,
    isActive,
    isLoading,
  }: {
    onClick: () => void;
    disabled?: boolean;
    icon: typeof Save;
    tooltip: string;
    shortcut?: string;
    variant?: 'danger';
    isActive?: boolean;
    isLoading?: boolean;
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <Tooltip content={tooltip} shortcut={shortcut}>
        <button
          onClick={onClick}
          disabled={disabled || isLoading}
          className={`${iconButtonClass} ${isActive ? '' : ''}`}
          style={{
            color: variant === 'danger' && isHovered
              ? theme.colors.error
              : theme.sidebar.text,
            backgroundColor: isActive
              ? theme.sidebar.surfaceHover
              : isHovered
                ? variant === 'danger'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : theme.sidebar.surfaceHover
                : 'transparent',
            transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" style={{ color: theme.sidebar.accent }} />
          ) : (
            <Icon size={18} />
          )}
        </button>
      </Tooltip>
    );
  };

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
            className="text-base font-semibold tracking-tight bg-transparent border-none outline-none focus:ring-0 min-w-[200px]"
            style={{ color: theme.sidebar.text }}
            placeholder="Untitled Diagram"
          />
        </div>

        <div className="flex items-center">
          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
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
          </div>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* File operations */}
          <div className="flex items-center gap-0.5">
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.drawing"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Export */}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={handleExportPNG}
              icon={Image}
              tooltip="Export as PNG"
              isLoading={exporting === 'png'}
            />
            <IconButton
              onClick={handleExportSVG}
              icon={Download}
              tooltip="Export as SVG"
              isLoading={exporting === 'svg'}
            />
            <IconButton
              onClick={handleExportPDF}
              icon={FileText}
              tooltip="Export as PDF"
              isLoading={exporting === 'pdf'}
            />
          </div>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* View options */}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={toggleLegend}
              icon={LayoutGrid}
              tooltip="Toggle Legend"
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
          </div>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
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
              onClick={handleResetView}
              icon={Crosshair}
              tooltip="Reset view (100%, centered)"
            />
            <IconButton
              onClick={fitToView}
              icon={Maximize2}
              tooltip="Fit to window"
              shortcut="Ctrl+0"
            />
          </div>

          <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

          {/* Clear and About */}
          <div className="flex items-center gap-0.5">
            <IconButton
              onClick={handleClear}
              icon={Trash2}
              tooltip="Clear diagram"
              variant="danger"
            />
            <IconButton
              onClick={() => setShowAbout(true)}
              icon={Info}
              tooltip="About & Shortcuts"
            />
          </div>
        </div>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}
