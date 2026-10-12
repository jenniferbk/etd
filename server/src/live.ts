// Real-time collaboration rooms.
//
// One Room per diagram that someone has open. The room holds the live
// document in memory, applies edit batches in arrival order (that order is
// the truth every client converges to), streams every batch to every open
// client over Server-Sent Events, and autosaves to SQLite shortly after
// edits stop. Autosaves within one editing window update a single version
// row so history stays readable; Save (⌘S) always writes a new version.
import type { Response } from 'express';
import type { Db } from './db.js';
import type { SessionUser } from './auth.js';
import { packSnapshot, unpackSnapshot } from './snapshots.js';
import { applyOps, danglingConnectionOps, toLiveDoc, type LiveDoc, type Op } from './liveOps.js';

export interface LiveOptions {
  /** Autosave this long after the last edit. */
  flushDelayMs?: number;
  /** ...but never let unsaved edits sit longer than this. */
  maxFlushDelayMs?: number;
  /** Autosaves within this window of the current auto version update it in place. */
  coalesceMinutes?: number;
  heartbeatMs?: number;
}

const DEFAULTS: Required<LiveOptions> = {
  flushDelayMs: 2000,
  maxFlushDelayMs: 10000,
  coalesceMinutes: 10,
  heartbeatMs: 25000,
};

// Distinct, readable on white; assigned round-robin per room.
const COLORS = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#42D4F4', '#F032E6', '#9A6324'];

interface Client {
  clientId: string;
  user: SessionUser;
  color: string;
  selectedIds: string[];
  res: Response;
}

export interface PresenceMember {
  clientId: string;
  userId: number;
  name: string;
  color: string;
  selectedIds: string[];
}

class Room {
  doc: LiveDoc;
  seq = 0;
  persistedSeq = 0;
  currentVersionId: number;
  clients = new Map<string, Client>();
  lastEditorId: number | null = null;
  private colorIndex = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private firstUnflushedAt: number | null = null;
  readonly diagramId: number;
  private readonly mgr: LiveRooms;

  constructor(mgr: LiveRooms, diagramId: number, doc: LiveDoc, currentVersionId: number) {
    this.mgr = mgr;
    this.diagramId = diagramId;
    this.doc = doc;
    this.currentVersionId = currentVersionId;
  }

  nextColor(): string {
    return COLORS[this.colorIndex++ % COLORS.length];
  }

  members(): PresenceMember[] {
    return [...this.clients.values()].map((c) => ({
      clientId: c.clientId, userId: c.user.id, name: c.user.displayName, color: c.color, selectedIds: c.selectedIds,
    }));
  }

  send(event: string, data: unknown, only?: Client): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of only ? [only] : this.clients.values()) c.res.write(frame);
  }

  broadcastPresence(): void {
    this.send('presence', { members: this.members() });
  }

  /** Apply a batch, broadcast it, and schedule an autosave. */
  apply(clientId: string, batchId: string, ops: Op[], user: SessionUser): number {
    this.doc = applyOps(this.doc, ops);
    this.seq += 1;
    this.lastEditorId = user.id;
    this.send('ops', { seq: this.seq, clientId, batchId, ops, author: user.displayName });
    // Keep the document consistent: drop arrows whose ends were deleted by
    // someone else. Sent as the server's own batch so clients converge.
    const cleanup = danglingConnectionOps(this.doc);
    if (cleanup.length > 0) {
      this.doc = applyOps(this.doc, cleanup);
      this.seq += 1;
      this.send('ops', { seq: this.seq, clientId: 'server', batchId: `server:${this.seq}`, ops: cleanup });
    }
    this.scheduleFlush();
    return this.seq;
  }

  /** Replace the whole document (a classic full save, or a restore). */
  replace(doc: LiveDoc, currentVersionId: number): void {
    this.doc = doc;
    this.seq += 1;
    this.currentVersionId = currentVersionId;
    this.persistedSeq = this.seq;
    this.cancelFlush();
    this.send('reset', { seq: this.seq, doc: this.doc, currentVersionId });
  }

  scheduleFlush(): void {
    const { flushDelayMs, maxFlushDelayMs } = this.mgr.opts;
    const now = Date.now();
    if (this.firstUnflushedAt === null) this.firstUnflushedAt = now;
    const wait = Math.max(0, Math.min(flushDelayMs, this.firstUnflushedAt + maxFlushDelayMs - now));
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), wait);
  }

  cancelFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.firstUnflushedAt = null;
  }

  get dirty(): boolean {
    return this.persistedSeq < this.seq;
  }

  /** Write the live document to SQLite. Manual saves always add a version. */
  flush({ manual = false, userId }: { manual?: boolean; userId?: number } = {}): number {
    this.cancelFlush();
    if (!this.dirty && !manual) return this.currentVersionId;
    const authorId = userId ?? this.lastEditorId;
    if (authorId === null) return this.currentVersionId;
    this.currentVersionId = this.mgr.persist(this.diagramId, this.doc, authorId, manual, this.currentVersionId);
    this.persistedSeq = this.seq;
    this.send('persisted', { seq: this.persistedSeq, currentVersionId: this.currentVersionId });
    return this.currentVersionId;
  }
}

export class LiveRooms {
  readonly opts: Required<LiveOptions>;
  private rooms = new Map<number, Room>();
  /** Highest batch number applied per "diagramId:clientId". Outlives rooms
   *  (a lone editor's room closes when their connection drops), so a
   *  reconnecting client never re-applies a batch. Lost on server restart. */
  private appliedBatches = new Map<string, number>();
  private readonly db: Db;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(db: Db, opts: LiveOptions = {}) {
    this.db = db;
    this.opts = { ...DEFAULTS, ...opts };
  }

  get(diagramId: number): Room | undefined {
    return this.rooms.get(diagramId);
  }

  private load(diagramId: number): Room {
    const existing = this.rooms.get(diagramId);
    if (existing) return existing;
    const row = this.db
      .prepare(
        `SELECT d.current_version_id AS versionId, v.snapshot_gz AS gz
         FROM diagrams d JOIN diagram_versions v ON v.id = d.current_version_id WHERE d.id = ?`,
      )
      .get(diagramId) as { versionId: number; gz: Buffer };
    const room = new Room(this, diagramId, toLiveDoc(unpackSnapshot(row.gz)), row.versionId);
    this.rooms.set(diagramId, room);
    this.startHeartbeat();
    return room;
  }

  /** Attach an SSE response to a diagram's room and send it the document. */
  subscribe(diagramId: number, clientId: string, user: SessionUser, res: Response): void {
    const room = this.load(diagramId);
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // A reconnect with the same clientId replaces the stale stream.
    room.clients.get(clientId)?.res.end();
    const client: Client = { clientId, user, color: room.nextColor(), selectedIds: [], res };
    room.clients.set(clientId, client);
    room.send('hello', {
      seq: room.seq,
      persistedSeq: room.persistedSeq,
      currentVersionId: room.currentVersionId,
      doc: room.doc,
      you: { clientId, color: client.color },
      lastBatchNo: this.appliedBatches.get(`${diagramId}:${clientId}`) ?? 0,
    }, client);
    room.broadcastPresence();
    res.on('close', () => {
      if (room.clients.get(clientId) !== client) return;
      room.clients.delete(clientId);
      if (room.clients.size === 0) {
        room.flush();
        this.rooms.delete(diagramId);
        this.stopHeartbeatIfIdle();
      } else {
        room.broadcastPresence();
      }
    });
  }

  /** Apply ops to a diagram. Loads the room if nobody has it open. Returns
   *  null for a batch number this client already had applied. */
  apply(
    diagramId: number, clientId: string, batchId: string, ops: Op[], user: SessionUser, batchNo?: number,
  ): number | null {
    const key = `${diagramId}:${clientId}`;
    if (batchNo !== undefined) {
      if (batchNo <= (this.appliedBatches.get(key) ?? 0)) return null;
      this.appliedBatches.delete(key); // re-insert: Map order = recency for pruning
      this.appliedBatches.set(key, batchNo);
      if (this.appliedBatches.size > 10_000) {
        this.appliedBatches.delete(this.appliedBatches.keys().next().value as string);
      }
    }
    const room = this.load(diagramId);
    const seq = room.apply(clientId, batchId, ops, user);
    if (room.clients.size === 0) {
      room.flush();
      this.rooms.delete(diagramId);
    }
    return seq;
  }

  setSelection(diagramId: number, clientId: string, selectedIds: string[]): boolean {
    const client = this.rooms.get(diagramId)?.clients.get(clientId);
    if (!client) return false;
    client.selectedIds = selectedIds;
    this.rooms.get(diagramId)!.broadcastPresence();
    return true;
  }

  /** Save now as a new version (⌘S). Returns the new version id, or null if no room. */
  checkpoint(diagramId: number, userId: number): number | null {
    const room = this.rooms.get(diagramId);
    if (!room) return null;
    return room.flush({ manual: true, userId });
  }

  /** A classic full-snapshot save landed while the room is open. */
  replaced(diagramId: number, snapshot: unknown, currentVersionId: number): void {
    this.rooms.get(diagramId)?.replace(toLiveDoc(snapshot), currentVersionId);
  }

  renamed(diagramId: number, title: string): void {
    const room = this.rooms.get(diagramId);
    if (!room) return;
    room.doc = { ...room.doc, name: title };
    room.seq += 1;
    room.send('ops', { seq: room.seq, clientId: 'server', batchId: `server:${room.seq}`, ops: [{ t: 'set', k: 'name', value: title }] });
    room.scheduleFlush();
  }

  /** The diagram was moved to the trash: save, tell everyone, close streams. */
  close(diagramId: number, reason: 'trashed'): void {
    const room = this.rooms.get(diagramId);
    if (!room) return;
    room.flush();
    room.send('gone', { reason });
    this.rooms.delete(diagramId);
    for (const c of room.clients.values()) c.res.end();
    this.stopHeartbeatIfIdle();
  }

  /** Flush every room (graceful shutdown). */
  flushAll(): void {
    for (const room of this.rooms.values()) room.flush();
  }

  /** Current live document, when a room is open. */
  liveDoc(diagramId: number): { doc: LiveDoc; currentVersionId: number } | null {
    const room = this.rooms.get(diagramId);
    return room ? { doc: room.doc, currentVersionId: room.currentVersionId } : null;
  }

  persist(diagramId: number, doc: LiveDoc, authorId: number, manual: boolean, currentVersionId: number): number {
    const gz = packSnapshot(doc);
    const title = typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : null;
    let versionId = currentVersionId;
    this.db.transaction(() => {
      const current = this.db
        .prepare(
          `SELECT id FROM diagram_versions
           WHERE id = ? AND auto = 1 AND created_at > datetime('now', ?)`,
        )
        .get(currentVersionId, `-${this.opts.coalesceMinutes} minutes`) as { id: number } | undefined;
      if (!manual && current) {
        this.db
          .prepare(`UPDATE diagram_versions SET snapshot_gz = ?, author_id = ?, saved_at = datetime('now') WHERE id = ?`)
          .run(gz, authorId, current.id);
      } else {
        const r = this.db
          .prepare(
            `INSERT INTO diagram_versions (diagram_id, author_id, snapshot_gz, auto, saved_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
          )
          .run(diagramId, authorId, gz, manual ? 0 : 1);
        versionId = Number(r.lastInsertRowid);
      }
      this.db
        .prepare(
          `UPDATE diagrams SET current_version_id = ?, updated_at = datetime('now'),
             title = COALESCE(?, title) WHERE id = ?`,
        )
        .run(versionId, title, diagramId);
    })();
    return versionId;
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const room of this.rooms.values()) {
        for (const c of room.clients.values()) c.res.write(': ping\n\n');
      }
    }, this.opts.heartbeatMs);
    this.heartbeat.unref();
  }

  private stopHeartbeatIfIdle(): void {
    if (this.rooms.size === 0 && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
