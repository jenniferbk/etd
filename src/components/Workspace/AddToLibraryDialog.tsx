import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { api, ApiError } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { buildCloudSnapshot } from '../../utils/buildCloudSnapshot';

export const ADD_TO_LIBRARY_REMINDER =
  'Reminder: only de-identified data may be saved to the shared library.';

const inputClassName =
  'px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const labelClassName = 'text-sm font-medium';

/** First-save-into-the-library dialog, opened by `saveToLibrary()` whenever the
 *  current diagram has no cloud target yet. Self-contained: reads its open
 *  flag from cloudStore rather than taking props, so it can be mounted once
 *  in App and triggered from anywhere. Visual conventions mirror
 *  CloudSaveDialog (its now-removed predecessor). */
export function AddToLibraryDialog() {
  const open = useCloudStore((s) => s.addToLibraryOpen);
  const groups = useAuthStore((s) => s.groups);
  const [title, setTitle] = useState(() => useDiagramStore.getState().diagramName);
  const [groupId, setGroupId] = useState<number>(groups[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);

  // Resync on every open, not just at mount — the dialog is rendered
  // unconditionally (only `open` toggles), so without this a rename or a
  // file load between opens would otherwise leave a stale title/group.
  useEffect(() => {
    if (open) {
      setTitle(useDiagramStore.getState().diagramName);
      setGroupId(groups[0]?.id ?? 0);
    }
  }, [open, groups]);

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };
  const labelStyle = { color: theme.sidebar.text };

  const handleClose = () => {
    // Ignore dismissal (X / Escape / scrim all route through this) while an
    // Add is in flight — otherwise the in-flight promise keeps running and
    // mutates state/toasts after the user thinks they've canceled. Mirrors
    // ConflictDialog's handleCancel.
    if (busy) return;
    useCloudStore.getState().setAddToLibraryOpen(false);
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      const snapshot = buildCloudSnapshot(title);
      const res = await api<{ id: number; currentVersionId: number }>('/api/diagrams', {
        method: 'POST',
        body: { groupId, title, snapshot },
      });
      useDiagramStore.getState().setDiagramName(title);
      useCloudStore.getState().setCloudTarget(res.id, groupId, res.currentVersionId);
      useToastStore.getState().addToast('info', 'Added to the library');
      useCloudStore.getState().setAddToLibraryOpen(false);
    } catch (err) {
      if (err instanceof TypeError || (err instanceof ApiError && err.status >= 500)) {
        // Align with saveToLibrary's network-failure handling: go offline
        // and close the dialog — the OfflineBanner (rendered in canvas view,
        // which is where this dialog is always opened from) takes over.
        useCloudStore.getState().setStatus('offline');
        useCloudStore.getState().setAddToLibraryOpen(false);
      } else {
        useToastStore.getState().addToast('error', friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const noGroups = groups.length === 0;
  const addDisabled = busy || !title.trim() || noGroups;

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !addDisabled) {
      e.preventDefault();
      void handleAdd();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add to library"
      size="sm"
      initialFocus="primary"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleAdd()}
            disabled={addDisabled}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Adding…' : 'Add to library'}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 space-y-4">
        {noGroups && (
          <p className="text-sm" style={{ color: theme.danger.fg }}>
            You're not in a group yet — ask your admin for an invite.
          </p>
        )}

        {groups.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClassName} style={labelStyle}>
              Group
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(Number(e.target.value))}
              className={`${inputClassName} cursor-pointer`}
              style={inputStyle}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className={inputClassName}
            style={inputStyle}
            placeholder="Diagram title"
          />
        </div>

        <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
          {ADD_TO_LIBRARY_REMINDER}
        </p>
      </div>
    </Modal>
  );
}
