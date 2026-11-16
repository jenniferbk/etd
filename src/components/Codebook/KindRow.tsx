import { useState } from 'react';
import type { CodebookKind, KindType } from '../../data/types';
import { friendlyError } from '../../api/friendlyError';

type Patch = { label?: string; category?: string; type?: KindType; status?: 'active' | 'retired' };

interface KindRowProps {
  kind: CodebookKind;
  /** Name of the survivor, for a merged kind. */
  mergedIntoLabel?: string;
  categories: string[];
  onPatch: (patch: Patch) => Promise<void>;
  onMerge: () => void;
  /** Coded moves currently showing this kind, or null when unknown. */
  countMoves: () => Promise<number | null>;
}

const btn = 'rounded-md px-2! py-1! text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)]';
const field = 'rounded-md border border-[var(--border)] bg-white! px-1.5! py-1! text-[13px] text-[var(--text)]';

export function KindRow({ kind, mergedIntoLabel, categories, onPatch, onMerge, countMoves }: KindRowProps) {
  const [mode, setMode] = useState<'view' | 'rename' | 'category' | 'type'>('view');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveCount, setMoveCount] = useState<number | null | 'loading'>('loading');

  const merged = kind.mergedInto !== undefined;
  const retired = kind.status === 'retired';

  const run = async (patch: Patch): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await onPatch(patch);
      setMode('view');
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const start = (m: 'rename' | 'category' | 'type') => {
    setError(null);
    setDraft(m === 'rename' ? kind.label : m === 'category' ? kind.category : kind.type);
    setMode(m);
    if (m === 'type') {
      setMoveCount('loading');
      void countMoves().then(setMoveCount);
    }
  };

  const otherType: KindType = kind.type === 'question' ? 'other' : 'question';
  const typeName = (t: KindType) => (t === 'question' ? 'Question' : 'Other');

  return (
    <li className="px-3! py-2!" data-kind-id={kind.id}>
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'rename' ? (
          <input
            autoFocus
            aria-label={`Rename ${kind.label}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) void run({ label: draft.trim() });
              if (e.key === 'Escape') setMode('view');
            }}
            className={`${field} min-w-48`}
          />
        ) : (
          <span className={`text-sm font-medium ${retired ? 'text-[var(--text-secondary)]' : 'text-[var(--text)]'}`}>{kind.label}</span>
        )}
        {mode === 'category' ? (
          <>
            <input
              autoFocus
              list={`cats-${kind.id}`}
              aria-label={`Category for ${kind.label}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) void run({ category: draft.trim() });
                if (e.key === 'Escape') setMode('view');
              }}
              className={field}
            />
            <datalist id={`cats-${kind.id}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">{kind.category}</span>
        )}
        {merged && <span className="text-xs italic text-[var(--text-secondary)]">merged into {mergedIntoLabel ?? kind.mergedInto}.</span>}
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {(mode === 'rename' || mode === 'category') ? (
            <>
              <button className={btn} disabled={busy || !draft.trim()} onClick={() => void run(mode === 'rename' ? { label: draft.trim() } : { category: draft.trim() })}>Save</button>
              <button className={btn} onClick={() => setMode('view')}>Cancel</button>
            </>
          ) : (
            <>
              <button className={btn} onClick={() => start('rename')}>Rename</button>
              <button className={btn} onClick={() => start('category')}>Category</button>
              {!merged && <button className={btn} onClick={() => start('type')}>Type</button>}
              {!merged && !retired && <button className={btn} onClick={onMerge}>Merge into…</button>}
              {!merged && (
                <button className={btn} disabled={busy} onClick={() => void run({ status: retired ? 'active' : 'retired' })}>
                  {retired ? 'Reactivate' : 'Retire'}
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {mode === 'type' && (
        <div className="mt-2! rounded-md bg-[var(--hover-bg)] p-2! text-[13px] text-[var(--text)]">
          <p>
            Change type from {typeName(kind.type)} to {typeName(otherType)}?{' '}
            {moveCount === 'loading'
              ? ''
              : moveCount === null
                ? "Coded moves will show a kind that doesn't match their type."
                : `${moveCount} coded move${moveCount === 1 ? '' : 's'} will show a kind that doesn't match their type.`}
          </p>
          <div className="mt-1.5! flex gap-1">
            <button className={btn} disabled={busy} onClick={() => void run({ type: otherType })}>Change type</button>
            <button className={btn} onClick={() => setMode('view')}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1! text-xs text-red-700">{error}</p>}
    </li>
  );
}
