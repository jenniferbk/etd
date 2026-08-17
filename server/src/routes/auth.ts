import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createSession, deleteSession, requireAuth, verifyPassword, type SessionUser,
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
