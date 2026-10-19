import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getRole } from '../access.js';
import type { Db } from '../db.js';

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

interface FolderRow {
  id: number;
  group_id: number;
}

// Workspace folders: one level, scoped to a group. Any member may create,
// rename, or delete one; deleting moves its diagrams back to the top level,
// so no folder action can lose a diagram.
export function folderRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAuth(db));

  function nameTaken(groupId: number, name: string, exceptId = 0): boolean {
    return db
      .prepare('SELECT 1 FROM folders WHERE group_id = ? AND name = ? COLLATE NOCASE AND id != ?')
      .get(groupId, name, exceptId) !== undefined;
  }

  function getFolderForMember(
    req: import('express').Request, res: import('express').Response,
  ): FolderRow | null {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid folder id' });
      return null;
    }
    const row = db.prepare('SELECT id, group_id FROM folders WHERE id = ?').get(id) as FolderRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'folder not found' });
      return null;
    }
    if (getRole(db, req.user!.id, row.group_id) === null) {
      res.status(403).json({ error: 'not a member of this folder\'s group' });
      return null;
    }
    return row;
  }

  function requireMemberOfGroup(
    req: import('express').Request, res: import('express').Response,
  ): number | null {
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

  router.get('/groups/:id/folders', (req, res) => {
    const groupId = requireMemberOfGroup(req, res);
    if (groupId === null) return;
    const rows = db
      .prepare(
        `SELECT f.id, f.name,
                (SELECT COUNT(*) FROM diagrams d WHERE d.folder_id = f.id AND d.deleted_at IS NULL) AS diagramCount
         FROM folders f
         WHERE f.group_id = ?
         ORDER BY f.name COLLATE NOCASE, f.id`,
      )
      .all(groupId);
    res.json(rows);
  });

  router.post('/groups/:id/folders', (req, res) => {
    const groupId = requireMemberOfGroup(req, res);
    if (groupId === null) return;
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'folder name must not be empty' });
      return;
    }
    if (nameTaken(groupId, parsed.data.name)) {
      res.status(409).json({ error: 'a folder with that name already exists' });
      return;
    }
    const r = db
      .prepare('INSERT INTO folders (group_id, name, created_by) VALUES (?, ?, ?)')
      .run(groupId, parsed.data.name, req.user!.id);
    res.json({ id: Number(r.lastInsertRowid) });
  });

  router.patch('/folders/:id', (req, res) => {
    const row = getFolderForMember(req, res);
    if (!row) return;
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'folder name must not be empty' });
      return;
    }
    if (nameTaken(row.group_id, parsed.data.name, row.id)) {
      res.status(409).json({ error: 'a folder with that name already exists' });
      return;
    }
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(parsed.data.name, row.id);
    res.json({ ok: true });
  });

  router.delete('/folders/:id', (req, res) => {
    const row = getFolderForMember(req, res);
    if (!row) return;
    db.transaction(() => {
      // Trashed diagrams too, so a later restore lands at the top level.
      db.prepare('UPDATE diagrams SET folder_id = NULL WHERE folder_id = ?').run(row.id);
      db.prepare('DELETE FROM folders WHERE id = ?').run(row.id);
    })();
    res.status(204).end();
  });

  return router;
}
