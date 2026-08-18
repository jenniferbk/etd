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
import { ResetLinkDialog } from './ResetLinkDialog';

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
  const [resetOpen, setResetOpen] = useState(false);

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
    onClick: () => run(() => setResetOpen(true)),
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

  // Role-change and remove items are absent on your own row (Reset
  // password… is the only action ever offered there) — so the "first"/
  // "next" enabled item still needs care. These helpers skip disabled
  // entries (wrapping around) so focus and arrow-key nav never land on
  // something unfocusable; when nothing is enabled they return -1 and the
  // caller leaves focus where it is (the trigger).
  function firstEnabledIndex(): number {
    return actions.findIndex((a) => !a.disabled);
  }
  function lastEnabledIndex(): number {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (!actions[i].disabled) return i;
    }
    return -1;
  }
  function nextEnabledIndex(from: number, direction: 1 | -1): number {
    const count = actions.length;
    for (let step = 1; step <= count; step++) {
      const idx = (((from + direction * step) % count) + count) % count;
      if (!actions[idx].disabled) return idx;
    }
    return -1;
  }

  // `actions` is a fresh array every render, so the effect depends on the
  // plain-number index instead — it only needs to re-run when isOpen flips
  // or which index is first-enabled actually changes (e.g. a role change
  // finishing clears `busy` and re-enables items).
  const firstEnabledActionIndex = firstEnabledIndex();

  useEffect(() => {
    if (isOpen && firstEnabledActionIndex >= 0) {
      activeIndexRef.current = firstEnabledActionIndex;
      requestAnimationFrame(() => itemRefs.current[firstEnabledActionIndex]?.focus());
    }
  }, [isOpen, firstEnabledActionIndex]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = nextEnabledIndex(activeIndexRef.current, 1);
      if (next >= 0) {
        activeIndexRef.current = next;
        itemRefs.current[next]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = nextEnabledIndex(activeIndexRef.current, -1);
      if (prev >= 0) {
        activeIndexRef.current = prev;
        itemRefs.current[prev]?.focus();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = firstEnabledIndex();
      if (first >= 0) {
        activeIndexRef.current = first;
        itemRefs.current[first]?.focus();
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = lastEnabledIndex();
      if (last >= 0) {
        activeIndexRef.current = last;
        itemRefs.current[last]?.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Let the browser's native click-on-activation proceed (MenuItem's own
      // onClick handles the action) but don't let this keydown keep bubbling
      // past the popover. Escape is intentionally left alone so it keeps
      // bubbling to useMenu's document-level listener.
      e.stopPropagation();
    }
  }

  return (
    <>
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
      <ResetLinkDialog member={member} open={resetOpen} onClose={() => setResetOpen(false)} />
    </>
  );
}
