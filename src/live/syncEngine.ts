import { applyOps, diffDocs, type LiveDoc, type Op } from './ops';

export interface Batch {
  batchId: string;
  ops: Op[];
}

export interface ServerBatch {
  clientId: string;
  batchId: string;
  ops: Op[];
}

/**
 * Client-side reconciliation, free of I/O so it can be tested directly.
 *
 * - `shadow`: the server's document as of the last event this client saw.
 * - `inflight`: batches this client sent that the server has not echoed back.
 * - `lastSent`: shadow with inflight applied. The local document minus
 *   `lastSent` is the set of edits not yet sent.
 *
 * The server applies batches in one global order and echoes every batch to
 * every client, including the sender. When another client's batch arrives,
 * the local document is rebuilt as shadow + inflight + unsent, which is the
 * order the server will apply them in. Field-level last-writer-wins falls
 * out of that: a field this client changed but the server has not yet seen
 * overrides the incoming value, because this client's edit will land later.
 */
export class SyncEngine {
  shadow: LiveDoc;
  inflight: Batch[] = [];
  lastSent: LiveDoc;
  private nextBatch = 1;
  private readonly clientId: string;

  constructor(clientId: string, doc: LiveDoc) {
    this.clientId = clientId;
    this.shadow = doc;
    this.lastSent = doc;
  }

  /** Edits made locally since the last send. */
  unsent(local: LiveDoc): Op[] {
    return diffDocs(this.lastSent, local);
  }

  /** Package unsent local edits as a batch, or null when there are none. */
  takeBatch(local: LiveDoc): Batch | null {
    const ops = this.unsent(local);
    if (ops.length === 0) return null;
    const batch = { batchId: `${this.clientId}:${this.nextBatch++}`, ops };
    this.inflight.push(batch);
    this.lastSent = local;
    return batch;
  }

  hasPending(local: LiveDoc): boolean {
    return this.inflight.length > 0 || this.unsent(local).length > 0;
  }

  /**
   * Apply a batch from the server's stream. Returns the new local document
   * when it changed, or null when the local document is already right (the
   * batch was this client's own echo).
   */
  receive(batch: ServerBatch, local: LiveDoc): LiveDoc | null {
    if (batch.clientId === this.clientId) {
      this.shadow = applyOps(this.shadow, batch.ops);
      const i = this.inflight.findIndex((b) => b.batchId === batch.batchId);
      if (i !== -1) this.inflight.splice(i, 1);
      return null;
    }
    const pendingLocal = this.unsent(local);
    this.shadow = applyOps(this.shadow, batch.ops);
    this.lastSent = this.inflight.reduce((d, b) => applyOps(d, b.ops), this.shadow);
    return applyOps(this.lastSent, pendingLocal);
  }

  /**
   * Start over from a fresh server document (reconnect, or the server
   * replaced the document). Anything not yet echoed is folded back into
   * "unsent" so the next takeBatch sends it again. Field sets and deletes
   * are idempotent, so resending an edit the server already applied is safe.
   */
  reset(doc: LiveDoc, local: LiveDoc): LiveDoc {
    const pending = [...this.inflight.flatMap((b) => b.ops), ...this.unsent(local)];
    this.shadow = doc;
    this.lastSent = doc;
    this.inflight = [];
    return applyOps(doc, pending);
  }
}
