import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { theme } from '../../utils/theme';
import type { CodebookKind } from '../../data/types';

interface MergeDialogProps {
  kind: CodebookKind | null;
  /** Active kinds of the same type, excluding `kind`. */
  targets: CodebookKind[];
  onClose: () => void;
  /** Rejects with a message to show inline and keep the dialog open. */
  onMerge: (into: string) => Promise<void>;
}

export function MergeDialog({ kind, targets, onClose, onMerge }: MergeDialogProps) {
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind) { setInto(''); setError(null); }
  }, [kind]);

  const submit = async () => {
    if (!into || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMerge(into);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not merge.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={kind !== null}
      onClose={onClose}
      title={kind ? `Merge “${kind.label}” into…` : 'Merge'}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{ backgroundColor: theme.button.secondary.bg, color: theme.button.secondary.text, border: `1px solid ${theme.button.secondary.border}` }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!into || busy}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Merging…' : 'Merge'}
          </button>
        </>
      }
    >
      <div className="px-5! py-4!">
        <p className="text-sm text-[var(--text-secondary)]">
          Moves coded “{kind?.label}” will show the kind you pick. “{kind?.label}” is retired and can’t be reactivated.
        </p>
        {targets.length === 0 ? (
          <p className="mt-3! text-sm text-[var(--text)]">There is no other active kind of this type to merge into.</p>
        ) : (
          <ul className="mt-3! max-h-64 overflow-y-auto" role="radiogroup" aria-label="Merge into">
            {targets.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2 px-2! py-1.5! rounded-md text-sm normal-case! tracking-normal! font-normal! text-[var(--text)]! hover:bg-[var(--hover-bg)]">
                  <input type="radio" name="merge-into" checked={into === t.id} onChange={() => setInto(t.id)} />
                  <span>{t.label}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{t.category}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-3! text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
