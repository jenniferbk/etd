import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createSession, deleteSession, hashPassword, requireAuth, sha256, verifyPassword, type SessionUser,
} from '../auth.js';
import type { Db } from '../db.js';

interface DbUserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  is_site_admin: number;
}

export function toSessionUser(row: DbUserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isSiteAdmin: row.is_site_admin === 1,
  };
}

class InviteAlreadyUsedError extends Error {
  constructor() {
    super('invite already used');
  }
}

export function authRoutes(db: Db): Router {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many attempts; try again later' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const parsed = z.object({ email: z.email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email) as DbUserRow | undefined;
    if (!row || !(await verifyPassword(row.password_hash, parsed.data.password))) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }
    const token = createSession(db, row.id);
    res.json({ token, user: toSessionUser(row) });
  });

  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too many attempts; try again later' },
  });

  router.post('/register', registerLimiter, async (req, res) => {
    const parsed = z
      .object({
        inviteToken: z.string().min(1),
        email: z.email(),
        password: z.string().min(8),
        displayName: z.string().trim().min(1),
        acceptedPolicy: z.literal(true),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid request (password must be ≥ 8 characters and the data policy must be accepted)',
      });
      return;
    }
    const { inviteToken, email, password, displayName } = parsed.data;
    const inviteTokenHash = sha256(inviteToken);
    const invite = db
      .prepare(
        `SELECT token_hash, group_id FROM invites
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
      )
      .get(inviteTokenHash) as { token_hash: string; group_id: number } | undefined;
    if (!invite) {
      res.status(400).json({ error: 'invalid or expired invite' });
      return;
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'an account with that email already exists' });
      return;
    }
    const pwHash = await hashPassword(password);
    let userId = 0;
    try {
      db.transaction(() => {
        const claimed = db
          .prepare(
            `UPDATE invites SET used_at = datetime('now')
             WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
          )
          .run(inviteTokenHash);
        if (claimed.changes !== 1) {
          throw new InviteAlreadyUsedError();
        }
        const u = db
          .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
          .run(email, pwHash, displayName);
        userId = Number(u.lastInsertRowid);
        db.prepare(`INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, 'member')`).run(
          userId, invite.group_id,
        );
      })();
    } catch (err) {
      if (err instanceof InviteAlreadyUsedError) {
        res.status(400).json({ error: 'invalid or expired invite' });
        return;
      }
      if (err instanceof Error) {
        if (
          err.message.includes('UNIQUE constraint failed: users.email') ||
          (err as any).code === 'SQLITE_CONSTRAINT_UNIQUE'
        ) {
          res.status(409).json({ error: 'an account with that email already exists' });
          return;
        }
      }
      throw err;
    }
    const token = createSession(db, userId);
    res.json({ token, user: { id: userId, email, displayName, isSiteAdmin: false } });
  });

  router.post('/logout', requireAuth(db), (req, res) => {
    const header = req.header('authorization')!;
    deleteSession(db, header.slice('Bearer '.length));
    res.status(204).end();
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json(req.user);
  });

  return router;
}
