import { useEffect, useRef, useState } from 'react';
import { PanelRightClose, Send } from 'lucide-react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useToastStore } from '../../store/toastStore';
import { useCollabStore, type ChatMessage } from '../../live/collabStore';
import { relativeTime } from '../../utils/relativeTime';
import { theme } from '../../utils/theme';

/** Chat for the open library diagram. Messages are saved with the diagram,
 *  so a teammate who opens it later can read back. */
export function ChatPanel() {
  const diagramId = useCloudStore((s) => s.diagramId);
  const chat = useCollabStore((s) => s.chat);
  const loadedFor = useCollabStore((s) => s.chatLoadedFor);
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Opening the panel reads everything; keep it read while it stays open.
  useEffect(() => {
    useCollabStore.getState().markRead();
  }, [chat.length]);

  useEffect(() => {
    if (diagramId === null || loadedFor === diagramId) return;
    void api<ChatMessage[]>(`/api/diagrams/${diagramId}/chat`)
      .then((messages) => useCollabStore.getState().setChatHistory(diagramId, messages))
      .catch((err) => useToastStore.getState().addToast('error', friendlyError(err)));
  }, [diagramId, loadedFor]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || diagramId === null) return;
    setSending(true);
    try {
      const message = await api<ChatMessage>(`/api/diagrams/${diagramId}/chat`, { method: 'POST', body: { body } });
      useCollabStore.getState().receiveChat(message, true);
      setDraft('');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{ background: theme.sidebar.bgGradient, borderColor: theme.sidebar.border, pointerEvents: 'auto' }}
    >
      <div className="px-5 py-3 border-b flex items-center justify-between gap-2" style={{ borderColor: theme.sidebar.border }}>
        <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          Chat
        </h2>
        <button
          onClick={() => useCloudStore.getState().setChatOpen(false)}
          className="p-1 rounded transition-colors duration-150"
          title="Hide chat"
          aria-label="Hide chat"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ padding: '0.75rem 1rem' }} aria-live="polite">
        {chat.length === 0 ? (
          <p className="text-sm text-center mt-8" style={{ color: theme.sidebar.textSecondary }}>
            {loadedFor === diagramId ? 'No messages yet. Messages stay with this diagram.' : 'Loading…'}
          </p>
        ) : (
          chat.map((m) => {
            const mine = m.authorId === myId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className="text-[11px] mb-0.5" style={{ color: theme.sidebar.textSecondary }}>
                  {mine ? 'You' : m.author} · {relativeTime(m.createdAt)}
                </div>
                <div
                  className="rounded-lg text-sm whitespace-pre-wrap break-words max-w-[90%]"
                  style={{
                    padding: '0.375rem 0.625rem',
                    backgroundColor: mine ? theme.sidebar.surfaceActive : theme.sidebar.surface,
                    border: `1px solid ${theme.sidebar.border}`,
                    color: theme.sidebar.text,
                  }}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t flex items-end gap-2" style={{ borderColor: theme.sidebar.border, padding: '0.75rem' }}>
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line. Keep keys away from
              // canvas shortcuts (Delete, N, …).
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Message the group…"
            className="w-full text-sm border rounded-lg resize-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              padding: '0.5rem 0.625rem',
              backgroundColor: theme.input.bg,
              borderColor: theme.input.border,
              color: theme.input.text,
              outlineColor: theme.focus.ring,
            }}
          />
        </label>
        <button
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          aria-label="Send"
          title="Send (Enter)"
          className="rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ padding: '0.5rem', backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
