import { useState, useEffect, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Palette } from './components/Palette';
import { Canvas } from './components/Canvas';
import { PropertiesPanel } from './components/Properties';
import { RecoveryPrompt } from './components/RecoveryPrompt';
import { NotesPanel } from './components/Notes';
import { ImageLightbox } from './components/ImageEditor/ImageLightbox';
import { useDiagramStore, useTemporalStore, useLightboxStore } from './store';
import { useAutoSave, getAutoSavedData, clearAutoSave } from './hooks/useAutoSave';
import { useDirtyTracking } from './hooks/dirtyTracking';
import { saveToLibrary } from './hooks/librarySave';
import { parseTranscript } from './utils/transcriptParser';
import { nameForLoadedFile } from './utils/saveDiagram';
import { TranscriptPanel, TranscriptClosedStrip } from './components/TranscriptPanel';
import { SettingsModal } from './components/Settings';
import { Toaster } from './components/ui/Toaster';
import { ConfirmHost } from './components/ui/ConfirmHost';
import { AddToLibraryDialog, CanvasHeader, ConflictDialog, HistoryPanel, SetNewPasswordModal, SignInModal, Workspace } from './components/Workspace';
import { useToastStore } from './store/toastStore';
import { confirmAsync } from './store/confirmStore';
import { theme } from './utils/theme';
import { useAuthStore } from './api/authStore';
import { useCloudStore } from './store/cloudStore';

// hasWork: true when the canvas currently holds anything worth protecting
// (used to decide whether restoring a session / finishing sign-in should
// drop the user onto the canvas as-is, or send them to the Workspace gallery).
function hasWork(): boolean {
  const d = useDiagramStore.getState();
  return d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null || d.notes.length > 0;
}

function App() {
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<{ timestamp: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(false);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const retractTimerRef = useRef<number | null>(null);

  // Read once at mount. The OS-level toggle takes effect on next refresh.
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Auto-save hook
  useAutoSave();

  // Invite/server-override links (?invite=...&server=...) — read once at
  // mount. Sticky-until-consumed: signInOpen auto-opens register mode from
  // the invite param, but the token itself is cleared post-auth (see
  // handleAuthenticated) so a later sign-out → "Sign in" doesn't reopen the
  // Create-account form with an already-consumed invite.
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [inviteToken, setInviteToken] = useState(() => params.get('invite'));
  const serverParam = params.get('server');
  const [signInOpen, setSignInOpen] = useState(inviteToken !== null);

  // Password-reset links (?reset=...) — same sticky-until-consumed shape as
  // the invite param above. onDone (success or dismiss) clears the token and
  // hands off to the Sign-in modal.
  const [resetToken, setResetToken] = useState(() => params.get('reset'));

  const handleAuthenticated = useCallback(() => {
    setInviteToken(null);
    if (!hasWork()) useCloudStore.getState().setView('workspace');
  }, []);

  const handleResetDone = useCallback(() => {
    setResetToken(null);
    setSignInOpen(true);
  }, []);

  // Restore a cloud session (if a token is already stored) once on mount.
  // If it succeeds and the canvas is still blank, land the user in the
  // Workspace gallery rather than an empty canvas.
  useEffect(() => {
    void (async () => {
      await useAuthStore.getState().restore();
      if (useAuthStore.getState().user && !hasWork()) {
        useCloudStore.getState().setView('workspace');
      }
    })();
  }, []);

  const {
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
    loadDiagram,
    transcript,
  } = useDiagramStore();

  const notesPanelOpen = useDiagramStore((s) => s.notesPanelOpen);

  const user = useAuthStore((s) => s.user);
  const view = useCloudStore((s) => s.view);
  const preview = useCloudStore((s) => s.preview);
  const historyOpen = useCloudStore((s) => s.historyOpen);
  useDirtyTracking(user !== null && preview === null);

  // Defensive: preview is normally exited via "Back to current" (clears it
  // itself) since CanvasHeader's ← is disabled while previewing — but if the
  // view ever flips to 'workspace' with a preview still set (sign-out,
  // future code path), don't let it leak into whatever diagram is opened
  // next from the gallery.
  useEffect(() => {
    if (view === 'workspace' && useCloudStore.getState().preview !== null) {
      useCloudStore.getState().setPreview(null);
    }
  }, [view]);

  const { isOpen: lightboxOpen, imageData: lightboxImage, elementLabel: lightboxLabel, closeLightbox } = useLightboxStore();

  // Check for auto-saved data on mount
  useEffect(() => {
    const saved = getAutoSavedData();
    if (
      saved &&
      (saved.elements.length > 0 ||
        saved.connections.length > 0 ||
        saved.transcript != null || // Loose equality: older autosave entries (pre-Task-3) lack `transcript`, so saved.transcript may be undefined rather than null.
        (saved.notes?.length ?? 0) > 0)
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

  // Show the entry hint each time full-screen is entered. Fades out after 2.5s.
  useEffect(() => {
    if (!fullScreen) return;
    setShowHint(true);
    const t = window.setTimeout(() => setShowHint(false), 2500);
    return () => clearTimeout(t);
  }, [fullScreen]);

  // Handle recovery
  const handleRecover = useCallback(() => {
    const saved = getAutoSavedData();
    if (saved) {
      loadDiagram(saved.elements, saved.connections, saved.diagramName, saved.transcript, saved.styleConfig, saved.notes);
      useCloudStore.getState().clearCloudTarget();
      // Recovered work must be immediately visible — otherwise it loads
      // invisibly behind the Workspace gallery and a stray card click can
      // silently overwrite it (see final-review Fix 1).
      useCloudStore.getState().setView('canvas');
      clearAutoSave();
    }
    setRecoveryData(null);
  }, [loadDiagram]);

  // Handle discard
  const handleDiscard = useCallback(() => {
    clearAutoSave();
    setRecoveryData(null);
  }, []);

  const cancelPendingRetract = useCallback(() => {
    if (retractTimerRef.current !== null) {
      clearTimeout(retractTimerRef.current);
      retractTimerRef.current = null;
    }
  }, []);

  const handleToolbarMouseLeave = useCallback(() => {
    cancelPendingRetract();
    retractTimerRef.current = window.setTimeout(() => {
      setToolbarHovered(false);
      retractTimerRef.current = null;
    }, 150);
  }, [cancelPendingRetract]);

  const handleToolbarBlur = useCallback((e: React.FocusEvent) => {
    // Retract only if focus left the toolbar entirely (not moved to a child).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      handleToolbarMouseLeave();
    }
  }, [handleToolbarMouseLeave]);

  const handleHoverZoneEnter = useCallback(() => {
    cancelPendingRetract();
    setToolbarHovered(true);
  }, [cancelPendingRetract]);

  const handleToolbarFocus = useCallback(() => {
    cancelPendingRetract();
    setToolbarHovered(true);
  }, [cancelPendingRetract]);

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

  // Save handler for keyboard shortcut — routes through the single Save entry
  // point (local file when signed out, team library when signed in).
  const handleSave = useCallback(() => {
    void saveToLibrary();
  }, []);

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
          const proceed = await confirmAsync({
            title: 'Replace transcript?',
            message: `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
            confirmLabel: 'Replace transcript',
            cancelLabel: 'Cancel',
          });
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
          useToastStore.getState().addToast('error', `No valid transcript lines found in ${file.name}.`);
          e.target.value = '';
          return;
        }
        setTranscript(parsed);
        setTranscriptPanelOpen(true);
      } catch (err) {
        console.error('Failed to read transcript file:', err);
        useToastStore.getState().addToast('error', 'Failed to read transcript file.');
      }
      e.target.value = '';
    },
    [setTranscript],
  );

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.elements && data.connections) {
          loadDiagram(data.elements, data.connections, nameForLoadedFile(data.name, file.name), data.transcript ?? null, data.styleConfig, data.notes);
          useCloudStore.getState().clearCloudTarget();
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
      // Read-only preview: none of these shortcuts make sense against a past
      // version (undo/redo would rewrite history state that isn't really
      // "current"; save must go through Restore). Same shape as the
      // Workspace-view guard below — still swallow ⌘S/⌘O so the browser's
      // native Save-Page / Open-File dialog doesn't leak through.
      if (preview !== null) {
        const isModPreview = e.metaKey || e.ctrlKey;
        if (isModPreview && (e.key === 's' || e.key === 'o')) {
          e.preventDefault();
        }
        return;
      }

      // Canvas-only: none of these shortcuts (undo/redo/save/zoom/etc.) make
      // sense while browsing the Workspace gallery.
      if (!(view === 'canvas' || !user)) {
        // Still swallow ⌘S / ⌘O here so the browser's native Save-Page /
        // Open-File dialog doesn't leak through while on the Workspace view.
        const isModWorkspace = e.metaKey || e.ctrlKey;
        if (isModWorkspace && (e.key === 's' || e.key === 'o')) {
          e.preventDefault();
        }
        return;
      }

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

      // Full-screen toggle: F (no modifier).
      // CRITICAL: must NOT trigger on Cmd+F / Ctrl+F (browser find), Shift+F,
      // or Alt+F — those should pass through to default browser/OS behavior.
      if ((e.key === 'f' || e.key === 'F') && !isMod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setFullScreen((prev) => !prev);
        setToolbarHovered(false);
        cancelPendingRetract();
        return;
      }

      // Notes panel toggle: N (no modifier). Same guards as F so ⌘N / Ctrl+N
      // (browser new window) and Shift/Alt combos pass through untouched.
      if ((e.key === 'n' || e.key === 'N') && !isMod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const d = useDiagramStore.getState();
        d.setNotesPanelOpen(!d.notesPanelOpen);
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

      // Escape: modal-gated, then full-screen exit, then connect-mode cancel.
      if (e.key === 'Escape') {
        // Defer to any open modal — its own keydown handler will close it.
        if (settingsOpen || lightboxOpen || recoveryData !== null) {
          return;
        }
        if (fullScreen) {
          setFullScreen(false);
          setToolbarHovered(false);
          cancelPendingRetract();
          return;
        }
        if (connectMode) {
          setConnectMode(false);
          setConnectingFrom(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    preview,
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
    fullScreen,
    settingsOpen,
    lightboxOpen,
    recoveryData,
    cancelPendingRetract,
    view,
    user,
  ]);

  return (
    <div className="h-screen flex flex-col relative" style={{ backgroundColor: theme.sidebar.bg }}>
      {user && view === 'workspace' ? (
        <Workspace />
      ) : (
        <>
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

          {/* Signed-in canvas header — title, live save status, back to Workspace. */}
          {user && view === 'canvas' && <CanvasHeader />}

          {/* Toolbar wrapper — flow position normally, absolute overlay in full-screen.
              In full-screen, slides in from above on toolbarHovered. */}
          <div
            className={fullScreen ? 'absolute top-0 left-0 right-0' : 'relative'}
            style={{
              ...(fullScreen
                ? {
                    zIndex: theme.z.fsToolbar,
                    transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
                    transition: prefersReducedMotion ? 'none' : 'transform 180ms ease',
                    paddingBottom: 24,
                    boxShadow: toolbarHovered ? theme.shadow.md : 'none',
                  }
                : {}),
              // Read-only preview: the toolbar's save/zoom/undo/draw tools
              // don't apply to a past version. CanvasHeader, PreviewBanner
              // and HistoryPanel stay interactive (rendered outside this
              // wrapper, or with their own pointerEvents: 'auto' override).
              // `inert` (final-review Fix 1) closes the keyboard hole that
              // pointerEvents alone leaves open — Tab could still reach and
              // Enter/Space could still activate these controls with the
              // mouse blocked but focus untouched.
              pointerEvents: preview ? 'none' : undefined,
            }}
            inert={preview !== null}
            onMouseLeave={fullScreen ? handleToolbarMouseLeave : undefined}
            onMouseDown={fullScreen ? (e) => e.stopPropagation() : undefined}
            onFocus={fullScreen ? handleToolbarFocus : undefined}
            onBlur={fullScreen ? handleToolbarBlur : undefined}
          >
            <Toolbar
              onLoadTranscript={handleLoadTranscriptClick}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenSignIn={() => setSignInOpen(true)}
            />
          </div>

          {/* Canvas row — Canvas always at this stable tree position. Sibling panels
              toggled via Tailwind `hidden` (display: none) so they unmount layout-wise
              but stay mounted component-wise; their internal state survives.
              HistoryPanel is a sibling OUTSIDE the inert/pointer-events-blocked
              wrapper below — `inert` cannot be overridden by a descendant the way
              pointerEvents: 'auto' can, so it must live outside the subtree that
              goes inert during preview to stay interactive. */}
          <div
            className="flex flex-1 overflow-hidden"
            onMouseDown={fullScreen ? () => setToolbarHovered(false) : undefined}
          >
            <div
              className="flex flex-1 overflow-hidden"
              style={{ pointerEvents: preview ? 'none' : undefined }}
              inert={preview !== null}
            >
              <div className={fullScreen ? 'hidden' : 'contents'}>
                <Palette
                  connectMode={connectMode}
                  onToggleConnectMode={toggleConnectMode}
                />
              </div>

              <Canvas
                connectMode={connectMode}
                onConnectionStart={handleConnectionStart}
                connectingFrom={connectingFrom}
              />

              {/* Notes side panel — inside the inert wrapper on purpose: notes
                  are diagram content, so they're read-only during preview. */}
              <div className={fullScreen ? 'hidden' : 'contents'}>
                {notesPanelOpen && <NotesPanel />}
              </div>

              <div className={fullScreen ? 'hidden' : 'contents'}>
                {transcriptPanelOpen ? (
                  <TranscriptPanel onClose={() => setTranscriptPanelOpen(false)} />
                ) : (
                  <TranscriptClosedStrip onOpen={() => setTranscriptPanelOpen(true)} />
                )}
              </div>
            </div>

            {/* History side panel — stays interactive during preview (its own
                pointerEvents: 'auto' override, plus living outside the inert
                wrapper above). */}
            <div className={fullScreen ? 'hidden' : 'contents'}>
              {historyOpen && <HistoryPanel />}
            </div>
          </div>

          {/* Hover zone — 12px transparent strip at top. Wakes the toolbar. */}
          {fullScreen && (
            <div
              className="absolute top-0 left-0 right-0"
              style={{ height: 12, zIndex: theme.z.hoverZone, pointerEvents: preview ? 'none' : undefined }}
              onMouseEnter={handleHoverZoneEnter}
            />
          )}

          {/* Entry hint — disappears after 2.5s */}
          {fullScreen && showHint && (
            <div
              className="absolute bottom-4 right-4 px-3 py-1.5 rounded-md text-xs pointer-events-none"
              style={{
                zIndex: theme.z.fsHint,
                background: theme.sidebar.bg,
                color: theme.sidebar.text,
                border: `1px solid ${theme.sidebar.border}`,
                boxShadow: theme.shadow.sm,
                transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease',
              }}
            >
              Press F or Esc to exit
            </div>
          )}

          {/* Properties — hidden in full-screen */}
          <div className={fullScreen ? 'hidden' : ''} style={{ pointerEvents: preview ? 'none' : undefined }} inert={preview !== null}>
            <PropertiesPanel />
          </div>

          {/* Settings Modal */}
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

          {/* Image Lightbox */}
          {lightboxOpen && lightboxImage && (
            <ImageLightbox
              imageData={lightboxImage}
              elementLabel={lightboxLabel || undefined}
              onClose={closeLightbox}
            />
          )}
        </>
      )}

      {/* Global overlay hosts — rendered in both views. */}

      {/* Recovery Prompt — deferred while a reset or invite link is pending:
          both render as same-z-index global overlays, so a stale autosave
          landing at the same time as ?reset=/?invite= would otherwise bury
          the recovery prompt underneath. Both tokens clear once their flow
          finishes (onDone / handleAuthenticated), so the prompt appears on
          its own right after. */}
      {recoveryData && resetToken === null && inviteToken === null && (
        <RecoveryPrompt
          timestamp={recoveryData.timestamp}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
        />
      )}

      <SignInModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        inviteToken={inviteToken}
        initialServerUrl={serverParam ? decodeURIComponent(serverParam) : undefined}
        onAuthenticated={handleAuthenticated}
      />

      {resetToken && <SetNewPasswordModal token={resetToken} onDone={handleResetDone} />}

      <Toaster />
      <ConfirmHost />
      <AddToLibraryDialog />
      <ConflictDialog />
    </div>
  );
}

export default App;
