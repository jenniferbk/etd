import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, UploadCloud, Library, LogIn, LogOut } from 'lucide-react';
import { IconButton } from '../Toolbar/IconButton';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { theme } from '../../utils/theme';
import { useAuthStore } from '../../api/authStore';
import { useToastStore } from '../../store/toastStore';
import { useCloudStore } from '../../store/cloudStore';
import { api, ApiError } from '../../api/client';
import { buildCloudSnapshot } from '../../utils/buildCloudSnapshot';
import { SignInModal } from './SignInModal';
import { CloudSaveDialog } from './CloudSaveDialog';
import { LibraryModal } from './LibraryModal';

export function CloudMenu() {
  const user = useAuthStore((s) => s.user);
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [params] = useState(() => new URLSearchParams(window.location.search));
  // Sticky-until-consumed: starts from the ?invite= param (auto-opens register
  // mode on first load), but must be cleared after a successful auth so a
  // later sign-out → "Sign in…" doesn't reopen the Create-account form with a
  // now-consumed invite token.
  const [inviteToken, setInviteToken] = useState(() => params.get('invite'));
  const serverParam = params.get('server');
  const [signInOpen, setSignInOpen] = useState(inviteToken !== null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const itemCount = user ? 3 : 1;

  // A future disabled placeholder item would render a real disabled <button>,
  // which cannot receive focus. All navigation below skips disabled items
  // generically — otherwise focus could get stuck on a no-op index and later
  // enabled items would become unreachable by keyboard.
  const isEnabled = useCallback((index: number): boolean => {
    const el = itemRefs.current[index];
    return el != null && !el.disabled;
  }, []);

  const firstEnabledIndex = useCallback((): number => {
    for (let i = 0; i < itemCount; i++) {
      if (isEnabled(i)) return i;
    }
    return 0;
  }, [itemCount, isEnabled]);

  const lastEnabledIndex = useCallback((): number => {
    for (let i = itemCount - 1; i >= 0; i--) {
      if (isEnabled(i)) return i;
    }
    return itemCount - 1;
  }, [itemCount, isEnabled]);

  const nextEnabledIndex = useCallback((from: number, step: 1 | -1): number => {
    let idx = from;
    for (let i = 0; i < itemCount; i++) {
      idx = (idx + step + itemCount) % itemCount;
      if (isEnabled(idx)) return idx;
    }
    return from;
  }, [itemCount, isEnabled]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        const first = firstEnabledIndex();
        activeIndexRef.current = first;
        itemRefs.current[first]?.focus();
      });
    }
  }, [isOpen, firstEnabledIndex]);

  function run(handler: () => void) {
    close();
    handler();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = nextEnabledIndex(activeIndexRef.current, 1);
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = nextEnabledIndex(activeIndexRef.current, -1);
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = firstEnabledIndex();
      activeIndexRef.current = first;
      itemRefs.current[first]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = lastEnabledIndex();
      activeIndexRef.current = last;
      itemRefs.current[last]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  function handleSignOut() {
    void useAuthStore.getState().signOut();
    useToastStore.getState().addToast('info', 'Signed out');
  }

  const handleCloudSave = async () => {
    const { diagramId } = useCloudStore.getState();
    if (diagramId === null) {
      setSaveDialogOpen(true);
      return;
    }
    try {
      const snapshot = buildCloudSnapshot();
      // Omit title when the local diagram name is blank/whitespace — the
      // server requires a non-empty title (min length 1) but treats a
      // missing title as "keep the existing one".
      const title = snapshot.name.trim() ? snapshot.name : undefined;
      await api(`/api/diagrams/${diagramId}`, { method: 'PUT', body: { snapshot, title } });
      useToastStore.getState().addToast('info', 'Saved to cloud');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        useCloudStore.getState().clearCloudTarget();
        useToastStore.getState().addToast('info', 'That diagram was removed from the cloud — save it as new');
        setSaveDialogOpen(true);
        return;
      }
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'cloud save failed');
    }
  };

  return (
    <>
      <div className="relative inline-flex">
        <IconButton
          ref={triggerRef}
          onClick={toggle}
          icon={Cloud}
          tooltip="Cloud"
          ariaHasPopup
          ariaExpanded={isOpen}
          ariaLabel="Cloud"
        />

        {isOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Cloud"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="absolute right-0 rounded-lg py-1"
            style={{
              top: 'calc(100% + 4px)',
              width: 220,
              backgroundColor: theme.sidebar.surface,
              border: `1px solid ${theme.sidebar.border}`,
              boxShadow: theme.shadow.md,
              zIndex: theme.z.dropdown,
            }}
          >
            {user ? (
              <>
                <div
                  className="px-3 py-2 text-xs font-medium truncate"
                  style={{
                    color: theme.sidebar.textSecondary,
                    borderBottom: `1px solid ${theme.sidebar.border}`,
                  }}
                >
                  {user.displayName}
                </div>
                <MenuItem
                  ref={(el) => { itemRefs.current[0] = el; }}
                  icon={UploadCloud}
                  label="Save to cloud…"
                  onClick={() => run(() => { void handleCloudSave(); })}
                />
                <MenuItem
                  ref={(el) => { itemRefs.current[1] = el; }}
                  icon={Library}
                  label="Library…"
                  onClick={() => run(() => setLibraryOpen(true))}
                />
                <div
                  className="my-1 mx-2"
                  style={{ height: 1, backgroundColor: theme.sidebar.border }}
                  role="separator"
                  aria-hidden="true"
                />
                <MenuItem
                  ref={(el) => { itemRefs.current[2] = el; }}
                  icon={LogOut}
                  label="Sign out"
                  onClick={() => run(handleSignOut)}
                />
              </>
            ) : (
              <MenuItem
                ref={(el) => { itemRefs.current[0] = el; }}
                icon={LogIn}
                label="Sign in…"
                onClick={() => run(() => setSignInOpen(true))}
              />
            )}
          </div>
        )}
      </div>

      <SignInModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        inviteToken={inviteToken}
        initialServerUrl={serverParam ? decodeURIComponent(serverParam) : undefined}
        onAuthenticated={() => setInviteToken(null)}
      />

      <CloudSaveDialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} />

      <LibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </>
  );
}
