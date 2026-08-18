import { Router } from 'express';
import { z } from 'zod';
import { mintToken, requireAuth, sha256 } from '../auth.js';
import { getRole } from '../access.js';
import type { Db } from '../db.js';

const INVITE_DAYS = 14;

export function inviteRoutes(db: Db): Router {
  const router = Router();

  router.post('/invites', requireAuth(db), (req, res) => {
    const parsed = z.object({ groupId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const { groupId } = parsed.data;
    const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
    if (!group) {
      res.status(404).json({ error: 'group not found' });
      return;
    }
    if (!req.user!.isSiteAdmin && getRole(db, req.user!.id, groupId) !== 'admin') {
      res.status(403).json({ error: 'only group admins can invite' });
      return;
    }
    const { token, tokenHash } = mintToken();
    db.prepare(
      `INSERT INTO invites (token_hash, group_id, created_by, expires_at) VALUES (?, ?, ?, datetime('now', '+${INVITE_DAYS} days'))`,
    ).run(tokenHash, groupId, req.user!.id);
    res.json({ token, expiresInDays: INVITE_DAYS });
  });

  // Unauthenticated by design: lets the register modal greet with the group
  // name. Valid+unused+unexpired only; all failures return the same 404 so the
  // endpoint is not a token-validity oracle beyond what registration reveals.
  router.get('/invites/:token/preview', (req, res) => {
    const row = db
      .prepare(
        `SELECT g.name FROM invites i JOIN groups g ON g.id = i.group_id
         WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > datetime('now')`,
      )
      .get(sha256(req.params.token)) as { name: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'invalid or expired invite' });
      return;
    }
    res.json({ groupName: row.name });
  });

  return router;
}
