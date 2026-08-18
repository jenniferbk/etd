import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Download, Trash2 } from 'lucide-react';
import { IconButton } from '../Toolbar/IconButton';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { CloudDiagram, DiagramListItem } from '../../api/types';
import { useCloudStore } from '../../store/cloudStore';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { saveDiagramJson } from '../../utils/saveDiagram';
import type { Connection, DiagramElement, StyleConfig, Transcript } from '../../types';

interface DiagramCardProps {
  item: DiagramListItem;
  onOpen: () => void;
  /** Called after a rename or delete succeeds, so the parent can refresh its list. */
  onChanged: () => void;
}

// Minutes/hours/days ago, falling back to a locale date past a week — mirrors
// the granularity researchers actually care about ("did Sam edit this today
// or last month?") without needing exact timestamps on the card face.
function relativeTime(updatedAt: string): string {
  const then = new Date(updatedAt + 'Z').getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(updatedAt + 'Z').toLocaleDateString();
}

const MENU_ITEM_COUNT = 3; // Rename, Download a copy, Delete

export function DiagramCard({ item, onOpen, onChanged }: DiagramCardProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(item.title);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  function run(handler: () => void) {
    close();
    handler();
  }

  // Roving-tabindex arrow-key navigation, matching MoreMenu/AccountChip — menu
  // items render with tabIndex={-1} so Tab skips them entirely.
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % MENU_ITEM_COUNT;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + MENU_ITEM_COUNT) % MENU_ITEM_COUNT;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = MENU_ITEM_COUNT - 1;
      itemRefs.current[MENU_ITEM_COUNT - 1]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Let the browser's native click-on-activation proceed (MenuItem's own
      // onClick handles Rename/Download/Delete) but don't let this keydown
      // keep bubbling past the popover — otherwise it would reach the card's
      // own onKeyDown and also fire onOpen(). Escape is intentionally left
      // alone here so it keeps bubbling to useMenu's document-level listener.
      e.stopPropagation();
    }
  }

  const openRename = () => {
    setRenameTitle(item.title);
    setRenameOpen(true);
  };

  const handleRenameSubmit = async () => {
    const title = renameTitle.trim();
    if (!title || renameBusy) return;
    setRenameBusy(true);
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      // There is no rename-only endpoint, so a rename fetches the current
      // snapshot and PUTs it straight back with the new title. That adds a
      // version row (harmless — versions are cheap); a dedicated rename
      // endpoint would be a nice sub-project-B addition.
      // The snapshot's own `name` field must be kept in sync with the title —
      // openDiagram() reads snapshot.name for the canvas header, so leaving
      // it stale here would show the old name after the next open.
      const snapshot = { ...d.snapshot, name: title };
      await api(`/api/diagrams/${item.id}`, { method: 'PUT', body: { snapshot, title } });
      setRenameOpen(false);
      onChanged();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setRenameBusy(false);
    }
  };

  const handleDownload = async () => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      await saveDiagramJson({
        diagramName: item.title,
        elements: snap.elements as DiagramElement[],
        connections: snap.connections as Connection[],
        styleConfig: snap.styleConfig as StyleConfig,
        transcript: (snap.transcript ?? null) as Transcript | null,
      });
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const handleDelete = async () => {
    const ok = await confirmAsync({
      title: 'Delete diagram',
      message: `Delete "${item.title}" from the shared library? All of its versions will be removed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'DELETE' });
      // Delete is offered on every card; the server enforces the
      // creator-or-admin rule and a 403 surfaces via friendlyError. The list
      // endpoint doesn't expose which user created each diagram, so we can't
      // hide the option client-side ahead of time.
      if (useCloudStore.getState().diagramId === item.id) useCloudStore.getState().clearCloudTarget();
      onChanged();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };

  const renameDisabled = renameBusy || !renameTitle.trim();

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        className="relative flex flex-col rounded-xl border p-4 text-left cursor-pointer transition-shadow duration-150 ease-out"
        style={{
          backgroundColor: theme.sidebar.surface,
          borderColor: theme.sidebar.border,
          boxShadow: theme.shadow.sm,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = theme.shadow.md; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = theme.shadow.sm; }}
      >
        <div className="h-16 rounded-lg mb-3" style={{ backgroundColor: theme.sidebar.hover }} />

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: theme.sidebar.text }}>
            {item.title}
          </h3>
          <div
            className="relative inline-flex flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              ref={triggerRef}
              onClick={toggle}
              onKeyDown={(e) => {
                // Stop only Enter/Space from bubbling to the card's own
                // onOpen keydown handler — everything else (notably Escape,
                // which useMenu listens for at the document level to close
                // the popover) must keep propagating.
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
              icon={MoreHorizontal}
              tooltip="Diagram options"
              ariaHasPopup
              ariaExpanded={isOpen}
              ariaLabel={`Options for "${item.title}"`}
            />

            {isOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Diagram options"
                onKeyDown={handleMenuKeyDown}
                onBlur={handleBlur}
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
                  icon={Pencil}
                  label="Rename"
                  onClick={() => run(openRename)}
                />
                <MenuItem
                  ref={(el) => { itemRefs.current[1] = el; }}
                  icon={Download}
                  label="Download a copy"
                  onClick={() => run(() => { void handleDownload(); })}
                />
                <div
                  className="my-1 mx-2"
                  style={{ height: 1, backgroundColor: theme.sidebar.border }}
                  role="separator"
                  aria-hidden="true"
                />
                <MenuItem
                  ref={(el) => { itemRefs.current[2] = el; }}
                  icon={Trash2}
                  label="Delete"
                  variant="danger"
                  onClick={() => run(() => { void handleDelete(); })}
                />
              </div>
            )}
          </div>
        </div>

        <p className="text-xs mt-1 truncate" style={{ color: theme.sidebar.textSecondary }}>
          last edited by {item.lastEditor} · {relativeTime(item.updatedAt)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: theme.sidebar.textSecondary }}>
          {item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'}
        </p>
      </div>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename diagram"
        size="sm"
        initialFocus="primary"
        footer={
          <>
            <button
              onClick={() => setRenameOpen(false)}
              className="px-4 py-2 text-sm rounded-lg"
              style={{
                backgroundColor: theme.button.secondary.bg,
                color: theme.button.secondary.text,
                border: `1px solid ${theme.button.secondary.border}`,
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleRenameSubmit()}
              disabled={renameDisabled}
              data-modal-focus="primary"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
            >
              {renameBusy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="px-5 py-4">
          <label className="text-sm font-medium" style={{ color: theme.sidebar.text }}>
            Title
          </label>
          <input
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renameDisabled) {
                e.preventDefault();
                void handleRenameSubmit();
              }
            }}
            className="mt-1.5 px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={inputStyle}
            placeholder="Diagram title"
          />
        </div>
      </Modal>
    </>
  );
}
