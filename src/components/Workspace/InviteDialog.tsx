import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { CopyLinkField } from './CopyLinkField';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';

interface InviteDialogProps {
  groupId: number;
  groupName: string;
  open: boolean;
  onClose: () => void;
}

/** Admin-only "Invite someone" dialog: mints a single-use, 14-day invite
 *  link for the group on demand and shows it in a CopyLinkField for the
 *  admin to hand to a colleague. Modal conventions (footer buttons, resync-
 *  on-open effect) mirror AddToLibraryDialog. */
export function InviteDialog({ groupId, groupName, open, onClose }: InviteDialogProps) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resync on every open-transition, not just at mount — the dialog is
  // rendered unconditionally (only `open` toggles), so without this a link
  // created in a previous open would linger into the next one.
  useEffect(() => {
    if (open) {
      setLink(null);
      setBusy(false);
    }
  }, [open]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await api<{ token: string; expiresInDays: number }>('/api/invites', {
        method: 'POST',
        body: { groupId },
      });
      setLink(`${window.location.origin}${window.location.pathname}?invite=${res.token}`);
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
      onClose={onClose}
      title="Invite someone"
      subtitle={groupName}
      size="sm"
      initialFocus={link ? 'close' : 'primary'}
      footer={
        link ? (
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={secondaryButtonStyle}>
            Done
          </button>
        ) : (
          <>
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={secondaryButtonStyle}>
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={busy}
              data-modal-focus="primary"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
            >
              {busy ? 'Creating…' : 'Create invite link'}
            </button>
          </>
        )
      }
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
          Send this link to your colleague. It works once and expires in 14 days.
        </p>
        {link && <CopyLinkField link={link} />}
      </div>
    </Modal>
  );
}
