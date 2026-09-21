import { useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { theme } from '../../utils/theme';
import type { NoteAnchor } from '../../types';

interface NoteComposerProps {
  /** Anchor a new note would attach to (the current single selection), or null. */
  selection: NoteAnchor | null;
  /** Human label for `selection` ("Claim 2"); null when there is no selection. */
  selectionLabel: string | null;
  onAdd: (text: string, anchor: NoteAnchor | undefined) => void;
}

export function NoteComposer({ selection, selectionLabel, onAdd }: NoteComposerProps) {
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);

  // A new selection resets the default back to "attach to it". Adjusted
  // during render (React's documented pattern for deriving state from a
  // prop change: https://react.dev/learn/you-might-not-need-an-effect) rather
  // than in a useEffect, so it doesn't trip react-hooks/set-state-in-effect.
  const selectionId = selection?.id ?? null;
  const [prevSelectionId, setPrevSelectionId] = useState(selectionId);
  if (selectionId !== prevSelectionId) {
    setPrevSelectionId(selectionId);
    setAttach(true);
  }

  const canAdd = text.trim().length > 0;
  const willAttach = attach && selection !== null;

  const submit = () => {
    if (!canAdd) return;
    onAdd(text.trim(), willAttach && selection ? selection : undefined);
    setText('');
  };

  return (
    <div className="px-4 py-3 border-b flex flex-col gap-2" style={{ borderColor: theme.sidebar.border }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        placeholder="Add an analytic note…"
        aria-label="New analytic note"
        className="w-full text-sm rounded-md px-2.5 py-2 resize-y border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.input.bg,
          borderColor: theme.input.border,
          color: theme.input.text,
          outlineColor: theme.focus.ring,
        }}
      />
      <div className="flex items-center justify-between gap-2">
        {selection && selectionLabel ? (
          <button
            type="button"
            onClick={() => setAttach((v) => !v)}
            aria-pressed={willAttach}
            title={willAttach ? 'Click to make this a general note' : 'Click to attach to the selection'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border max-w-[60%]"
            style={{
              borderColor: willAttach ? theme.sidebar.accent : theme.sidebar.border,
              backgroundColor: willAttach ? theme.sidebar.surfaceActive : theme.sidebar.surface,
              color: theme.sidebar.text,
            }}
          >
            {willAttach ? <Link2 size={12} /> : <Link2Off size={12} />}
            <span className="truncate">{willAttach ? `Attach to ${selectionLabel}` : 'General note'}</span>
          </button>
        ) : (
          <span className="text-xs" style={{ color: theme.sidebar.textSecondary }}>General note</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          title="Add note (⌘/Ctrl+Enter)"
          className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          Add note
        </button>
      </div>
    </div>
  );
}
