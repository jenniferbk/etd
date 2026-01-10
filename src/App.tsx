import { useState, useEffect, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Palette } from './components/Palette';
import { Canvas } from './components/Canvas';
import { PropertiesPanel } from './components/Properties';
import { RecoveryPrompt } from './components/RecoveryPrompt';
import { useDiagramStore, useTemporalStore } from './store';
import { useAutoSave, getAutoSavedData, clearAutoSave } from './hooks/useAutoSave';

function App() {
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<{ timestamp: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save hook
  useAutoSave();

  const {
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    elements,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
    loadDiagram,
  } = useDiagramStore();

  // Check for auto-saved data on mount
  useEffect(() => {
    const saved = getAutoSavedData();
    if (saved && (saved.elements.length > 0 || saved.connections.length > 0)) {
      setRecoveryData({ timestamp: saved.timestamp });
    }
  }, []);

  // Handle recovery
  const handleRecover = useCallback(() => {
    const saved = getAutoSavedData();
    if (saved) {
      loadDiagram(saved.elements, saved.connections);
      clearAutoSave();
    }
    setRecoveryData(null);
  }, [loadDiagram]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    clearAutoSave();
    setRecoveryData(null);
  }, []);

  // Toggle connect mode
  const toggleConnectMode = useCallback(() => {
    setConnectMode((prev) => !prev);
    setConnectingFrom(null);
  }, []);

  // Handle connection start
  const handleConnectionStart = useCallback((id: string) => {
    if (id === '') {
      // Connection completed, exit connect mode
      setConnectingFrom(null);
      setConnectMode(false);
    } else {
      setConnectingFrom(id);
    }
  }, []);

  // Save handler for keyboard shortcut
  const handleSave = useCallback(() => {
    const data = {
      version: '1.0',
      elements,
      connections,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toulmin-diagram-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, connections]);

  // Load handler for keyboard shortcut
  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.elements && data.connections) {
          loadDiagram(data.elements, data.connections);
        }
      } catch (err) {
        console.error('Failed to parse diagram file:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }, [loadDiagram]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Undo: Cmd/Ctrl+Z
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useTemporalStore().undo();
        return;
      }

      // Redo: Cmd/Ctrl+Shift+Z
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useTemporalStore().redo();
        return;
      }

      // Save: Cmd/Ctrl+S
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Load: Cmd/Ctrl+O
      if (isMod && e.key === 'o') {
        e.preventDefault();
        handleLoad();
        return;
      }

      // Duplicate: Cmd/Ctrl+D
      if (isMod && e.key === 'd') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          duplicateElements(selectedIds);
        }
        return;
      }

      // Select All: Cmd/Ctrl+A
      if (isMod && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Zoom In: Cmd/Ctrl++ or Cmd/Ctrl+=
      if (isMod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setZoom(zoom * 1.2);
        return;
      }

      // Zoom Out: Cmd/Ctrl+-
      if (isMod && e.key === '-') {
        e.preventDefault();
        setZoom(zoom / 1.2);
        return;
      }

      // Fit to View: Cmd/Ctrl+0
      if (isMod && e.key === '0') {
        e.preventDefault();
        fitToView();
        return;
      }

      // 'C' for connect mode
      if (e.key === 'c' || e.key === 'C') {
        toggleConnectMode();
      }

      // Delete/Backspace to remove selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedIds.forEach((id) => {
          // Check if it's a connection or element
          if (connections.some((c) => c.id === id)) {
            removeConnection(id);
          } else {
            removeElement(id);
          }
        });
      }

      // Escape to cancel connect mode or deselect
      if (e.key === 'Escape') {
        if (connectMode) {
          setConnectMode(false);
          setConnectingFrom(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toggleConnectMode,
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    connectMode,
    handleSave,
    handleLoad,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
  ]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Hidden file input for Ctrl+O loading */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileLoad}
        className="hidden"
      />
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <Palette
          connectMode={connectMode}
          onToggleConnectMode={toggleConnectMode}
        />
        <Canvas
          connectMode={connectMode}
          onConnectionStart={handleConnectionStart}
          connectingFrom={connectingFrom}
        />
      </div>
      <PropertiesPanel />

      {/* Recovery Prompt */}
      {recoveryData && (
        <RecoveryPrompt
          timestamp={recoveryData.timestamp}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );
}

export default App;
