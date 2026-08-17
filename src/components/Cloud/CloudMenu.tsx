import { useEffect, useRef, useState } from 'react';
import { Cloud, UploadCloud, Library, LogIn, LogOut } from 'lucide-react';
import { IconButton } from '../Toolbar/IconButton';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { theme } from '../../utils/theme';
import { useAuthStore } from '../../api/authStore';
import { useToastStore } from '../../store/toastStore';
import { SignInModal } from './SignInModal';

export function CloudMenu() {
  const user = useAuthStore((s) => s.user);
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [params] = useState(() => new URLSearchParams(window.location.search));
  const inviteToken = params.get('invite');
  const serverParam = params.get('server');
  const [signInOpen, setSignInOpen] = useState(inviteToken !== null);

  const itemCount = user ? 3 : 1;

  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function run(handler: () => void) {
    close();
    handler();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % itemCount;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + itemCount) % itemCount;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = itemCount - 1;
      itemRefs.current[itemCount - 1]?.focus();
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
                <div title="Coming in this release">
                  <MenuItem
                    ref={(el) => { itemRefs.current[0] = el; }}
                    icon={UploadCloud}
                    label="Save to cloud…"
                    onClick={() => {}}
                    disabled
                  />
                </div>
                <div title="Coming in this release">
                  <MenuItem
                    ref={(el) => { itemRefs.current[1] = el; }}
                    icon={Library}
                    label="Library…"
                    onClick={() => {}}
                    disabled
                  />
                </div>
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
      />
    </>
  );
}
