import { useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { theme } from '../../utils/theme';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';

// First letters of up to the first two "words" in the display name — matches
// initials-avatar conventions elsewhere (e.g. Slack, Google) closely enough
// for a non-technical audience to recognize instantly.
function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Circular initials button → dropdown with displayName, email, and Sign out.
 *  Used by Workspace's header and reused as-is by CanvasHeader (Task 7). */
export function AccountChip() {
  const user = useAuthStore((s) => s.user);
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const signOutRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => signOutRef.current?.focus());
  }, [isOpen]);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  const handleSignOut = async () => {
    close();
    await useAuthStore.getState().signOut();
    useCloudStore.getState().clearCloudTarget();
    useCloudStore.getState().setView('canvas');
  };

  if (!user) return null;

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-semibold flex-shrink-0 transition-transform duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.sidebar.accent,
          color: theme.button.primary.text,
          outlineColor: theme.focus.ring,
        }}
      >
        {initials(user.displayName)}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
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
          <div className="px-3 py-2" style={{ borderBottom: `1px solid ${theme.sidebar.border}` }}>
            <p className="text-sm font-medium truncate" style={{ color: theme.sidebar.text }}>
              {user.displayName}
            </p>
            <p className="text-xs truncate" style={{ color: theme.sidebar.textSecondary }}>
              {user.email}
            </p>
          </div>
          <MenuItem
            ref={signOutRef}
            icon={LogOut}
            label="Sign out"
            onClick={() => void handleSignOut()}
          />
        </div>
      )}
    </div>
  );
}
