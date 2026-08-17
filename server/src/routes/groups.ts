import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getRole } from '../access.js';
import type { Db } from '../db.js';

export function groupRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get('/groups', (req, res) => {
    const rows = db
      .prepare(
        `SELECT g.id, g.name, m.role FROM memberships m
         JOIN groups g ON g.id = m.group_id
         WHERE m.user_id = ? ORDER BY g.name`,
      )
      .all(req.user!.id);
    res.json(rows);
  });

  router.post('/groups', (req, res) => {
    if (!req.user!.isSiteAdmin) {
      res.status(403).json({ error: 'only site admins can create groups' });
      return;
    }
    const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    try {
      let id = 0;
      db.transaction(() => {
        const g = db.prepare('INSERT INTO groups (name) VALUES (?)').run(parsed.data.name);
        id = Number(g.lastInsertRowid);
        db.prepare(`INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, 'admin')`).run(
          req.user!.id, id,
        );
      })();
      res.json({ id, name: parsed.data.name });
    } catch {
      res.status(409).json({ error: 'a group with that name already exists' });
    }
  });

  function requireGroupAdmin(req: import('express').Request, res: import('express').Response, groupId: number): boolean {
    if (req.user!.isSiteAdmin || getRole(db, req.user!.id, groupId) === 'admin') return true;
    res.status(403).json({ error: 'only group admins can manage members' });
    return false;
  }

  router.post('/groups/:id/members', (req, res) => {
    const groupId = Number(req.params.id);
    const parsed = z
      .object({ email: z.email(), role: z.enum(['admin', 'member']) })
      .safeParse(req.body);
    if (!Number.isInteger(groupId) || !parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    if (!requireGroupAdmin(req, res, groupId)) return;
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email) as
      | { id: number } | undefined;
    if (!user) {
      res.status(404).json({ error: 'no account with that email (send them an invite instead)' });
      return;
    }
    db.prepare(
      `INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, ?)
       ON CONFLICT (user_id, group_id) DO UPDATE SET role = excluded.role`,
    ).run(user.id, groupId, parsed.data.role);
    res.status(204).end();
  });

  router.delete('/groups/:id/members/:userId', (req, res) => {
    const groupId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(groupId) || !Number.isInteger(userId)) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    if (!requireGroupAdmin(req, res, groupId)) return;
    db.prepare('DELETE FROM memberships WHERE user_id = ? AND group_id = ?').run(userId, groupId);
    res.status(204).end();
  });

  return router;
}
