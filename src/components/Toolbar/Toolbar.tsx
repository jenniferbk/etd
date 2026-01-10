import { useRef } from 'react';
import Konva from 'konva';
import { useDiagramStore } from '../../store';

export function Toolbar() {
  const { zoom, setZoom, elements, connections, loadDiagram, clearDiagram } = useDiagramStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Find the Konva stage
    const stages = Konva.stages;
    if (stages.length === 0) {
      alert('No canvas found to export');
      return;
    }

    const stage = stages[0];

    // Get the stage data URL
    const dataURL = stage.toDataURL({
      pixelRatio: 2, // Higher quality
      mimeType: 'image/png',
    });

    // Download the image
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `toulmin-diagram-${Date.now()}.png`;
    a.click();
  };

  // Clear diagram
  const handleClear = () => {
    if (elements.length === 0 && connections.length === 0) return;
    if (confirm('Are you sure you want to clear the diagram? This cannot be undone.')) {
      clearDiagram();
    }
  };

  return (
    <div className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-gray-800">
          Extended Toulmin Diagram Editor
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* File operations */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Save diagram as JSON"
          >
            Save
          </button>
          <button
            onClick={handleLoad}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Load diagram from JSON"
          >
            Load
          </button>
          <button
            onClick={handleExportPNG}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Export diagram as PNG"
          >
            Export PNG
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
            title="Clear diagram"
          >
            Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2 border-l pl-4">
          <button
            onClick={() => setZoom(zoom / 1.2)}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-sm text-gray-600 w-16 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(zoom * 1.2)}
            className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            title="Reset zoom"
          >
            100%
          </button>
        </div>
      </div>
    </div>
  );
}
