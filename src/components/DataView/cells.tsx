// In-place editors for the Data grid. Only the cell being edited mounts one,
// so a few thousand rows stay plain text.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CommitVia } from '../../data/cellCommit';
import { LocateFixed } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const editorClass =
  'block w-full rounded-sm border border-[var(--accent)]! bg-white! px-1! py-0.5! text-[12px] leading-[16px] text-[var(--text)] outline-none';

/** Text editor: commits on blur or Enter (Shift+Enter adds a line when
 *  multiline), cancels on Escape. */
export function TextEditor({
  initial,
  multiline,
  onCommit,
  onCancel,
}: {
  initial: string;
  multiline?: boolean;
  onCommit: (value: string, via: CommitVia) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = (via: CommitVia | 'escape') => {
    if (done.current) return;
    done.current = true;
    if (via === 'escape') onCancel();
    else onCommit(value, via);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish('escape');
    } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      finish('enter');
    }
  };

  if (multiline) {
    const rows = Math.min(8, Math.max(2, Math.ceil(value.length / 40) + value.split('\n').length - 1));
    return (
      <textarea
        ref={ref}
        className={`${editorClass} resize-none`}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish('blur')}
      />
    );
  }
  return (
    <input
      ref={ref}
      className={editorClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish('blur')}
    />
  );
}

/** Dropdown editor: opens its list right away where the browser allows,
 *  commits on change, and reports a blur or Escape without a change. */
export function SelectEditor({
  value,
  options,
  onCommit,
  onDismiss,
}: {
  value: string;
  options: SelectOption[];
  onCommit: (value: string) => void;
  onDismiss: (reason: 'blur' | 'escape') => void;
}) {
  const done = useRef(false);
  const ref = useRef<HTMLSelectElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.showPicker();
    } catch {
      // showPicker needs a user gesture or is unsupported; the focused select still opens on click or Space.
    }
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  return (
    <select
      ref={ref}
      className={editorClass}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        finish(() => onCommit(next));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(() => onDismiss('escape'));
        }
      }}
      onBlur={() => finish(() => onDismiss('blur'))}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Small button that selects the element on the canvas. */
export function OpenButton({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="ml-1! shrink-0 rounded-sm p-0.5! text-[var(--text-secondary)] opacity-40 hover:bg-[var(--hover)] hover:opacity-100 focus-visible:opacity-100"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <LocateFixed size={12} />
    </button>
  );
}
