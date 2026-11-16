import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../auth.js';
import { getRole } from '../access.js';
import type { Db } from '../db.js';

const kindType = z.enum(['question', 'other']);
const text = z.string().trim().min(1).max(200);
const initSchema = z.object({
  kinds: z.array(z.object({ id: z.string().trim().min(1).max(100), label: text, category: text, type: kindType })).max(500),
});
const addSchema = z.object({ id: z.string().trim().min(1).max(100).optional(), label: text, category: text, type: kindType });
const patchSchema = z.object({
  label: text.optional(), category: text.optional(), type: kindType.optional(), status: z.enum(['active', 'retired']).optional(),
});
const mergeSchema = z.object({ into: z.string().min(1) });

interface KindRow {
  id: string; label: string; category: string; type: 'question' | 'other';
  status: 'active' | 'retired'; merged_into: string | null; position: number;
}
export interface CodebookKind {
  id: string; label: string; category: string; type: 'question' | 'other';
  status: 'active' | 'retired'; mergedInto: string | null; position: number;
}

function toKind(r: KindRow): CodebookKind {
  return { id: r.id, label: r.label, category: r.category, type: r.type, status: r.status, mergedInto: r.merged_into, position: r.position };
}

type LogAction = 'init' | 'add' | 'update' | 'merge' | 'seed';

export function writeLog(
  db: Db, groupId: number, userId: number | null, action: LogAction, kindId: string | null, before: unknown, after: unknown,
): void {
  db.prepare('INSERT INTO codebook_log (group_id, user_id, action, kind_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
    .run(groupId, userId, action, kindId, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after));
}

// Per-group codebook of move kinds. Renames keep ids; merges retire a kind and
// point it (and anything already merged into it) at the survivor. Every
// mutation commits together with its change-log row.
export function codebookRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAuth(db));

  function memberGroup(req: Request, res: Response): number | null {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'invalid group id' });
      return null;
    }
    if (getRole(db, req.user!.id, groupId) === null) {
      res.status(403).json({ error: 'not a member of this group' });
      return null;
    }
    return groupId;
  }

  const listKinds = (groupId: number): CodebookKind[] =>
    (db.prepare('SELECT id, label, category, type, status, merged_into, position FROM codebook_kinds WHERE group_id = ? ORDER BY position, id')
      .all(groupId) as KindRow[]).map(toKind);

  const getKind = (groupId: number, id: string): CodebookKind | undefined => {
    const r = db.prepare('SELECT id, label, category, type, status, merged_into, position FROM codebook_kinds WHERE group_id = ? AND id = ?')
      .get(groupId, id) as KindRow | undefined;
    return r ? toKind(r) : undefined;
  };

  // Labels are unique, ignoring case, among kinds that are not merged.
  const labelTaken = (groupId: number, label: string, exceptId = ''): boolean =>
    db.prepare('SELECT 1 FROM codebook_kinds WHERE group_id = ? AND label = ? COLLATE NOCASE AND merged_into IS NULL AND id != ?')
      .get(groupId, label, exceptId) !== undefined;

  router.get('/groups/:id/codebook', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    res.json({ kinds: listKinds(groupId) });
  });

  router.post('/groups/:id/codebook/init', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    const parsed = initSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return; }
    const { kinds } = parsed.data;
    const ids = new Set(kinds.map((k) => k.id));
    const labels = new Set(kinds.map((k) => k.label.toLowerCase()));
    if (ids.size !== kinds.length || labels.size !== kinds.length) {
      res.status(400).json({ error: 'duplicate id or label' });
      return;
    }
    const ok = db.transaction(() => {
      if (db.prepare('SELECT 1 FROM codebook_kinds WHERE group_id = ?').get(groupId)) return false;
      const ins = db.prepare('INSERT INTO codebook_kinds (group_id, id, label, category, type, position) VALUES (?, ?, ?, ?, ?, ?)');
      kinds.forEach((k, i) => ins.run(groupId, k.id, k.label, k.category, k.type, i));
      writeLog(db, groupId, req.user!.id, 'init', null, null, { kinds });
      return true;
    })();
    if (!ok) { res.status(409).json({ error: 'codebook already initialized' }); return; }
    res.json({ kinds: listKinds(groupId) });
  });

  router.post('/groups/:id/codebook/kinds', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return; }
    const b = parsed.data;
    const id = b.id ?? randomUUID();
    const result = db.transaction((): CodebookKind | 'dup-id' | 'dup-label' => {
      if (getKind(groupId, id)) return 'dup-id';
      if (labelTaken(groupId, b.label)) return 'dup-label';
      const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM codebook_kinds WHERE group_id = ?').get(groupId) as { p: number }).p;
      db.prepare('INSERT INTO codebook_kinds (group_id, id, label, category, type, position) VALUES (?, ?, ?, ?, ?, ?)')
        .run(groupId, id, b.label, b.category, b.type, pos);
      const kind = getKind(groupId, id)!;
      writeLog(db, groupId, req.user!.id, 'add', id, null, kind);
      return kind;
    })();
    if (result === 'dup-id') { res.status(409).json({ error: 'kind id already exists' }); return; }
    if (result === 'dup-label') { res.status(409).json({ error: 'label already in use' }); return; }
    res.json(result);
  });

  router.patch('/groups/:id/codebook/kinds/:kindId', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return; }
    const b = parsed.data;
    const kindId = String(req.params.kindId);
    const result = db.transaction((): CodebookKind | 'missing' | 'dup-label' | 'merged' => {
      const before = getKind(groupId, kindId);
      if (!before) return 'missing';
      if (b.status === 'active' && before.mergedInto !== null) return 'merged';
      if (b.label !== undefined && before.mergedInto === null && labelTaken(groupId, b.label, kindId)) return 'dup-label';
      db.prepare('UPDATE codebook_kinds SET label = ?, category = ?, type = ?, status = ? WHERE group_id = ? AND id = ?')
        .run(b.label ?? before.label, b.category ?? before.category, b.type ?? before.type, b.status ?? before.status, groupId, kindId);
      const after = getKind(groupId, kindId)!;
      writeLog(db, groupId, req.user!.id, 'update', kindId, before, after);
      return after;
    })();
    if (result === 'missing') { res.status(404).json({ error: 'kind not found' }); return; }
    if (result === 'dup-label') { res.status(409).json({ error: 'label already in use' }); return; }
    if (result === 'merged') { res.status(400).json({ error: 'a merged kind cannot be reactivated' }); return; }
    res.json(result);
  });

  router.post('/groups/:id/codebook/kinds/:kindId/merge', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return; }
    const { into } = parsed.data;
    const kindId = String(req.params.kindId);
    const err = db.transaction((): { code: number; error: string } | null => {
      const src = getKind(groupId, kindId);
      if (!src) return { code: 404, error: 'kind not found' };
      if (into === kindId) return { code: 400, error: 'cannot merge a kind into itself' };
      const target = getKind(groupId, into);
      if (!target) return { code: 400, error: 'target kind not found' };
      if (target.mergedInto !== null) return { code: 400, error: 'target is merged' };
      if (target.status === 'retired') return { code: 400, error: 'target is retired' };
      // Flatten: anything already merged into the source now points at the target.
      const repointed = (db.prepare('SELECT id FROM codebook_kinds WHERE group_id = ? AND merged_into = ?')
        .all(groupId, kindId) as { id: string }[]).map((r) => r.id);
      db.prepare('UPDATE codebook_kinds SET merged_into = ? WHERE group_id = ? AND merged_into = ?').run(into, groupId, kindId);
      db.prepare("UPDATE codebook_kinds SET merged_into = ?, status = 'retired' WHERE group_id = ? AND id = ?").run(into, groupId, kindId);
      writeLog(db, groupId, req.user!.id, 'merge', kindId, src, { ...getKind(groupId, kindId)!, repointed });
      return null;
    })();
    if (err) { res.status(err.code).json({ error: err.error }); return; }
    res.json({ kinds: listKinds(groupId) });
  });

  router.get('/groups/:id/codebook/log', (req, res) => {
    const groupId = memberGroup(req, res);
    if (groupId === null) return;
    const rows = db.prepare(
      `SELECT l.id, l.at, COALESCE(u.display_name, 'seed') AS user, l.action, l.kind_id, l.before_json, l.after_json
       FROM codebook_log l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.group_id = ? ORDER BY l.id DESC`,
    ).all(groupId) as { id: number; at: string; user: string; action: LogAction; kind_id: string | null; before_json: string | null; after_json: string | null }[];
    res.json({
      entries: rows.map((r) => ({
        id: r.id, at: r.at, user: r.user, action: r.action, kindId: r.kind_id,
        before: r.before_json === null ? null : JSON.parse(r.before_json),
        after: r.after_json === null ? null : JSON.parse(r.after_json),
      })),
    });
  });

  return router;
}
