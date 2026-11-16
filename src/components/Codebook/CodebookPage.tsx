import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { LiveDoc } from '../../live/ops';
import type { CodebookKind, KindType } from '../../data/types';
import { useCodebookStore } from '../../store/codebookStore';
import { CodebookLog } from './CodebookLog';
import { KindRow } from './KindRow';
import { MergeDialog } from './MergeDialog';

interface GroupDataDiagram { snapshot: LiveDoc }

const SECTIONS: { type: KindType; title: string }[] = [
  { type: 'question', title: 'Questions' },
  { type: 'other', title: 'Other' },
];
const field = 'rounded-md border border-[var(--border)] bg-white! px-2! py-1! text-[13px] text-[var(--text)]';

/** The group's codebook: kinds by type then category, with a change log. */
export function CodebookPage({ groupId }: { groupId: number }) {
  const codebook = useCodebookStore((s) => s.byGroup[groupId]);
  const { addKind, updateKind, mergeKind } = useCodebookStore.getState();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [mergeFrom, setMergeFrom] = useState<CodebookKind | null>(null);
  const diagramsRef = useRef<Promise<GroupDataDiagram[] | null> | null>(null);

  // Library data is fetched once per group; used to seed the codebook on first
  // use and to count coded moves for the change-type warning.
  const loadDiagrams = useCallback((): Promise<GroupDataDiagram[] | null> => {
    diagramsRef.current ??= api<{ diagrams: GroupDataDiagram[] }>(`/api/groups/${groupId}/data`)
      .then((r) => r.diagrams)
      .catch(() => null);
    return diagramsRef.current;
  }, [groupId]);

  useEffect(() => {
    let cancelled = false;
    diagramsRef.current = null;
    setLoadError(null);
    void (async () => {
      const diagrams = await loadDiagrams();
      try {
        await useCodebookStore.getState().ensure(groupId, (diagrams ?? []).map((d) => d.snapshot));
        if (!cancelled) setVersion((v) => v + 1);
      } catch (err) {
        if (!cancelled) setLoadError(friendlyError(err));
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, loadDiagrams]);

  const kinds = useMemo(() => [...(codebook?.kinds ?? [])].sort((a, b) => a.position - b.position), [codebook]);
  const categories = useMemo(() => [...new Set(kinds.map((k) => k.category))], [kinds]);
  const labelOf = (id: string | undefined) => kinds.find((k) => k.id === id)?.label;

  const countMoves = (kindId: string) => async (): Promise<number | null> => {
    const diagrams = await loadDiagrams();
    if (diagrams === null) return null;
    let n = 0;
    for (const d of diagrams) {
      for (const el of d.snapshot.elements ?? []) {
        if (el.type === 'support' && el.subtype === kindId) n++;
      }
    }
    return n;
  };

  const changed = () => setVersion((v) => v + 1);
  const patch = (k: CodebookKind) => async (p: Parameters<typeof updateKind>[2]) => {
    try { await updateKind(groupId, k.id, p); } catch (e) { throw new Error(friendlyError(e)); }
    changed();
  };

  const active = kinds.filter((k) => k.status === 'active' && k.mergedInto === undefined);
  const retired = kinds.filter((k) => k.status !== 'active' || k.mergedInto !== undefined);

  const renderRow = (k: CodebookKind) => (
    <KindRow
      key={k.id}
      kind={k}
      mergedIntoLabel={labelOf(k.mergedInto)}
      categories={categories}
      onPatch={patch(k)}
      onMerge={() => setMergeFrom(k)}
      countMoves={countMoves(k.id)}
    />
  );

  return (
    <div className="max-w-5xl w-full mx-auto px-6! py-8! flex-1 overflow-y-auto" data-group-id={groupId}>
      <h2 className="text-lg font-semibold text-[var(--text)]">Codebook</h2>
      {loadError && <p role="alert" className="mt-2! text-sm text-red-700">{loadError}</p>}
      {!codebook && !loadError && <p className="mt-2! text-sm text-[var(--text-secondary)]">Loading…</p>}

      {codebook && (
        <>
          <AddKind categories={categories} onAdd={async (b) => {
            try { await addKind(groupId, b); } catch (e) { throw new Error(friendlyError(e)); }
            changed();
          }} />

          {SECTIONS.map(({ type, title }) => {
            const ofType = active.filter((k) => k.type === type);
            const cats = [...new Set(ofType.map((k) => k.category))];
            return (
              <section key={type} aria-label={title} className="mt-6!">
                <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
                {ofType.length === 0 && <p className="mt-1! text-sm text-[var(--text-secondary)]">None yet.</p>}
                {cats.map((cat) => (
                  <div key={cat} className="mt-3!">
                    <h4 className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">{cat}</h4>
                    <ul className="mt-1! divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white">
                      {ofType.filter((k) => k.category === cat).map(renderRow)}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}

          {retired.length > 0 && (
            <details className="mt-6!">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">Retired ({retired.length})</summary>
              <ul className="mt-2! divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white">
                {retired.map(renderRow)}
              </ul>
            </details>
          )}
        </>
      )}

      <CodebookLog groupId={groupId} codebook={codebook} version={version} />

      <MergeDialog
        kind={mergeFrom}
        targets={mergeFrom ? active.filter((k) => k.type === mergeFrom.type && k.id !== mergeFrom.id) : []}
        onClose={() => setMergeFrom(null)}
        onMerge={async (into) => {
          if (!mergeFrom) return;
          try { await mergeKind(groupId, mergeFrom.id, into); } catch (e) { throw new Error(friendlyError(e)); }
          changed();
        }}
      />
    </div>
  );
}

function AddKind({ categories, onAdd }: {
  categories: string[];
  onAdd: (b: { label: string; category: string; type: KindType }) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<KindType>('question');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = label.trim() !== '' && category.trim() !== '';

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ label: label.trim(), category: category.trim(), type });
      setLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the kind.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-4! flex flex-wrap items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <label className="flex flex-col gap-1 text-xs normal-case! tracking-normal! font-normal! text-[var(--text-secondary)]!">
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${field} min-w-48`} />
      </label>
      <label className="flex flex-col gap-1 text-xs normal-case! tracking-normal! font-normal! text-[var(--text-secondary)]!">
        Category
        <input list="codebook-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={field} />
        <datalist id="codebook-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-xs normal-case! tracking-normal! font-normal! text-[var(--text-secondary)]!">
        Type
        <select value={type} onChange={(e) => setType(e.target.value as KindType)} className={field}>
          <option value="question">Question</option>
          <option value="other">Other</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={!ready || busy}
        className="rounded-md border border-[var(--border-strong)] px-3! py-1! text-[13px] font-medium text-[var(--text)] hover:bg-[var(--hover-bg)] disabled:opacity-40"
      >
        Add kind
      </button>
      {error && <p role="alert" className="basis-full text-sm text-red-700">{error}</p>}
    </form>
  );
}
