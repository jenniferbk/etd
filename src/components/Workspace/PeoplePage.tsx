import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { GroupMember } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { MemberRow } from './MemberRow';
import { InviteDialog } from './InviteDialog';

interface PeoplePageProps {
  groupId: number;
  groupName: string;
}

/** Roster view for the Workspace's People tab — lists a group's members
 *  (Name / Email / Role) with admin-only management via MemberRow's ⋯ menu.
 *
 *  Data logic (requestSeq stale-response guard) mirrors Workspace.tsx's
 *  diagram-list fetch verbatim in behavior. */
export function PeoplePage({ groupId, groupName }: PeoplePageProps) {
  const user = useAuthStore((s) => s.user);
  const groups = useAuthStore((s) => s.groups);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Guards against a stale response (e.g. group A's request resolving after
  // group B's, once the user has already switched groups) overwriting the
  // roster with out-of-date data. Only the most recently issued request may
  // call setMembers / toast.
  const requestSeq = useRef(0);

  const isAdmin = !!user && (user.isSiteAdmin || groups.find((g) => g.id === groupId)?.role === 'admin');

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    setMembers(null);
    setLoadError(false);
    try {
      const result = await api<GroupMember[]>(`/api/groups/${groupId}/members`);
      if (seq === requestSeq.current) setMembers(result);
    } catch (err) {
      if (seq === requestSeq.current) {
        useToastStore.getState().addToast('error', friendlyError(err));
        setMembers([]);
        setLoadError(true);
      }
    }
  }, [groupId]);

  // Fetch on mount and whenever the group changes.
  useEffect(() => {
    void (async () => { await refresh(); })();
  }, [refresh]);

  const primaryButtonStyle = { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };
  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <>
      <div className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h2 className="text-base font-semibold" style={{ color: theme.sidebar.text }}>
            People
          </h2>
          {isAdmin && (
            <button
              onClick={() => setInviteOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={primaryButtonStyle}
            >
              Invite someone
            </button>
          )}
        </div>

        {members === null ? (
          <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
            Loading people…
          </p>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
              Something went wrong loading people.
            </p>
            <button
              onClick={() => void refresh()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={secondaryButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
            >
              Try again
            </button>
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
            No one in this group yet.
          </p>
        ) : (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: theme.sidebar.surface, borderColor: theme.sidebar.border, boxShadow: theme.shadow.sm }}
          >
            <div
              className="grid grid-cols-[1fr_1fr_100px_40px] gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide"
              style={{ color: theme.sidebar.textSecondary, borderBottom: `1px solid ${theme.sidebar.border}` }}
            >
              <span>Name</span>
              <span>Email</span>
              <span>Role</span>
              <span aria-hidden="true" />
            </div>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                groupId={groupId}
                groupName={groupName}
                isAdmin={isAdmin}
                isSelf={user?.id === m.id}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        )}
      </div>
      <InviteDialog
        groupId={groupId}
        groupName={groupName}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
