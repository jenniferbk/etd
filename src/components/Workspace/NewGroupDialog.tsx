import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useAuthStore } from '../../api/authStore';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';

interface NewGroupDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new group's id once creation + the groups-list refresh
   *  both succeed, so the caller can switch the Workspace's selected group. */
  onCreated: (groupId: number) => void;
}

/** Site-admin-only "New group" dialog, opened from WorkspaceHeader next to
 *  the group switcher. Visual conventions mirror AddToLibraryDialog (plain
 *  text field, resync-on-open effect, Modal footer buttons). */
export function NewGroupDialog({ open, onClose, onCreated }: NewGroupDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Resync on every open-transition, not just at mount — the dialog is
  // rendered unconditionally (only `open` toggles), so without this a name
  // typed in a previous open (then cancelled) would linger into the next one.
  useEffect(() => {
    if (open) {
      setName('');
      setBusy(false);
    }
  }, [open]);

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const group = await api<{ id: number; name: string }>('/api/groups', {
        method: 'POST',
        body: { name: trimmed },
      });
      // Refresh the groups list so the new group appears in the switcher
      // before we try to select it.
      await useAuthStore.getState().restore();
      onCreated(group.id);
      onClose();
      useToastStore.getState().addToast('info', 'Group created');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const createDisabled = busy || !name.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New group"
      size="sm"
      initialFocus="primary"
      footer={
        <>
          <button
            onClick={onClose}
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
            onClick={() => void handleCreate()}
            disabled={createDisabled}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <label className="text-sm font-medium" style={{ color: theme.sidebar.text }}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !createDisabled) {
              e.preventDefault();
              void handleCreate();
            }
          }}
          className="mt-1.5 px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={inputStyle}
          placeholder="Group name"
        />
      </div>
    </Modal>
  );
}
