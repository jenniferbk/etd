import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, mintToken, requireAuth, sha256 } from '../auth.js';
import type { Db } from '../db.js';

export function resetRoutes(db: Db): Router {
  const router = Router();

  router.post('/password-resets', requireAuth(db), (req, res) => {
    const parsed = z.object({ email: z.email() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email) as
      | { id: number } | undefined;
    if (!target) {
      res.status(404).json({ error: 'no account with that email' });
      return;
    }
    const allowed =
      req.user!.isSiteAdmin ||
      !!db
        .prepare(
          `SELECT 1 FROM memberships mine
           JOIN memberships theirs ON theirs.group_id = mine.group_id
           WHERE mine.user_id = ? AND mine.role = 'admin' AND theirs.user_id = ?`,
        )
        .get(req.user!.id, target.id);
    if (!allowed) {
      res.status(403).json({ error: 'only admins can issue password resets' });
      return;
    }
    const { token, tokenHash } = mintToken();
    db.prepare(
      `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`,
    ).run(tokenHash, target.id);
    res.json({ token, expiresInHours: 24 });
  });

  router.post('/auth/reset-password', async (req, res) => {
    const parsed = z.object({ token: z.string().min(1), newPassword: z.string().min(8) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request (password must be ≥ 8 characters)' });
      return;
    }
    const row = db
      .prepare(
        `SELECT token_hash, user_id FROM password_resets
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
      )
      .get(sha256(parsed.data.token)) as { token_hash: string; user_id: number } | undefined;
    if (!row) {
      res.status(400).json({ error: 'invalid or expired reset token' });
      return;
    }
    const pwHash = await hashPassword(parsed.data.newPassword);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(pwHash, row.user_id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
      db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?`).run(row.token_hash);
    })();
    res.status(204).end();
  });

  return router;
}
