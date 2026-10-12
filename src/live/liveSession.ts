// One live-collaboration session: the open library diagram in this tab.
//
// Lifecycle: started when a signed-in user has a library diagram open on the
// canvas, stopped when they leave it. While running it
//   - streams the server's events (document, teammates' edits, presence),
//   - sends this tab's edits in small batches (one in flight at a time, so
//     the server sees them in the order they were made),
//   - drives the canvas header's save status: Saving… until the server has
//     both applied and autosaved this tab's edits, then Saved,
//   - reconnects with backoff, resending anything that was not confirmed.
import { api, ApiError, getServerUrl, getToken } from '../api/client';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';
import type { AnalyticNote, Connection, DiagramElement, Transcript } from '../types';
import type { StyleConfig } from '../types/styleConfig';
import { captureThumbnail } from '../utils/thumbnail';
import { generateUuid } from '../utils/uuid';
import type { LiveDoc, Op } from './ops';
import { usePresenceStore, type PresenceMember } from './presenceStore';
import { readEventStream } from './sse';
import { applyDocToStore, docFromState, docFromStore } from './storeBridge';
import { SyncEngine } from './syncEngine';

const SEND_DELAY_MS = 120;
const PRESENCE_DELAY_MS = 250;
const THUMBNAIL_EVERY_MS = 30_000;
const STALL_MS = 60_000; // server pings every 25 s
const BACKOFF_MS = [1000, 2000, 5000, 10_000];

let current: LiveSession | null = null;

/** The running session, if this tab has a library diagram open live. */
export function getLiveSession(): LiveSession | null {
  return current;
}

function setCurrent(session: LiveSession | null): void {
  current = session;
}

export class LiveSession {
  readonly diagramId: number;
  readonly clientId = generateUuid();
  private engine: SyncEngine | null = null;
  /** This tab's document, kept even while the canvas shows a past version. */
  private local: LiveDoc | null = null;
  private connected = false;
  private stopped = false;
  private sending = false;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbTimer: ReturnType<typeof setInterval> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private thumbDirty = false;
  private streamCtrl: AbortController | null = null;
  private attempt = 0;
  private lastEchoSeq = 0;
  private persistedSeq = 0;
  private unsubs: (() => void)[] = [];
  private wake: (() => void) | null = null;

  constructor(diagramId: number) {
    this.diagramId = diagramId;
  }

  start(): void {
    setCurrent(this);
    this.unsubs.push(
      useDiagramStore.subscribe((s, prev) => {
        if (s.selectedIds !== prev.selectedIds) this.schedulePresence();
        if (useCloudStore.getState().preview !== null || !this.engine) return;
        if (
          s.elements === prev.elements && s.connections === prev.connections && s.notes === prev.notes &&
          s.styleConfig === prev.styleConfig && s.transcript === prev.transcript && s.diagramName === prev.diagramName
        ) return;
        this.local = docFromState(s);
        this.thumbDirty = true;
        this.scheduleSend();
        this.updateStatus();
      }),
    );
    this.thumbTimer = setInterval(() => void this.sendThumbnail(), THUMBNAIL_EVERY_MS);
    void this.connectLoop();
  }

  /** Leave the session: send what is left (best effort), then disconnect. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.drain(3000);
    this.stopped = true;
    if (current === this) setCurrent(null);
    this.unsubs.forEach((u) => u());
    for (const t of [this.sendTimer, this.presenceTimer, this.stallTimer]) if (t) clearTimeout(t);
    if (this.thumbTimer) clearInterval(this.thumbTimer);
    void this.sendThumbnail();
    this.streamCtrl?.abort();
    this.wake?.();
    usePresenceStore.getState().reset();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Save (⌘S): wait for pending edits, then write a new version now. */
  async checkpoint(): Promise<boolean> {
    if (!this.connected) {
      this.reconnectNow();
      return false;
    }
    const drained = await this.drain(5000);
    if (!drained) return false;
    const res = await api<{ currentVersionId: number }>(`/api/diagrams/${this.diagramId}/checkpoint`, { method: 'POST' });
    useCloudStore.getState().setBaseVersionId(res.currentVersionId);
    this.persistedSeq = Math.max(this.persistedSeq, this.lastEchoSeq);
    this.updateStatus();
    return true;
  }

  /** "Back to current" after previewing a past version. */
  endPreview(): void {
    useCloudStore.getState().setPreview(null);
    if (this.local) this.replaceStore(this.local);
    useDiagramStore.temporal.getState().clear();
    this.updateStatus();
  }

  /** "Restore" while previewing: the canvas content becomes the live document. */
  async restorePreview(): Promise<boolean> {
    useCloudStore.getState().setPreview(null);
    this.local = docFromStore();
    this.scheduleSend(0);
    return this.checkpoint();
  }

  /** Skip the backoff wait (the offline banner's Try again). */
  reconnectNow(): void {
    this.attempt = 0;
    this.wake?.();
  }

  // ---- connection -----------------------------------------------------------

  private async connectLoop(): Promise<void> {
    while (!this.stopped) {
      this.streamCtrl = new AbortController();
      const url = `${getServerUrl()}/api/diagrams/${this.diagramId}/live?clientId=${encodeURIComponent(this.clientId)}`;
      try {
        this.armStallTimer();
        await readEventStream(
          url, getToken(), this.streamCtrl.signal,
          (f) => this.onFrame(f.event, f.data),
          () => this.armStallTimer(),
        );
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404, 410].includes(err.status)) {
          this.fatal(err.status);
          return;
        }
      }
      if (this.stopped) return;
      this.setConnected(false);
      const wait = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)];
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, wait);
        this.wake = () => { clearTimeout(t); resolve(); };
      });
      this.wake = null;
    }
  }

  private armStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => this.streamCtrl?.abort(), STALL_MS);
  }

  private setConnected(connected: boolean, color: string | null = usePresenceStore.getState().myColor): void {
    this.connected = connected;
    usePresenceStore.getState().setSelf(connected ? color : null, connected);
    if (!connected) usePresenceStore.getState().setOthers([]);
    this.updateStatus();
  }

  private fatalHandled = false;

  private fatal(status: number): void {
    if (this.fatalHandled) return;
    this.fatalHandled = true;
    this.connected = false;
    const message =
      status === 410 ? 'Someone moved this diagram to the trash — save your work as a new diagram, or restore the original from the Trash tab.'
      : status === 404 ? 'That diagram was removed from the library — save it as new.'
      : status === 403 ? 'You are no longer a member of this diagram’s group.'
      : 'Your session expired — sign in again to keep collaborating.';
    void this.stop();
    if (status === 410 || status === 404) {
      const c = useCloudStore.getState();
      c.clearCloudTarget();
      c.setAddToLibraryOpen(true);
    } else {
      useCloudStore.getState().setStatus('offline');
    }
    useToastStore.getState().addToast('info', message);
  }

  // ---- incoming -----------------------------------------------------------

  private onFrame(event: string, raw: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (event) {
      case 'hello': return this.onHello(data);
      case 'reset': return this.onReset(data.doc as LiveDoc, data.currentVersionId as number, data.seq as number);
      case 'ops': return this.onOps(data as unknown as { seq: number; clientId: string; batchId: string; ops: Op[] });
      case 'persisted':
        this.persistedSeq = data.seq as number;
        useCloudStore.getState().setBaseVersionId(data.currentVersionId as number);
        this.updateStatus();
        return;
      case 'presence': {
        const members = (data.members as PresenceMember[]).filter((m) => m.clientId !== this.clientId);
        usePresenceStore.getState().setOthers(members);
        return;
      }
      case 'gone':
        this.fatal(410);
        return;
    }
  }

  private onHello(data: Record<string, unknown>): void {
    const doc = data.doc as LiveDoc;
    const you = data.you as { color: string };
    this.attempt = 0;
    this.persistedSeq = data.persistedSeq as number;
    this.lastEchoSeq = Math.min(this.lastEchoSeq, this.persistedSeq);
    useCloudStore.getState().setBaseVersionId(data.currentVersionId as number);
    if (!this.engine) {
      // First contact: show exactly the server's document (it can be a beat
      // newer than what the gallery fetched). The title in the store came
      // from the diagrams table, which wins over a stale embedded name.
      const name = useDiagramStore.getState().diagramName;
      this.engine = new SyncEngine(this.clientId, doc);
      this.loadIntoStore(doc, name);
      // loadDiagram normalizes (migrations, sizes, title); send that back.
      this.local = docFromStore();
      useDiagramStore.temporal.getState().clear();
    } else {
      this.onReset(doc, data.currentVersionId as number, data.seq as number);
    }
    this.setConnected(true, you.color);
    this.scheduleSend(0);
    this.schedulePresence();
  }

  private onReset(doc: LiveDoc, currentVersionId: number, seq: number): void {
    if (!this.engine || !this.local) return;
    this.local = this.engine.reset(doc, this.local);
    this.persistedSeq = Math.max(this.persistedSeq, seq);
    useCloudStore.getState().setBaseVersionId(currentVersionId);
    if (useCloudStore.getState().preview === null) applyDocToStore(this.local);
    this.scheduleSend(0);
    this.updateStatus();
  }

  private onOps(ev: { seq: number; clientId: string; batchId: string; ops: Op[] }): void {
    if (!this.engine || !this.local) return;
    const next = this.engine.receive(ev, this.local);
    if (ev.clientId === this.clientId) this.lastEchoSeq = ev.seq;
    if (next) {
      this.local = next;
      if (useCloudStore.getState().preview === null) applyDocToStore(next);
    }
    this.updateStatus();
  }

  // ---- outgoing -----------------------------------------------------------

  private scheduleSend(delay = SEND_DELAY_MS): void {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      void this.sendNext();
    }, delay);
  }

  private async sendNext(): Promise<void> {
    if (!this.connected || this.sending || !this.engine || !this.local || this.stopped) return;
    const batch = this.engine.takeBatch(this.local);
    if (!batch) {
      this.updateStatus();
      return;
    }
    this.sending = true;
    this.updateStatus();
    try {
      await api(`/api/diagrams/${this.diagramId}/live/ops`, {
        method: 'POST',
        body: { clientId: this.clientId, batchId: batch.batchId, ops: batch.ops },
      });
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404, 410].includes(err.status)) {
        this.fatal(err.status);
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        // The server refused the batch as malformed. Resending would fail the
        // same way, so resync from the server's copy instead.
        useToastStore.getState().addToast('error', 'An edit could not be synced and was undone. Please redo it.');
      }
      // Reconnecting resets from the server's document and resends whatever
      // was not confirmed.
      this.streamCtrl?.abort();
      return;
    } finally {
      this.sending = false;
    }
    if (this.engine.unsent(this.local).length > 0) this.scheduleSend(0);
  }

  /** Wait until every local edit has been applied by the server. */
  private async drain(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.engine && this.local && this.engine.hasPending(this.local)) {
      if (!this.connected || Date.now() > deadline) return false;
      if (this.sendTimer) {
        clearTimeout(this.sendTimer);
        this.sendTimer = null;
      }
      await this.sendNext();
      await new Promise((r) => setTimeout(r, 50));
    }
    return true;
  }

  private schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      if (!this.connected || this.stopped) return;
      const selectedIds = useDiagramStore.getState().selectedIds;
      void api(`/api/diagrams/${this.diagramId}/live/presence`, {
        method: 'POST', body: { clientId: this.clientId, selectedIds },
      }).catch(() => undefined);
    }, PRESENCE_DELAY_MS);
  }

  private async sendThumbnail(): Promise<void> {
    if (!this.thumbDirty || useCloudStore.getState().preview !== null) return;
    const thumbnail = captureThumbnail();
    if (!thumbnail) return;
    this.thumbDirty = false;
    try {
      await api(`/api/diagrams/${this.diagramId}/thumbnail`, { method: 'PUT', body: { thumbnail } });
    } catch {
      this.thumbDirty = true;
    }
  }

  // ---- helpers ------------------------------------------------------------

  private updateStatus(): void {
    if (this.stopped) return;
    const cloud = useCloudStore.getState();
    if (cloud.diagramId !== this.diagramId) return;
    let status: 'saved' | 'saving' | 'offline';
    if (!this.connected) status = 'offline';
    else if (
      this.sending || (this.engine && this.local && this.engine.hasPending(this.local)) ||
      this.lastEchoSeq > this.persistedSeq
    ) status = 'saving';
    else status = 'saved';
    if (cloud.status !== status) cloud.setStatus(status);
  }

  private loadIntoStore(doc: LiveDoc, name?: string): void {
    const temporal = useDiagramStore.temporal.getState();
    temporal.pause();
    try {
      useDiagramStore.getState().loadDiagram(
        doc.elements as unknown as DiagramElement[],
        doc.connections as unknown as Connection[],
        name ?? (typeof doc.name === 'string' ? doc.name : undefined),
        (doc.transcript ?? null) as Transcript | null,
        doc.styleConfig as StyleConfig | undefined,
        doc.notes as unknown as AnalyticNote[],
      );
    } finally {
      temporal.resume();
    }
  }

  private replaceStore(doc: LiveDoc): void {
    const temporal = useDiagramStore.temporal.getState();
    temporal.pause();
    try {
      applyDocToStore(doc);
    } finally {
      temporal.resume();
    }
  }
}
