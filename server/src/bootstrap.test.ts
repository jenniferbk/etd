import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { bootstrap } from './bootstrap.js';
import { verifyPassword } from './auth.js';

describe('bootstrap', () => {
  it('creates admin, group, and admin membership on an empty db', async () => {
    const db = openDb(':memory:');
    await bootstrap(db, { adminEmail: 'anna@uga.edu', adminPassword: 'first-admin-pw', initialGroup: 'COMS' });
    const user = db.prepare('SELECT * FROM users').get() as {
      id: number; email: string; password_hash: string; is_site_admin: number;
    };
    expect(user.email).toBe('anna@uga.edu');
    expect(user.is_site_admin).toBe(1);
    expect(await verifyPassword(user.password_hash, 'first-admin-pw')).toBe(true);
    const group = db.prepare('SELECT * FROM groups').get() as { id: number; name: string };
    expect(group.name).toBe('COMS');
    const m = db.prepare('SELECT * FROM memberships').get() as { user_id: number; group_id: number; role: string };
    expect(m).toEqual({ user_id: user.id, group_id: group.id, role: 'admin' });
  });

  it('is a no-op when users already exist', async () => {
    const db = openDb(':memory:');
    await bootstrap(db, { adminEmail: 'anna@uga.edu', adminPassword: 'first-admin-pw' });
    await bootstrap(db, { adminEmail: 'other@uga.edu', adminPassword: 'x'.repeat(8) });
    expect((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });

  it('throws on empty db without credentials', async () => {
    const db = openDb(':memory:');
    await expect(bootstrap(db, {})).rejects.toThrow(/ETD_ADMIN_EMAIL/);
  });
});
