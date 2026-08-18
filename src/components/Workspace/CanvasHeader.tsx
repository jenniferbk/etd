import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore, type LibrarySaveStatus } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { friendlyError } from '../../api/friendlyError';
import { theme } from '../../utils/theme';
import { saveDiagramJson } from '../../utils/saveDiagram';
import { saveToLibrary } from '../../hooks/librarySave';
import { importDrawingFile } from '../../utils/drawingImporter';
import { Modal } from '../ui/Modal';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { AccountChip } from './AccountChip';
import { OfflineBanner } from './OfflineBanner';
import { PreviewBanner } from './PreviewBanner';

const STATUS_TEXT: Record<LibrarySaveStatus, (group: string) => string> = {
  saved: (g) => `Saved to ${g} ✓`,
  dirty: () => 'Unsaved changes — ⌘S to save',
  saving: () => 'Saving…',
  notInLibrary: () => 'Not in the library — Save adds it',
  offline: () => '', // the banner carries the message
};

const FILE_MENU_ITEM_COUNT = 2; // Download a copy, Open a file…

/** Header shown above the Toolbar for signed-in users on the canvas view.
 *  Owns the diagram title (Toolbar's own title input hides when signed in)
 *  and shows the live library-save status alongside a way back to the
 *  Workspace card gallery. */
export function CanvasHeader() {
  const groups = useAuthStore((s) => s.groups);
  const cloudGroupId = useCloudStore((s) => s.groupId);
  const status = useCloudStore((s) => s.status);
  const diagramId = useCloudStore((s) => s.diagramId);
  const preview = useCloudStore((s) => s.preview);
  const historyOpen = useCloudStore((s) => s.historyOpen);
  const diagramName = useDiagramStore((s) => s.diagramName);
  const setDiagramName = useDiagramStore((s) => s.setDiagramName);

  const groupName = groups.find((g) => g.id === cloudGroupId)?.name ?? groups[0]?.name ?? '';
  const backLabel = groupName ? `${groupName} Workspace` : 'Workspace';

  // Inline title editing — draft state only diverges from the store while
  // the field is focused, committed on blur/Enter. No effect-based sync (see
  // react-hooks/set-state-in-effect): the draft is (re)seeded on focus instead.
  const [titleDraft, setTitleDraft] = useState(diagramName);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const displayedTitle = isEditingTitle ? titleDraft : diagramName;

  const startEditingTitle = () => {
    setTitleDraft(diagramName);
    setIsEditingTitle(true);
  };
  const commitTitle = () => {
    setDiagramName(titleDraft);
    setIsEditingTitle(false);
  };

  // Back-to-workspace leave-confirm modal.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);

  const handleBack = () => {
    const currentStatus = useCloudStore.getState().status;
    if (currentStatus === 'dirty' || currentStatus === 'offline') {
      setLeaveOpen(true);
      return;
    }
    // A brand-new, never-saved diagram (status 'notInLibrary') can still
    // hold content worth protecting — gate on it too, or it's abandoned
    // silently.
    if (currentStatus === 'notInLibrary') {
      const d = useDiagramStore.getState();
      if (d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null) {
        setLeaveOpen(true);
        return;
      }
    }
    useCloudStore.getState().setView('workspace');
  };

  const handleStay = () => setLeaveOpen(false);

  const handleDiscardAndLeave = () => {
    setLeaveOpen(false);
    useCloudStore.getState().setView('workspace');
  };

  const handleSaveAndLeave = async () => {
    setLeaveSaving(true);
    await saveToLibrary();
    setLeaveSaving(false);
    const cloud = useCloudStore.getState();
    if (cloud.status === 'saved') {
      setLeaveOpen(false);
      cloud.setView('workspace');
      return;
    }
    if (cloud.addToLibraryOpen) {
      // Never-saved diagram: saveToLibrary opened the Add-to-library dialog
      // instead of saving directly. Close the leave-confirm so it doesn't
      // sit on top of it; the user completes the Add dialog, then presses
      // ← again — status is 'saved' by then and they leave cleanly.
      setLeaveOpen(false);
      return;
    }
    // Otherwise (still dirty/offline/error) leave the modal open so the user
    // can see the status and choose again.
  };

  // File ▾ menu — Download a copy / Open a file…
  const { isOpen: fileMenuOpen, toggle: toggleFileMenu, close: closeFileMenu, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File ▾ is disabled while previewing (below) — if it happened to be open
  // the instant a preview started, force it shut rather than leave a
  // disabled trigger with an orphaned open menu.
  useEffect(() => {
    if (preview !== null) closeFileMenu();
  }, [preview, closeFileMenu]);

  const handleToggleHistory = () => {
    useCloudStore.getState().setHistoryOpen(!historyOpen);
  };

  function handleFileMenuBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    closeFileMenu();
  }

  function handleFileMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % FILE_MENU_ITEM_COUNT;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + FILE_MENU_ITEM_COUNT) % FILE_MENU_ITEM_COUNT;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = FILE_MENU_ITEM_COUNT - 1;
      itemRefs.current[FILE_MENU_ITEM_COUNT - 1]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Let the browser's native click-on-activation proceed, but don't let
      // this keydown keep bubbling — Escape is left alone so it still
      // reaches useMenu's document-level listener.
      e.stopPropagation();
    }
  }

  const handleDownloadCopy = () => {
    const d = useDiagramStore.getState();
    void saveDiagramJson({
      diagramName: d.diagramName,
      elements: d.elements,
      connections: d.connections,
      styleConfig: d.styleConfig,
      transcript: d.transcript,
    });
  };

  const handleOpenFileClick = () => {
    fileInputRef.current?.click();
  };

  // Mirrors Workspace.tsx's handleFileChange, minus the view switch (we're
  // already on the canvas).
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.drawing')) {
        const result = await importDrawingFile(file);
        useDiagramStore.getState().loadDiagram(result.elements, result.connections, result.name, null);
        useCloudStore.getState().clearCloudTarget();
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.elements && data.connections) {
            useDiagramStore.getState().loadDiagram(
              data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig,
            );
            useCloudStore.getState().clearCloudTarget();
          } else {
            useToastStore.getState().addToast('error', 'Invalid diagram file format');
          }
        } catch {
          useToastStore.getState().addToast('error', 'Failed to parse diagram file');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
    e.target.value = '';
  };

  const statusText = STATUS_TEXT[status](groupName);

  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };
  const dangerButtonStyle = {
    backgroundColor: theme.danger.bg,
    color: theme.danger.fg,
    border: `1px solid ${theme.danger.border}`,
  };
  const primaryButtonStyle = { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };

  return (
    <>
      <div
        className="h-14 px-5 flex items-center justify-between border-b flex-shrink-0"
        style={{
          background: theme.toolbar.bgGradient,
          borderColor: theme.toolbar.border,
          boxShadow: theme.toolbar.shadow,
        }}
      >
        <div className="flex-1 min-w-0 flex items-center">
          <button
            onClick={handleBack}
            disabled={preview !== null}
            className="px-3 py-1.5 text-sm rounded-lg border transition-colors truncate max-w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: theme.sidebar.border, color: theme.sidebar.text, outlineColor: theme.focus.ring }}
            onMouseEnter={(e) => { if (preview === null) e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            ← {backLabel}
          </button>
        </div>

        <div className="flex flex-col items-center flex-shrink-0 px-4" style={{ minWidth: 0, maxWidth: 360 }}>
          <input
            type="text"
            value={displayedTitle}
            onFocus={startEditingTitle}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label="Diagram title"
            placeholder="Untitled diagram"
            className="text-base font-semibold text-center bg-transparent border-none w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
            style={{ color: theme.sidebar.text, outlineColor: theme.focus.ring }}
          />
          {!preview && statusText && (
            <p className="text-xs mt-0.5 truncate w-full text-center" style={{ color: theme.sidebar.textSecondary }}>
              {statusText}
            </p>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          <button
            onClick={handleToggleHistory}
            disabled={diagramId === null}
            aria-pressed={historyOpen}
            aria-label="History"
            className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: theme.sidebar.text,
              backgroundColor: historyOpen ? theme.sidebar.hover : 'transparent',
              outlineColor: theme.focus.ring,
            }}
            onMouseEnter={(e) => { if (diagramId !== null) e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = historyOpen ? theme.sidebar.hover : 'transparent'; }}
          >
            History
          </button>

          <div className="relative inline-flex">
            <button
              ref={triggerRef}
              onClick={toggleFileMenu}
              disabled={preview !== null}
              aria-haspopup="menu"
              aria-expanded={fileMenuOpen}
              aria-label="File menu"
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: theme.sidebar.text, outlineColor: theme.focus.ring }}
              onMouseEnter={(e) => { if (preview === null) e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              File ▾
            </button>

            {fileMenuOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="File"
                onKeyDown={handleFileMenuKeyDown}
                onBlur={handleFileMenuBlur}
                className="absolute right-0 rounded-lg py-1"
                style={{
                  top: 'calc(100% + 4px)',
                  width: 200,
                  backgroundColor: theme.sidebar.surface,
                  border: `1px solid ${theme.sidebar.border}`,
                  boxShadow: theme.shadow.md,
                  zIndex: theme.z.dropdown,
                }}
              >
                <MenuItem
                  ref={(el) => { itemRefs.current[0] = el; }}
                  icon={Download}
                  label="Download a copy"
                  onClick={() => { closeFileMenu(); handleDownloadCopy(); }}
                />
                <MenuItem
                  ref={(el) => { itemRefs.current[1] = el; }}
                  icon={FolderOpen}
                  label="Open a file…"
                  onClick={() => { closeFileMenu(); handleOpenFileClick(); }}
                />
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.drawing"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />

          <AccountChip />
        </div>
      </div>

      {preview && <PreviewBanner />}
      {!preview && status === 'offline' && <OfflineBanner groupName={groupName} />}

      <Modal
        open={leaveOpen}
        onClose={handleStay}
        title="Save before leaving?"
        size="sm"
        initialFocus="primary"
        footer={
          <>
            <button onClick={handleStay} className="px-4 py-2 text-sm rounded-lg" style={secondaryButtonStyle}>
              Stay
            </button>
            <button
              onClick={handleDiscardAndLeave}
              className="px-4 py-2 text-sm rounded-lg font-medium"
              style={dangerButtonStyle}
            >
              Discard changes
            </button>
            <button
              onClick={() => void handleSaveAndLeave()}
              disabled={leaveSaving}
              data-modal-focus="primary"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={primaryButtonStyle}
            >
              {leaveSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="px-5 py-4">
          <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
            This diagram has unsaved changes.
          </p>
        </div>
      </Modal>
    </>
  );
}
