import { describe, it, expect, vi } from 'vitest';
import type { Codebook, CodebookKind } from './types';
import type { StyleConfig, Subtype } from '../types/styleConfig';
import { createMirrorSync, type MirrorSyncDeps } from './mirrorSync';

const kind = (o: Partial<CodebookKind> & { id: string }): CodebookKind => ({
  label: o.id, category: 'cat', type: 'question', status: 'active', position: 0, ...o,
});
const cb = (kinds: CodebookKind[]): Codebook => ({ groupId: 1, kinds });
const sc = (question: Subtype[] = [], other: Subtype[] = []): StyleConfig =>
  ({ argumentTypes: {}, supportTypes: {}, subtypes: { question, other, action: [] } }) as unknown as StyleConfig;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** One simulated client: its own codebook copy and styleConfig. */
function client(initial: Codebook, styleConfig: StyleConfig, over: Partial<MirrorSyncDeps> = {}) {
  const state = { cb: initial as Codebook | undefined, sc: styleConfig, writes: 0, active: true };
  const deps: MirrorSyncDeps = {
    isActive: () => state.active,
    getCodebook: () => state.cb,
    getStyleConfig: () => state.sc,
    write: (next) => { state.sc = next; state.writes += 1; },
    refresh: vi.fn(async () => {}),
    ensure: vi.fn(async () => {}),
    ...over,
  };
  return { state, deps, sync: createMirrorSync(deps) };
}

describe('createMirrorSync', () => {
  it('mirrors on a local change and on a codebook change', () => {
    const c = client(cb([kind({ id: 'q1', label: 'Q1' })]), sc([{ id: 'q1', label: 'old' }]));
    c.sync.styleConfigChanged(false);
    expect(c.state.sc.subtypes.question[0].label).toBe('Q1');
    c.state.cb = cb([kind({ id: 'q1', label: 'Q one' })]);
    c.sync.codebookChanged();
    expect(c.state.sc.subtypes.question[0].label).toBe('Q one');
  });

  it('never writes once the canvas left the library diagram (local file, no group)', () => {
    const c = client(cb([kind({ id: 'q1', label: 'Q1' })]), sc([{ id: 'q1', label: 'local' }]));
    c.state.active = false;
    c.sync.styleConfigChanged(false);
    c.sync.codebookChanged();
    c.sync.styleConfigChanged(true);
    expect(c.state.writes).toBe(0);
    expect(c.deps.ensure).not.toHaveBeenCalled();
    expect(c.deps.refresh).not.toHaveBeenCalled();
  });

  it('does not re-mirror a remote styleConfig; refreshes the codebook instead', () => {
    const c = client(cb([kind({ id: 'q1', label: 'Stale' })]), sc([{ id: 'q1', label: 'Fresh', category: 'cat' }]));
    c.sync.styleConfigChanged(true);
    expect(c.state.writes).toBe(0);
    expect(c.deps.refresh).toHaveBeenCalledTimes(1);
  });

  it('a remote styleConfig that already matches the mirror triggers nothing', () => {
    const c = client(cb([kind({ id: 'q1', label: 'Q1' })]), sc([{ id: 'q1', label: 'Q1', category: 'cat' }]));
    c.sync.styleConfigChanged(true);
    expect(c.deps.refresh).not.toHaveBeenCalled();
    expect(c.state.writes).toBe(0);
  });

  it('asks ensure once per set of unknown ids', async () => {
    const c = client(cb([kind({ id: 'q1' })]), sc([{ id: 'q1', label: 'q1', category: 'cat' }, { id: 'custom', label: 'C' }]));
    c.sync.styleConfigChanged(false);
    c.sync.styleConfigChanged(true);
    await flush();
    expect(c.deps.ensure).toHaveBeenCalledTimes(1);
    expect(c.state.sc.subtypes.question.map((s) => s.id)).toEqual(['q1', 'custom']);
  });

  it('two clients with different codebooks converge in a bounded number of writes', async () => {
    let server = cb([kind({ id: 'q1', label: 'New label' }), kind({ id: 'q2', label: 'Q2' })]);
    const stale = cb([kind({ id: 'q1', label: 'Old label' })]);
    const start = sc([{ id: 'q1', label: 'Old label', category: 'cat' }]);
    const clients: ReturnType<typeof client>[] = [];
    let deliveries = 0;
    const deliver = (from: number) => {
      // Cap the simulated network so a ping-pong regression fails instead of hanging.
      if ((deliveries += 1) > 10) return;
      const to = clients[1 - from];
      to.state.sc = clients[from].state.sc;
      to.sync.styleConfigChanged(true);
    };
    for (const [i, initial] of [server, stale].entries()) {
      const c = client(initial, start, {
        write: (next) => { c.state.sc = next; c.state.writes += 1; queueMicrotask(() => deliver(i)); },
        refresh: async () => { c.state.cb = server; c.sync.codebookChanged(); },
      });
      clients.push(c);
    }
    // Client 0 (fresh codebook) mirrors after its load; client 1 is stale.
    clients[0].sync.styleConfigChanged(false);
    for (let i = 0; i < 20; i += 1) await flush();
    const total = clients[0].state.writes + clients[1].state.writes;
    expect(total).toBeLessThanOrEqual(2);
    expect(clients[1].state.sc).toEqual(clients[0].state.sc);
    expect(clients[1].state.sc.subtypes.question.map((s) => s.label)).toEqual(['New label', 'Q2']);
    // A codebook edit after convergence still settles.
    server = cb([kind({ id: 'q1', label: 'Newest' }), kind({ id: 'q2', label: 'Q2' })]);
    clients[0].state.cb = server;
    clients[0].sync.codebookChanged();
    for (let i = 0; i < 20; i += 1) await flush();
    expect(clients[0].state.writes + clients[1].state.writes).toBeLessThanOrEqual(total + 2);
    expect(clients[1].state.sc).toEqual(clients[0].state.sc);
  });
});
