import { useEffect, useState } from 'react';
import { getCodebookLog, type CodebookLogEntry } from '../../api/codebook';
import { friendlyError } from '../../api/friendlyError';
import type { Codebook, CodebookKind } from '../../data/types';

const FIELDS: (keyof CodebookKind)[] = ['label', 'category', 'type', 'status'];

function asKind(v: unknown): Partial<CodebookKind> | null {
  return v !== null && typeof v === 'object' ? (v as Partial<CodebookKind>) : null;
}

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS". */
function formatWhen(at: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function describeEntry(e: CodebookLogEntry, cb: Codebook | undefined): string {
  const before = asKind(e.before);
  const after = asKind(e.after);
  const labelOf = (id: string | undefined) =>
    cb?.kinds.find((k) => k.id === id)?.label ?? id ?? 'unknown';
  const name = after?.label ?? before?.label ?? labelOf(e.kindId ?? undefined);
  switch (e.action) {
    case 'add':
      return `Added “${name}”${after?.category ? ` in ${after.category}` : ''}`;
    case 'merge':
      return `Merged “${name}” into “${labelOf(after?.mergedInto)}”`;
    case 'update': {
      const changes = FIELDS.filter((f) => before?.[f] !== after?.[f])
        .map((f) => `${f}: ${String(before?.[f])} → ${String(after?.[f])}`);
      return `Changed “${before?.label ?? name}” (${changes.join('; ') || 'no change'})`;
    }
    default: {
      const n = (e.after as { kinds?: unknown[] } | null)?.kinds?.length;
      return `Set up the codebook${n === undefined ? '' : ` with ${n} kind${n === 1 ? '' : 's'}`}`;
    }
  }
}

/** Newest first. `version` changes whenever the codebook does, to refetch. */
export function CodebookLog({ groupId, codebook, version }: { groupId: number; codebook: Codebook | undefined; version: number }) {
  const [entries, setEntries] = useState<CodebookLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await getCodebookLog(groupId);
        if (cancelled) return;
        setEntries(list);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, version]);

  return (
    <section aria-label="Change log" className="mt-10!">
      <h3 className="text-sm font-semibold text-[var(--text)]">Change log</h3>
      {error && <p role="alert" className="mt-2! text-sm text-red-700">{error}</p>}
      {entries?.length === 0 && <p className="mt-2! text-sm text-[var(--text-secondary)]">No changes yet.</p>}
      <ul className="mt-2! divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-white empty:hidden">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="px-3! py-2! text-sm text-[var(--text)]">
            <span className="font-medium">{e.user}</span>
            <span className="text-[var(--text-secondary)]"> · {formatWhen(e.at)} · </span>
            {describeEntry(e, codebook)}
          </li>
        ))}
      </ul>
    </section>
  );
}
