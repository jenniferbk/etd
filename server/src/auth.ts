import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';

export interface SessionUser {
  id: number;
  email: string;
  displayName: string;
  isSiteAdmin: boolean;
}

declare global {
  // Augmenting Express's own namespace is the documented way to extend
  // `Request` with app-specific fields; there is no ES2015-module
  // equivalent for this.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const SESSION_DAYS = 30;

export function hashPassword(pw: string): Promise<string> {
  return hash(pw);
}

export async function verifyPassword(passwordHash: string, pw: string): Promise<boolean> {
  try {
    return await verify(passwordHash, pw);
  } catch {
    return false;
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export function createSession(db: Db, userId: number): string {
  const { token, tokenHash } = mintToken();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
  ).run(tokenHash, userId);
  return token;
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  is_site_admin: number;
}

export function getSessionUser(db: Db, token: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.is_site_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(sha256(token)) as UserRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isSiteAdmin: row.is_site_admin === 1,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function requireAuth(db: Db) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const user = token ? getSessionUser(db, token) : null;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.user = user;
    next();
  };
}
