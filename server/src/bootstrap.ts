import { hashPassword } from './auth.js';
import type { Db } from './db.js';

export interface BootstrapOpts {
  adminEmail?: string;
  adminPassword?: string;
  initialGroup?: string;
}

export async function bootstrap(db: Db, opts: BootstrapOpts): Promise<void> {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (n > 0) return;
  if (!opts.adminEmail || !opts.adminPassword) {
    throw new Error(
      'Database has no users. Set ETD_ADMIN_EMAIL and ETD_ADMIN_PASSWORD to bootstrap the first admin account.',
    );
  }
  const pwHash = await hashPassword(opts.adminPassword);
  const insert = db.transaction(() => {
    const u = db
      .prepare('INSERT INTO users (email, password_hash, display_name, is_site_admin) VALUES (?, ?, ?, 1)')
      .run(opts.adminEmail, pwHash, 'Admin');
    const g = db.prepare('INSERT INTO groups (name) VALUES (?)').run(opts.initialGroup ?? 'COMS');
    db.prepare('INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, ?)').run(
      u.lastInsertRowid, g.lastInsertRowid, 'admin',
    );
  });
  insert();
}
