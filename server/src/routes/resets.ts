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
    // Look up the target internally, but don't let its existence (or the
    // requester's permission over it) leak via response status: the
    // permission check runs first and always returns a uniform 403 for any
    // disallowed caller, whether or not an account with that email exists.
    const target = db.prepare('SELECT id, is_site_admin FROM users WHERE email = ?').get(
      parsed.data.email,
    ) as { id: number; is_site_admin: number } | undefined;
    const targetIsSiteAdmin = !!target && target.is_site_admin === 1;
    const allowed =
      req.user!.isSiteAdmin ||
      (!!target &&
        !targetIsSiteAdmin &&
        !!db
          .prepare(
            `SELECT 1 FROM memberships mine
             JOIN memberships theirs ON theirs.group_id = mine.group_id
             WHERE mine.user_id = ? AND mine.role = 'admin' AND theirs.user_id = ?`,
          )
          .get(req.user!.id, target.id));
    if (!allowed) {
      // Fires whether the account doesn't exist, the requester isn't an
      // admin of a shared group, or (privilege escalation guard) the target
      // is a site admin and the requester isn't — same status, same body,
      // so a non-site-admin can't use this endpoint to probe emails or to
      // mint a reset link for a site admin account.
      res.status(403).json({ error: 'only admins can issue password resets' });
      return;
    }
    // Only reachable here for site admins (trusted) or a confirmed
    // non-site-admin target with a shared-group admin — safe to 404 now.
    if (!target) {
      res.status(404).json({ error: 'no account with that email' });
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
