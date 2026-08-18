import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { buildCloudSnapshot } from '../../utils/buildCloudSnapshot';
import { saveToLibrary } from '../../hooks/librarySave';

/** Shown when a save 409s (cloudStore.conflict set) because a teammate saved
 *  a newer version first. Self-contained: reads its open flag from
 *  cloudStore rather than taking props, so it can be mounted once in App and
 *  triggered from wherever saveToLibrary runs. Offers the three ways out of
 *  the lost-update race: overwrite their version, save the local changes as
 *  a new diagram, or cancel and keep editing (stays dirty). */
export function ConflictDialog() {
  const open = useCloudStore((s) => s.conflict) !== null;
  const [busy, setBusy] = useState(false);

  const handleCancel = () => {
    // Ignore dismissal (X / Escape / scrim all route through this) while an
    // Overwrite or Save-as-copy is in flight — otherwise the in-flight
    // promise keeps running and mutates state/toasts after the user thinks
    // they've canceled.
    if (busy) return;
    useCloudStore.getState().setConflict(null);
  };

  const handleOverwrite = async () => {
    setBusy(true);
    try {
      await saveToLibrary({ force: true });
      if (useCloudStore.getState().status === 'saved') {
        useCloudStore.getState().setConflict(null);
      }
      // Else: the force-save failed too (offline, 404, ...) — that already
      // surfaced through saveToLibrary's own handling. Leave this dialog
      // open rather than assume success.
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setBusy(true);
    try {
      const cloud = useCloudStore.getState();
      const copyTitle = `${useDiagramStore.getState().diagramName} (copy)`;
      const snapshot = buildCloudSnapshot(copyTitle);
      const res = await api<{ id: number; currentVersionId: number }>('/api/diagrams', {
        method: 'POST',
        body: { groupId: cloud.groupId, title: copyTitle, snapshot },
      });
      useDiagramStore.getState().setDiagramName(copyTitle);
      // groupId is guaranteed non-null here: a conflict can only exist once
      // saveToLibrary has PUT'd an already-linked diagram, and setCloudTarget
      // always sets diagramId/groupId together.
      useCloudStore.getState().setCloudTarget(res.id, cloud.groupId as number, res.currentVersionId);
      useCloudStore.getState().setConflict(null);
      useToastStore.getState().addToast('info', 'Saved as a copy');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="Someone else saved this diagram"
      size="sm"
      initialFocus="cancel"
      footer={
        <>
          <button
            onClick={handleCancel}
            disabled={busy}
            data-modal-focus="cancel"
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSaveAsCopy()}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            style={secondaryButtonStyle}
          >
            Save as a copy
          </button>
          <button
            onClick={() => void handleOverwrite()}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.danger.bg, color: theme.button.danger.text }}
          >
            Overwrite
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.text }}>
          While you were editing, a teammate saved a newer version. Your unsaved changes are still here — choose what to do.
        </p>
      </div>
    </Modal>
  );
}
