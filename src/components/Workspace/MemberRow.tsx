import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, ShieldCheck, Shield, KeyRound, UserMinus } from 'lucide-react';
import { IconButton } from '../Toolbar/IconButton';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { GroupMember } from '../../api/types';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';

interface MemberRowProps {
  member: GroupMember;
  groupId: number;
  groupName: string;
  /** Whether the signed-in user may manage this roster (site admin or this
   *  group's admin). Non-admins never see the ⋯ menu at all. */
  isAdmin: boolean;
  /** True when this row is the signed-in user's own membership — role
   *  changes and removal are never offered on your own row. */
  isSelf: boolean;
  /** Called after a role change or removal succeeds, so the parent can
   *  refresh the roster. */
  onChanged: () => void;
}

interface RowMenuAction {
  key: string;
  icon: typeof ShieldCheck;
  label: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  isLoading?: boolean;
  onClick: () => void;
}

/** One row of the People roster table: Name / Email / Role, plus (for
 *  admins, on other members' rows) a ⋯ menu mirroring DiagramCard's pattern
 *  — same roving-tabindex arrow-key nav and the same careful Enter/Space
 *  stopPropagation so activating a menu item doesn't also trigger anything
 *  on the row itself. */
export function MemberRow({ member, groupId, groupName, isAdmin, isSelf, onChanged }: MemberRowProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [busy, setBusy] = useState<'role' | 'remove' | null>(null);

  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  function run(handler: () => void) {
    close();
    handler();
  }

  const handleChangeRole = async (role: 'admin' | 'member') => {
    setBusy('role');
    try {
      await api(`/api/groups/${groupId}/members`, { method: 'POST', body: { email: member.email, role } });
      onChanged();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    const ok = await confirmAsync({
      title: 'Remove from group',
      message: `Remove ${member.displayName} from ${groupName}? They'll lose access to its diagrams. Their account stays active.`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy('remove');
    try {
      await api(`/api/groups/${groupId}/members/${member.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const actions: RowMenuAction[] = [];
  if (!isSelf) {
    actions.push(
      member.role === 'admin'
        ? {
            key: 'make-member',
            icon: Shield,
            label: 'Make member',
            isLoading: busy === 'role',
            disabled: busy !== null,
            onClick: () => run(() => { void handleChangeRole('member'); }),
          }
        : {
            key: 'make-admin',
            icon: ShieldCheck,
            label: 'Make admin',
            isLoading: busy === 'role',
            disabled: busy !== null,
            onClick: () => run(() => { void handleChangeRole('admin'); }),
          },
    );
  }
  actions.push({
    key: 'reset-password',
    icon: KeyRound,
    label: 'Reset password…',
    disabled: true,
    onClick: () => {},
  });
  if (!isSelf) {
    actions.push({
      key: 'remove',
      icon: UserMinus,
      label: 'Remove from group…',
      variant: 'danger',
      isLoading: busy === 'remove',
      disabled: busy !== null,
      onClick: () => run(() => { void handleRemove(); }),
    });
  }

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const count = actions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % count;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + count) % count;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = count - 1;
      itemRefs.current[count - 1]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Let the browser's native click-on-activation proceed (MenuItem's own
      // onClick handles the action) but don't let this keydown keep bubbling
      // past the popover. Escape is intentionally left alone so it keeps
      // bubbling to useMenu's document-level listener.
      e.stopPropagation();
    }
  }

  return (
    <div
      className="grid grid-cols-[1fr_1fr_100px_40px] gap-4 items-center px-4 py-3 border-b last:border-b-0"
      style={{ borderColor: theme.sidebar.borderSubtle }}
    >
      <p className="text-sm font-medium truncate" style={{ color: theme.sidebar.text }}>
        {member.displayName}
        {isSelf && <span style={{ color: theme.sidebar.textSecondary }}> (you)</span>}
      </p>
      <p className="text-sm truncate" style={{ color: theme.sidebar.textSecondary }}>
        {member.email}
      </p>
      <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
        {member.role === 'admin' ? 'Admin' : 'Member'}
      </p>

      <div className="relative inline-flex flex-shrink-0 justify-self-end">
        {isAdmin && (
          <>
            <IconButton
              ref={triggerRef}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
              }}
              icon={MoreHorizontal}
              tooltip="Member options"
              ariaHasPopup
              ariaExpanded={isOpen}
              ariaLabel={`Options for ${member.displayName}`}
            />

            {isOpen && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Member options"
                onKeyDown={handleMenuKeyDown}
                onBlur={handleBlur}
                className="absolute right-0 rounded-lg py-1"
                style={{
                  top: 'calc(100% + 4px)',
                  width: 200,
                  backgroundColor: theme.sidebar.surface,
                  border: `1px solid ${theme.sidebar.border}`,
                  boxShadow: theme.shadow.md,
                  zIndex: theme.z.dropdown,
                }}
              >
                {actions.map((action, i) => (
                  <MenuItem
                    key={action.key}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    icon={action.icon}
                    label={action.label}
                    variant={action.variant}
                    disabled={action.disabled}
                    isLoading={action.isLoading}
                    onClick={action.onClick}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
