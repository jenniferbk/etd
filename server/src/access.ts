import type { Db } from './db.js';

export function getRole(db: Db, userId: number, groupId: number): 'admin' | 'member' | null {
  const row = db
    .prepare('SELECT role FROM memberships WHERE user_id = ? AND group_id = ?')
    .get(userId, groupId) as { role: 'admin' | 'member' } | undefined;
  return row?.role ?? null;
}
