import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';

interface SetNewPasswordModalProps {
  token: string;
  /** Called after a successful reset, and also when the modal is dismissed
   *  without one (X / Escape / scrim click) — either way the caller clears
   *  the `?reset=` token and opens Sign in. */
  onDone: () => void;
}

const inputClassName =
  'px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const labelClassName = 'text-sm font-medium';

/** Lands from a `?reset=<token>` link (see ResetLinkDialog). Unauthenticated
 *  by design — the token itself is the credential. On success, strips the
 *  URL param (mirrors SignInModal's post-auth cleanup) and hands off to
 *  Sign in via onDone. */
export function SetNewPasswordModal({ token, onDone }: SetNewPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };
  const labelStyle = { color: theme.sidebar.text };

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const submitDisabled = busy || newPassword.length < 8 || confirmPassword.length < 8 || mismatch;

  const handleSubmit = async () => {
    if (submitDisabled) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } });
      useToastStore.getState().addToast('info', 'Password updated — you can sign in now.');
      window.history.replaceState(null, '', window.location.pathname);
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !submitDisabled) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Modal
      open
      onClose={onDone}
      title="Set a new password"
      size="sm"
      initialFocus="primary"
      footer={
        <button
          onClick={() => void handleSubmit()}
          disabled={submitDisabled}
          data-modal-focus="primary"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          {busy ? 'Please wait…' : 'Set password'}
        </button>
      }
    >
      <div className="px-5 py-4 space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            autoComplete="new-password"
            minLength={8}
            className={inputClassName}
            style={inputStyle}
            placeholder="At least 8 characters"
          />
          <p className="text-xs" style={{ color: theme.sidebar.textSecondary }}>
            Must be at least 8 characters.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            autoComplete="new-password"
            minLength={8}
            className={inputClassName}
            style={inputStyle}
          />
        </div>

        {(mismatch || error) && (
          <p className="text-sm" style={{ color: theme.danger.fg }}>
            {mismatch ? "Those passwords don't match." : error}
          </p>
        )}
      </div>
    </Modal>
  );
}
