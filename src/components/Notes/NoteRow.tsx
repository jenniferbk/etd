import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';
import { DETACHED_LABEL, type ResolvedAnchor } from '../../utils/noteAnchors';
import type { AnalyticNote } from '../../types';

interface NoteRowProps {
  note: AnalyticNote;
  resolved: ResolvedAnchor;
  onSelectAnchor: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}

export function NoteRow({ note, resolved, onSelectAnchor, onSave, onDelete }: NoteRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const startEdit = () => {
    setDraft(note.text);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    const t = draft.trim();
    if (t && t !== note.text) onSave(t);
    setEditing(false);
  };

  const meta = [note.author, `${relativeTime(note.createdAt)}${note.updatedAt ? ' · edited' : ''}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="group px-4 py-3 border-b"
      style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.surface }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        {resolved.status === 'attached' ? (
          <button
            type="button"
            onClick={onSelectAnchor}
            title="Select on canvas"
            className="text-[11px] font-medium px-1.5 py-0.5 rounded truncate max-w-[70%]"
            style={{ backgroundColor: theme.sidebar.surfaceActive, color: theme.sidebar.text }}
          >
            {resolved.label}
          </button>
        ) : (
          <span className="text-[11px] italic truncate" style={{ color: theme.sidebar.textSecondary }}>
            {resolved.status === 'detached' ? DETACHED_LABEL : 'General'}
          </span>
        )}
        {!editing && (
          <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button type="button" onClick={startEdit} aria-label="Edit note" className="p-1 rounded" style={{ color: theme.sidebar.textSecondary }}>
              <Pencil size={13} />
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete note" className="p-1 rounded" style={{ color: theme.danger.fg }}>
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            rows={3}
            aria-label="Edit note text"
            className="w-full text-sm rounded-md px-2.5 py-2 resize-y border"
            style={{ backgroundColor: theme.input.bg, borderColor: theme.input.border, color: theme.input.text }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="px-2.5 py-1 text-xs rounded-md border"
              style={{ borderColor: theme.button.secondary.border, color: theme.button.secondary.text, backgroundColor: theme.button.secondary.bg }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="px-2.5 py-1 text-xs rounded-md"
              style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words" style={{ color: theme.sidebar.text }}>
          {note.text}
        </p>
      )}

      <div className="text-[11px] mt-1" style={{ color: theme.sidebar.textSecondary }}>{meta}</div>
    </div>
  );
}
