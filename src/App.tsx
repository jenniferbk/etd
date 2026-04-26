import { useState, useEffect, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Palette } from './components/Palette';
import { Canvas } from './components/Canvas';
import { PropertiesPanel } from './components/Properties';
import { RecoveryPrompt } from './components/RecoveryPrompt';
import { ImageLightbox } from './components/ImageEditor/ImageLightbox';
import { useDiagramStore, useTemporalStore, useLightboxStore } from './store';
import { useAutoSave, getAutoSavedData, clearAutoSave } from './hooks/useAutoSave';
import { parseTranscript } from './utils/transcriptParser';
import { SAVE_SCHEMA_VERSION } from './utils/schema';
import { TranscriptPanel } from './components/TranscriptPanel';
import { PanelRightOpen } from 'lucide-react';
import { theme } from './utils/theme';

function App() {
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<{ timestamp: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(false);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);

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
    diagramName,
    transcript,
  } = useDiagramStore();

  const { isOpen: lightboxOpen, imageData: lightboxImage, elementLabel: lightboxLabel, closeLightbox } = useLightboxStore();

  // Check for auto-saved data on mount
  useEffect(() => {
    const saved = getAutoSavedData();
    if (
      saved &&
      (saved.elements.length > 0 ||
        saved.connections.length > 0 ||
        saved.transcript != null) // Loose equality: older autosave entries (pre-Task-3) lack `transcript`, so saved.transcript may be undefined rather than null.
    ) {
      setRecoveryData({ timestamp: saved.timestamp });
    }
  }, []);

  // Auto-open the transcript panel when a transcript becomes loaded in the store.
  // Triggers on JSON load, autosave recovery, or any future load path. Setting
  // to true is idempotent if already open. Manual close after auto-open still
  // works; the next null→non-null transition reopens.
  useEffect(() => {
    if (transcript) setTranscriptPanelOpen(true);
  }, [transcript]);

  // Handle recovery
  const handleRecover = useCallback(() => {
    const saved = getAutoSavedData();
    if (saved) {
      loadDiagram(saved.elements, saved.connections, undefined /* name: default */, saved.transcript);
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
    const toFilename = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';

    const data = {
      version: SAVE_SCHEMA_VERSION,
      name: diagramName,
      elements,
      connections,
      transcript,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toFilename(diagramName)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [elements, connections, diagramName, transcript]);

  // Load handler for keyboard shortcut
  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const setTranscript = useDiagramStore((s) => s.setTranscript);

  const handleLoadTranscriptClick = useCallback(() => {
    transcriptFileInputRef.current?.click();
  }, []);

  const handleTranscriptFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Orphan-confirm using current store state
      const current = useDiagramStore.getState();
      if (current.transcript) {
        const orphanCount = current.elements.filter(
          (el) => el.sourceTranscript?.transcriptId === current.transcript!.id,
        ).length;
        if (orphanCount > 0) {
          const proceed = confirm(
            `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
          );
          if (!proceed) {
            e.target.value = '';
            return;
          }
        }
      }

      try {
        const text = await file.text();
        const parsed = parseTranscript(text, file.name);
        if (parsed.lines.length === 0) {
          alert(`No valid transcript lines found in ${file.name}.`);
          e.target.value = '';
          return;
        }
        setTranscript(parsed);
        setTranscriptPanelOpen(true);
      } catch (err) {
        console.error('Failed to read transcript file:', err);
        alert('Failed to read transcript file.');
      }
      e.target.value = '';
    },
    [setTranscript],
  );

  const toggleTranscriptPanel = useCallback(() => {
    setTranscriptPanelOpen((v) => !v);
  }, []);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.elements && data.connections) {
          loadDiagram(data.elements, data.connections, data.name, data.transcript ?? null);
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
      // Ignore if typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
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
      <input
        ref={transcriptFileInputRef}
        type="file"
        accept=".txt"
        onChange={handleTranscriptFileChange}
        className="hidden"
      />
      <Toolbar
        onLoadTranscript={handleLoadTranscriptClick}
        transcriptPanelOpen={transcriptPanelOpen}
        onToggleTranscriptPanel={toggleTranscriptPanel}
      />
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
        {transcriptPanelOpen ? (
          <TranscriptPanel onClose={() => setTranscriptPanelOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setTranscriptPanelOpen(true)}
            title="Show transcript panel"
            aria-label="Show transcript panel"
            className="w-8 border-l flex items-start justify-center pt-4 hover:opacity-80"
            style={{
              background: theme.sidebar.bgGradient,
              borderColor: theme.sidebar.border,
              color: theme.sidebar.textSecondary,
            }}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
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

      {/* Image Lightbox */}
      {lightboxOpen && lightboxImage && (
        <ImageLightbox
          imageData={lightboxImage}
          elementLabel={lightboxLabel || undefined}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}

export default App;
