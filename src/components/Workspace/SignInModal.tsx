import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useAuthStore } from '../../api/authStore';
import { api, getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';

export const POLICY_LABEL =
  'I understand that only de-identified data may be uploaded — no names or other identifying information in transcripts, images, or diagram content.';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  inviteToken: string | null; // non-null ⇒ register mode
  initialServerUrl?: string;
  /** Called after a successful sign-in/register, before onClose. */
  onAuthenticated?: () => void;
}

const inputClassName =
  'px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const labelClassName = 'text-sm font-medium';

export function SignInModal({ open, onClose, inviteToken, initialServerUrl, onAuthenticated }: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [serverUrl, setServer] = useState(initialServerUrl ?? getServerUrl());
  const [serverSectionOpen, setServerSectionOpen] = useState(initialServerUrl !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewGroupName, setPreviewGroupName] = useState<string | null>(null);
  const registerMode = inviteToken !== null;

  // Reset all field/error state each time the modal transitions to open, so
  // a previously typed password (or a stale error from a prior attempt)
  // doesn't linger across close/reopen. The server-URL field keeps its
  // persisted value (getServerUrl()) rather than being blanked.
  useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setDisplayName('');
      setAcceptedPolicy(false);
      setError(null);
      setBusy(false);
      setServer(initialServerUrl ?? getServerUrl());
      setServerSectionOpen(initialServerUrl !== undefined);
    }
  }, [open, initialServerUrl]);

  // Register-mode greeting: resolve the invite's group name so the title can
  // say "Join <groupName>" instead of the generic "Create your account".
  // Any failure (expired/used/bogus token, offline, etc.) keeps the fallback
  // title silently — this is cosmetic, not worth a toast. Stale-guarded
  // since the modal can close (or the token can change) before the fetch
  // resolves; keyed on [open, inviteToken] only, so it doesn't refetch on
  // every unrelated render.
  useEffect(() => {
    if (!open || inviteToken === null) {
      setPreviewGroupName(null);
      return;
    }
    let cancelled = false;
    setPreviewGroupName(null);
    void (async () => {
      try {
        const res = await api<{ groupName: string }>(`/api/invites/${inviteToken}/preview`);
        if (!cancelled) setPreviewGroupName(res.groupName);
      } catch {
        // 404/expired/network — fall back to "Create your account" silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, inviteToken]);

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };
  const labelStyle = { color: theme.sidebar.text };

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      setServerUrl(serverUrl);
      if (registerMode) {
        await useAuthStore.getState().register({
          inviteToken: inviteToken!, email, password, displayName, acceptedPolicy,
        });
      } else {
        await useAuthStore.getState().signIn(email, password);
      }
      const name = useAuthStore.getState().user?.displayName ?? email;
      useToastStore.getState().addToast('info', `Signed in as ${name}`);
      window.history.replaceState(null, '', window.location.pathname);
      onAuthenticated?.();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    busy ||
    !email.trim() ||
    !password ||
    (registerMode && (!displayName.trim() || !acceptedPolicy));

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !submitDisabled) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={registerMode ? (previewGroupName ? `Join ${previewGroupName}` : 'Create your account') : 'Sign in'}
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
            onClick={() => void handleSubmit()}
            disabled={submitDisabled}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Please wait…' : registerMode ? 'Create account' : 'Sign in'}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 space-y-4">
        {registerMode && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClassName} style={labelStyle}>
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={handleFieldKeyDown}
              autoComplete="name"
              className={inputClassName}
              style={inputStyle}
              placeholder="Jane Doe"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            autoComplete="email"
            className={inputClassName}
            style={inputStyle}
            placeholder="you@example.edu"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            autoComplete={registerMode ? 'new-password' : 'current-password'}
            minLength={registerMode ? 8 : undefined}
            className={inputClassName}
            style={inputStyle}
            placeholder={registerMode ? 'At least 8 characters' : undefined}
          />
          {registerMode && (
            <p className="text-xs" style={{ color: theme.sidebar.textSecondary }}>
              Must be at least 8 characters.
            </p>
          )}
        </div>

        {registerMode && (
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: theme.sidebar.text }}>
            <input
              type="checkbox"
              checked={acceptedPolicy}
              onChange={(e) => setAcceptedPolicy(e.target.checked)}
              className="mt-0.5"
            />
            <span>{POLICY_LABEL}</span>
          </label>
        )}

        <div>
          <button
            type="button"
            onClick={() => setServerSectionOpen((v) => !v)}
            className="text-xs underline"
            style={{ color: theme.sidebar.textSecondary }}
          >
            {serverSectionOpen ? 'Hide advanced' : 'Advanced…'}
          </button>
          {serverSectionOpen && (
            <div className="flex flex-col gap-1.5 mt-2">
              <label className={labelClassName} style={labelStyle}>
                Server address
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServer(e.target.value)}
                className={inputClassName}
                style={inputStyle}
                placeholder={DEFAULT_SERVER_URL}
              />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm" style={{ color: theme.danger.fg }}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
