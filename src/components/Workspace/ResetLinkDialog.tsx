import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { CopyLinkField } from './CopyLinkField';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useToastStore } from '../../store/toastStore';
import type { GroupMember } from '../../api/types';
import { theme } from '../../utils/theme';

interface ResetLinkDialogProps {
  member: GroupMember;
  open: boolean;
  onClose: () => void;
}

/** Admin action: mints a single-use, 24-hour password-reset link for a
 *  member and shows it in a CopyLinkField. Unlike InviteDialog, the reset is
 *  created immediately on open (one fewer click) rather than behind its own
 *  "Create" button — there's nothing to configure first. */
export function ResetLinkDialog({ member, open, onClose }: ResetLinkDialogProps) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Kept current after every render so the fetch effect below can call the
  // latest onClose on failure without needing it in its dependency array —
  // onClose is a fresh closure from MemberRow on every render and isn't
  // itself part of "what to resync on" (only open/member.email are).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLink(null);
      setBusy(true);
      try {
        const res = await api<{ token: string; expiresInHours: number }>('/api/password-resets', {
          method: 'POST',
          body: { email: member.email },
        });
        if (cancelled) return;
        setLink(`${window.location.origin}${window.location.pathname}?reset=${res.token}`);
        setBusy(false);
      } catch (err) {
        if (cancelled) return;
        useToastStore.getState().addToast('error', friendlyError(err));
        setBusy(false);
        onCloseRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, member.email]);

  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset password"
      subtitle={member.displayName}
      size="sm"
      initialFocus="close"
      footer={
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={secondaryButtonStyle}>
          Done
        </button>
      }
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
          Send this link to {member.displayName}. It lets them set a new password and expires in 24 hours.
        </p>
        {busy ? (
          <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
            Creating reset link…
          </p>
        ) : (
          link && <CopyLinkField link={link} />
        )}
      </div>
    </Modal>
  );
}
