import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { TrashListItem } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';

interface TrashPageProps {
  groupId: number;
}

/** Workspace Trash tab — diagrams moved to the trash from their card menu.
 *  Any group member can restore; only group/site admins can delete forever
 *  (the server enforces both rules).
 *
 *  Data logic (requestSeq stale-response guard) mirrors PeoplePage. */
export function TrashPage({ groupId }: TrashPageProps) {
  const user = useAuthStore((s) => s.user);
  const groups = useAuthStore((s) => s.groups);
  const [items, setItems] = useState<TrashListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const requestSeq = useRef(0);

  const isAdmin = !!user && (user.isSiteAdmin || groups.find((g) => g.id === groupId)?.role === 'admin');

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    setItems(null);
    setLoadError(false);
    try {
      const result = await api<TrashListItem[]>(`/api/groups/${groupId}/trash`);
      if (seq === requestSeq.current) setItems(result);
    } catch (err) {
      if (seq === requestSeq.current) {
        useToastStore.getState().addToast('error', friendlyError(err));
        setItems([]);
        setLoadError(true);
      }
    }
  }, [groupId]);

  useEffect(() => {
    void (async () => { await refresh(); })();
  }, [refresh]);

  const handleRestore = async (item: TrashListItem) => {
    setBusyId(item.id);
    try {
      await api(`/api/diagrams/${item.id}/restore`, { method: 'POST' });
      useToastStore.getState().addToast('info', `Restored "${item.title}" to Diagrams.`);
      await refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteForever = async (item: TrashListItem) => {
    const ok = await confirmAsync({
      title: 'Delete forever',
      message: `Permanently delete "${item.title}" and all ${item.versionCount} of its versions? This can't be undone.`,
      confirmLabel: 'Delete forever',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await api(`/api/diagrams/${item.id}/permanent`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
      <div className="mb-6">
        <h2 className="text-base font-semibold" style={{ color: theme.sidebar.text }}>
          Trash
        </h2>
        <p className="text-sm mt-1" style={{ color: theme.sidebar.textSecondary }}>
          Deleted diagrams stay here until a group admin deletes them forever. Anyone in the group can restore them.
        </p>
      </div>

      {items === null ? (
        <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
          Loading the trash…
        </p>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
            Something went wrong loading the trash.
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
      ) : items.length === 0 ? (
        <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
          The trash is empty.
        </p>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: theme.sidebar.surface, borderColor: theme.sidebar.border, boxShadow: theme.shadow.sm }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-4 px-4 py-3"
              style={i > 0 ? { borderTop: `1px solid ${theme.sidebar.border}` } : undefined}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: theme.sidebar.text }}>
                  {item.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: theme.sidebar.textSecondary }}>
                  deleted{item.deletedBy ? ` by ${item.deletedBy}` : ''} · {relativeTime(item.deletedAt)}
                  {' · '}{item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'}
                </p>
              </div>
              <button
                onClick={() => void handleRestore(item)}
                disabled={busyId === item.id}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={secondaryButtonStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
              >
                Restore
              </button>
              {isAdmin && (
                <button
                  onClick={() => void handleDeleteForever(item)}
                  disabled={busyId === item.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ color: theme.danger.fg }}
                >
                  Delete forever
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
