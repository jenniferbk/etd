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
} from 'lucide-react';
import { useDiagramStore, useTemporalStore } from '../../store';
import { theme } from '../../utils/theme';
import { AboutModal } from './AboutModal';
import { exportToSvg, downloadSvg } from '../../utils/svgExport';
import { exportToPdf } from '../../utils/pdfExport';

export function Toolbar() {
  const { zoom, setZoom, elements, connections, loadDiagram, clearDiagram, toggleLegend, legendConfig } = useDiagramStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAbout, setShowAbout] = useState(false);
  const temporal = useTemporalStore();

  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;

  // Save diagram as JSON
  const handleSave = () => {
    const data = {
      version: '1.0',
      elements,
      connections,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toulmin-diagram-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load diagram from JSON file
  const handleLoad = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.elements && data.connections) {
          loadDiagram(data.elements, data.connections);
        } else {
          alert('Invalid diagram file format');
        }
      } catch {
        alert('Failed to parse diagram file');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  // Export diagram as PNG
  const handleExportPNG = () => {
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
    a.download = `toulmin-diagram-${Date.now()}.png`;
    a.click();
  };

  // Export diagram as SVG
  const handleExportSVG = () => {
    if (elements.length === 0) {
      alert('No elements to export');
      return;
    }
    const svgContent = exportToSvg(elements, connections);
    downloadSvg(svgContent, `toulmin-diagram-${Date.now()}.svg`);
  };

  // Export diagram as PDF
  const handleExportPDF = async () => {
    try {
      await exportToPdf({
        filename: `toulmin-diagram-${Date.now()}.pdf`,
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

  const buttonClass = `
    w-9 h-9 flex items-center justify-center rounded-lg
    transition-all duration-150 ease-in-out
    hover:bg-[${theme.sidebar.hover}]
    text-[${theme.sidebar.text}]
    disabled:opacity-40 disabled:cursor-not-allowed
  `;

  const iconButtonClass = `
    p-2 rounded-lg transition-all duration-150
    hover:bg-[#45475a] text-[#cdd6f4]
    disabled:opacity-40 disabled:cursor-not-allowed
  `;

  const dividerClass = 'w-px h-6 bg-[#45475a] mx-2';

  return (
    <>
      <div
        className="h-14 px-4 flex items-center justify-between border-b"
        style={{
          backgroundColor: theme.toolbar.bg,
          borderColor: theme.toolbar.border,
        }}
      >
        <div className="flex items-center gap-3">
          <h1
            className="text-base font-semibold tracking-tight"
            style={{ color: theme.sidebar.text }}
          >
            Extended Toulmin Diagram Editor
          </h1>
        </div>

        <div className="flex items-center">
          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => temporal.undo()}
              disabled={!canUndo}
              className={iconButtonClass}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={18} />
            </button>
            <button
              onClick={() => temporal.redo()}
              disabled={!canRedo}
              className={iconButtonClass}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 size={18} />
            </button>
          </div>

          <div className={dividerClass} />

          {/* File operations */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className={iconButtonClass}
              title="Save diagram (Ctrl+S)"
            >
              <Save size={18} />
            </button>
            <button
              onClick={handleLoad}
              className={iconButtonClass}
              title="Load diagram (Ctrl+O)"
            >
              <FolderOpen size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className={dividerClass} />

          {/* Export */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportPNG}
              className={iconButtonClass}
              title="Export as PNG"
            >
              <Image size={18} />
            </button>
            <button
              onClick={handleExportSVG}
              className={iconButtonClass}
              title="Export as SVG"
            >
              <Download size={18} />
            </button>
            <button
              onClick={handleExportPDF}
              className={iconButtonClass}
              title="Export as PDF"
            >
              <FileText size={18} />
            </button>
          </div>

          <div className={dividerClass} />

          {/* View options */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleLegend}
              className={`${iconButtonClass} ${legendConfig.visible ? 'bg-[#45475a]' : ''}`}
              title="Toggle Legend"
            >
              <LayoutGrid size={18} />
            </button>
          </div>

          <div className={dividerClass} />

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(zoom / 1.2)}
              className={iconButtonClass}
              title="Zoom out (Ctrl+-)"
            >
              <ZoomOut size={18} />
            </button>
            <span
              className="text-sm w-14 text-center font-medium"
              style={{ color: theme.sidebar.muted }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(zoom * 1.2)}
              className={iconButtonClass}
              title="Zoom in (Ctrl++)"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          <div className={dividerClass} />

          {/* Clear and About */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              className={`${iconButtonClass} hover:bg-red-500/20 hover:text-red-400`}
              title="Clear diagram"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={() => setShowAbout(true)}
              className={iconButtonClass}
              title="About"
            >
              <Info size={18} />
            </button>
          </div>
        </div>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  );
}
