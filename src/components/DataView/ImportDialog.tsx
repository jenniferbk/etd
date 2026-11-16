import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { theme } from '../../utils/theme';
import { api, ApiError } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useToastStore } from '../../store/toastStore';
import { editsToOps } from '../../data/edits';
import type { LiveDoc, Op } from '../../live/ops';
import type { Codebook } from '../../data/types';
import {
  NotAnExportError, planImport, planToEdits, readExportWorkbook, type ImportPlan, type ReadWorkbook,
} from '../../data/xlsx/importWorkbook';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
  codebook: Codebook;
  /** Called after any diagram was written, so the grid shows the result. */
  onApplied: () => Promise<void>;
}

interface Loaded {
  fileName: string;
  read: ReadWorkbook;
  plan: ImportPlan;
  docs: Map<number, LiveDoc>;
}

interface ApplyResult {
  results: { diagramId: number; versionId: number }[];
  failed?: { diagramId: number; error: string }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summaryLine(plan: ImportPlan): string {
  const { movesRecoded, diagrams, episodeFields } = plan.summary;
  return [
    `${plural(movesRecoded, 'move')} recoded in ${plural(diagrams, 'diagram')}`,
    plural(episodeFields, 'episode field'),
    plural(plan.conflicts.length, 'conflict'),
    `${plan.skipped.length} skipped`,
  ].join(' · ');
}

const btn = 'px-4! py-2! text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = { backgroundColor: theme.button.secondary.bg, color: theme.button.secondary.text, border: `1px solid ${theme.button.secondary.border}` };
const primary = { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };

function Section({ title, count, open, children }: { title: string; count: number; open?: boolean; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <details open={open} className="mt-3! rounded-md border border-[var(--border)]">
      <summary className="cursor-pointer px-3! py-2! text-sm font-medium text-[var(--text)]">
        {title} ({count})
      </summary>
      <ul className="max-h-56 overflow-y-auto border-t border-[var(--border)] px-3! py-2! text-[13px] text-[var(--text-secondary)]">
        {children}
      </ul>
    </details>
  );
}

/** Import (spec §6.2): pick an exported workbook, preview, resolve conflicts, apply. */
export function ImportDialog({ open, onClose, groupId, codebook, onApplied }: ImportDialogProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | 'reading' | 'applying'>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [choices, setChoices] = useState<Map<string, 'diagram' | 'sheet'>>(new Map());
  const [failures, setFailures] = useState<string[] | null>(null);

  const reset = () => {
    setBusy(null);
    setError(null);
    setLoaded(null);
    setChoices(new Map());
    setFailures(null);
  };
  const finish = () => {
    reset();
    if (fileInput.current) fileInput.current.value = '';
    onClose();
  };
  const close = () => {
    if (busy !== 'applying') finish();
  };

  const choose = (key: string) => choices.get(key) ?? 'diagram';
  const edits = useMemo(() => (loaded ? planToEdits(loaded.plan, (k) => choices.get(k) ?? 'diagram') : new Map()), [loaded, choices]);
  const editCount = [...edits.values()].reduce((n, l) => n + l.length, 0);

  const pick = async (file: File) => {
    reset();
    setBusy('reading');
    try {
      const read = await readExportWorkbook(await file.arrayBuffer());
      if (read.groupId !== groupId) {
        setError('This file was exported from another group.');
        return;
      }
      // Always plan against the diagrams as they are now, not the grid's copy.
      const res = await api<{ diagrams: { id: number; snapshot: LiveDoc }[] }>(`/api/groups/${groupId}/data`);
      const docs = new Map(res.diagrams.map((d) => [d.id, d.snapshot]));
      setLoaded({ fileName: file.name, read, plan: planImport(read, docs, codebook), docs });
    } catch (err) {
      // Workbook problems carry a plain message; network and server errors go through friendlyError.
      const own = err instanceof NotAnExportError || (err instanceof Error && !(err instanceof ApiError) && !(err instanceof TypeError));
      setError(own ? (err as Error).message : friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!loaded || editCount === 0) return;
    setBusy('applying');
    setError(null);
    const name = (id: number) => {
      const n = loaded.docs.get(id)?.name;
      return typeof n === 'string' && n ? n : `Diagram ${id}`;
    };
    const body: { diagramId: number; ops: Op[] }[] = [];
    for (const [diagramId, list] of edits) {
      const doc = loaded.docs.get(diagramId);
      if (!doc) continue;
      const ops = editsToOps(list, doc);
      if (ops.length) body.push({ diagramId, ops });
    }
    let result: ApplyResult | null = null;
    try {
      result = await api<ApplyResult>(`/api/groups/${groupId}/data/apply`, {
        method: 'POST',
        body: { label: `Import from ${loaded.fileName}`.slice(0, 200), edits: body },
      });
    } catch (err) {
      const b = err instanceof ApiError ? (err.body as Partial<ApplyResult> | undefined) : undefined;
      if (b && Array.isArray(b.failed)) result = { results: b.results ?? [], failed: b.failed };
      else {
        setError(friendlyError(err));
        setBusy(null);
        return;
      }
    }
    const failed = result.failed ?? [];
    if (result.results.length > 0) {
      try {
        await onApplied();
      } catch {
        // The write succeeded; a failed refresh shows on the grid's own error state.
      }
    }
    setBusy(null);
    const toast = useToastStore.getState().addToast;
    if (failed.length === 0) {
      toast('info', `Imported ${loaded.fileName}: ${plural(result.results.length, 'diagram')} updated.`);
      finish(); // `busy` in this closure is still 'applying', so not close()
      return;
    }
    const lines = failed.map((f) => `${name(f.diagramId)}: ${f.error}`);
    toast('error', `Import: ${plural(failed.length, 'diagram')} could not be updated.`);
    setFailures(lines);
  };

  const plan = loaded?.plan;
  const setAll = (v: 'diagram' | 'sheet') => setChoices(new Map((plan?.conflicts ?? []).map((c) => [c.key, v])));

  let footer: ReactNode;
  if (failures) {
    footer = <button onClick={close} data-modal-focus="primary" className={btn} style={secondary}>Close</button>;
  } else {
    footer = (
      <>
        <button onClick={close} disabled={busy === 'applying'} className={btn} style={secondary}>Cancel</button>
        {loaded && (
          <button
            onClick={() => void apply()}
            disabled={busy !== null || editCount === 0}
            data-modal-focus="primary"
            className={`${btn} font-medium`}
            style={primary}
          >
            {busy === 'applying' ? 'Applying…' : editCount === 0 ? 'Nothing to apply' : `Apply ${plural(editCount, 'change')}`}
          </button>
        )}
      </>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Import from Excel" size="lg" footer={footer} closeOnScrim={busy !== 'applying'}>
      <div className="px-5! py-4!">
        {!failures && (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Choose a workbook made by Export all. Only Clip, Status, SG/WC, Discipline, and each move’s Type and Kind are read,
              and only cells you changed are written. Each diagram gets one labeled version you can restore from History.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Workbook to import"
              disabled={busy !== null}
              className="mt-3! text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pick(f);
              }}
            />
          </>
        )}
        {busy === 'reading' && <p className="mt-3! text-sm text-[var(--text-secondary)]">Reading the workbook…</p>}
        {error && <p role="alert" className="mt-3! text-sm text-red-700">{error}</p>}

        {failures && (
          <div role="alert">
            <p className="text-sm text-[var(--text)]">
              Some diagrams were not updated. The others were saved; you can import the same file again to retry, since cells
              already written now match the diagram.
            </p>
            <ul className="mt-2! list-disc pl-5! text-[13px] text-red-700">
              {failures.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}

        {plan && loaded && !failures && (
          <div className="mt-4!">
            <p className="text-sm font-medium text-[var(--text)]">{summaryLine(plan)}</p>
            {loaded.read.exportedAt && (
              <p className="text-xs text-[var(--text-secondary)]">
                {loaded.fileName} · exported {new Date(loaded.read.exportedAt).toLocaleString()}
              </p>
            )}
            <Section title="Conflicts: changed in the diagram since the export" count={plan.conflicts.length} open>
              <li className="mb-2! flex gap-2">
                <button type="button" className="rounded border border-[var(--border)] bg-white! px-2! py-0.5! text-xs" onClick={() => setAll('diagram')}>
                  Keep all diagram values
                </button>
                <button type="button" className="rounded border border-[var(--border)] bg-white! px-2! py-0.5! text-xs" onClick={() => setAll('sheet')}>
                  Use all sheet values
                </button>
              </li>
              {plan.conflicts.map((c) => (
                <li key={c.key} className="border-t border-[var(--border)] py-1.5!">
                  <div className="text-[var(--text)]">{c.describe}</div>
                  <div className="mt-0.5! flex flex-wrap gap-x-4">
                    {(['diagram', 'sheet'] as const).map((v) => (
                      <label key={v} className="inline-flex items-center gap-1 text-[13px]! font-normal! tracking-normal! normal-case! text-[var(--text-secondary)]!">
                        <input
                          type="radio"
                          name={`conflict-${c.key}`}
                          checked={choose(c.key) === v}
                          onChange={() => setChoices((m) => new Map(m).set(c.key, v))}
                        />
                        {v === 'diagram' ? `Keep the diagram’s value (${c.diagramValue})` : 'Use the sheet’s value'}
                      </label>
                    ))}
                  </div>
                  {c.dependsOn && c.dependsOn !== c.key && (
                    <div className="text-xs">Applies only if the Type change on this row is used too.</div>
                  )}
                </li>
              ))}
            </Section>
            <Section title="Changes" count={plan.changes.length}>
              {plan.changes.map((c, i) => (
                <li key={i} className="py-0.5!">
                  {c.describe}
                  {c.dependsOn && <span className="text-xs"> (only if the Type change on this row is used)</span>}
                </li>
              ))}
            </Section>
            <Section title="Skipped" count={plan.skipped.length} open={plan.changes.length === 0 && plan.conflicts.length === 0}>
              {plan.skipped.map((s, i) => <li key={i} className="py-0.5!">{s.describe}</li>)}
            </Section>
            {plan.changes.length === 0 && plan.conflicts.length === 0 && plan.skipped.length === 0 && (
              <p className="mt-3! text-sm text-[var(--text-secondary)]">No cells were changed in this file.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
