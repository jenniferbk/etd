# Groupware Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invite-only accounts + cloud storage of diagrams in shared group libraries, backed by a small Express + SQLite server that runs on the COMS office Mac (and is self-hostable).

**Architecture:** New `server/` workspace (own package.json) — one Node process, one SQLite file, bearer-token sessions, REST under `/api`. Frontend adds `src/api/` (client + auth store) and `src/components/Cloud/` (sign-in, save, library UI). Cloud features are additive; local save/load and autosave are untouched. Every cloud save writes a full gzipped JSON snapshot into `diagram_versions` (history UI is Phase 2, but nothing is ever overwritten). Phase 1 saves are last-write-wins; conflict detection (409/base_version_id) is Phase 2.

**Tech Stack:** Server: Node ≥ 20, TypeScript (ESM, run via tsx), Express 5, better-sqlite3, @node-rs/argon2, zod, express-rate-limit, cors; tests with vitest + supertest. Frontend: existing React 19 + zustand + vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-groupware-design.md`

## Global Constraints

- **De-identified data only** — policy text must appear (a) as a required checkbox at registration and (b) as a standing reminder in the cloud-save dialog. Exact copy in Tasks 10 and 11.
- **No SMTP / no email sending anywhere.** Invites and password resets are links/tokens an admin hands out personally.
- **Server is self-hostable:** all configuration via env vars; no COMS-specific values hardcoded. Frontend server URL is user-editable at runtime.
- **Snapshot format = local save format:** the cloud stores exactly the object `saveDiagramJson` writes to disk (`{version, name, elements, connections, styleConfig, transcript}`, see `src/utils/saveDiagram.ts`). The server treats it as an opaque JSON blob.
- **Existing behavior unchanged:** local open/save, autosave (`useAutoSave`), and all canvas features must work signed-out exactly as before.
- Server code lives in `server/`, has its own `package.json`, and is NOT part of the Vite build. Root `npm run build` must keep working.
- Passwords: argon2 hashes only, min length 8. Session tokens: 32 random bytes base64url; store only SHA-256 hex of tokens (sessions, invites, resets).
- All server responses are JSON; errors are `{ "error": "<human-readable message>" }` with an appropriate 4xx/5xx status.
- Commit after every task (each task ends with a commit step).

---

### Task 1: Server scaffold + SQLite schema

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/.gitignore`
- Create: `server/src/db.ts`, `server/src/app.ts`, `server/src/index.ts`
- Test: `server/src/db.test.ts`, `server/src/app.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Db` (type `Db = Database.Database` from better-sqlite3) — opens/creates the DB, applies PRAGMAs + full schema.
- Produces: `createApp(db: Db): express.Express` — later tasks mount routers inside it.

- [ ] **Step 1: Scaffold the package**

```bash
mkdir -p server/src
cd server
npm init -y
npm install express cors express-rate-limit zod better-sqlite3 @node-rs/argon2
npm install -D typescript tsx vitest supertest @types/express @types/cors @types/supertest @types/node @types/better-sqlite3
```

Then edit `server/package.json` so it reads (keep the dependency versions npm chose):

```json
{
  "name": "etd-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

(dependencies/devDependencies blocks stay as npm wrote them.)

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

Create `server/.gitignore`:

```
node_modules/
data/
.env
```

- [ ] **Step 2: Write failing tests for db + health endpoint**

`server/src/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';

describe('openDb', () => {
  it('creates all tables', () => {
    const db = openDb(':memory:');
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of [
      'users', 'groups', 'memberships', 'sessions',
      'diagrams', 'diagram_versions', 'comments', 'invites', 'password_resets',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    expect(() =>
      db.prepare(`INSERT INTO memberships (user_id, group_id, role) VALUES (999, 999, 'member')`).run(),
    ).toThrow();
  });
});
```

`server/src/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';

describe('app', () => {
  it('responds to health check', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npx vitest run`
Expected: FAIL — cannot find `./db.js` / `./app.js`.

- [ ] **Step 4: Implement db.ts, app.ts, index.ts**

`server/src/db.ts`:

```ts
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_site_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  PRIMARY KEY (user_id, group_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS diagrams (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS diagram_versions (
  id INTEGER PRIMARY KEY,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  snapshot_gz BLOB NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
```

`server/src/app.ts`:

```ts
import express from 'express';
import cors from 'cors';
import type { Db } from './db.js';

export function createApp(db: Db): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Routers are mounted here by later tasks.
  void db;

  return app;
}
```

`server/src/index.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { openDb } from './db.js';

const dbPath = process.env.ETD_DB_PATH ?? './data/etd.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

const port = Number(process.env.PORT ?? 8787);
createApp(db).listen(port, () => {
  console.log(`etd-server listening on :${port} (db: ${dbPath})`);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): scaffold Express+SQLite server with full schema"
```

---

### Task 2: Auth primitives (hashing, sessions, middleware)

**Files:**
- Create: `server/src/auth.ts`
- Test: `server/src/auth.test.ts`

**Interfaces:**
- Consumes: `openDb`, `Db` from `./db.js`
- Produces:
  - `hashPassword(pw: string): Promise<string>` / `verifyPassword(hash: string, pw: string): Promise<boolean>`
  - `sha256(s: string): string` (hex)
  - `mintToken(): { token: string; tokenHash: string }`
  - `createSession(db: Db, userId: number): string` (returns raw token, 30-day expiry)
  - `getSessionUser(db: Db, token: string): SessionUser | null` where `SessionUser = { id: number; email: string; displayName: string; isSiteAdmin: boolean }`
  - `deleteSession(db: Db, token: string): void`
  - `requireAuth(db: Db)`: Express middleware; sets `req.user: SessionUser`, else 401

- [ ] **Step 1: Write failing tests**

`server/src/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import {
  createSession, deleteSession, getSessionUser, hashPassword, verifyPassword,
} from './auth.js';

async function makeUser(db: ReturnType<typeof openDb>): Promise<number> {
  const pwHash = await hashPassword('correct horse');
  const r = db
    .prepare(`INSERT INTO users (email, password_hash, display_name) VALUES ('a@uga.edu', ?, 'A')`)
    .run(pwHash);
  return Number(r.lastInsertRowid);
}

describe('passwords', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const h = await hashPassword('secret-pw');
    expect(await verifyPassword(h, 'secret-pw')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(h).not.toContain('secret-pw');
  });
});

describe('sessions', () => {
  it('round-trips a session and deletes it', async () => {
    const db = openDb(':memory:');
    const userId = await makeUser(db);
    const token = createSession(db, userId);
    const user = getSessionUser(db, token);
    expect(user).toMatchObject({ id: userId, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false });
    deleteSession(db, token);
    expect(getSessionUser(db, token)).toBeNull();
  });

  it('rejects an unknown token', async () => {
    const db = openDb(':memory:');
    await makeUser(db);
    expect(getSessionUser(db, 'not-a-token')).toBeNull();
  });

  it('stores only a hash of the token', async () => {
    const db = openDb(':memory:');
    const userId = await makeUser(db);
    const token = createSession(db, userId);
    const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/auth.test.ts`
Expected: FAIL — cannot find `./auth.js`.

- [ ] **Step 3: Implement auth.ts**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth.ts server/src/auth.test.ts
git commit -m "feat(server): argon2 password hashing, hashed session tokens, requireAuth"
```

---

### Task 3: Bootstrap first admin + group

**Files:**
- Create: `server/src/bootstrap.ts`
- Modify: `server/src/index.ts` (call bootstrap before listen)
- Test: `server/src/bootstrap.test.ts`

**Interfaces:**
- Produces: `bootstrap(db: Db, opts: { adminEmail?: string; adminPassword?: string; initialGroup?: string }): Promise<void>` — no-op when any users exist; otherwise creates a site-admin user + initial group (default name `COMS`) + admin membership; throws with a helpful message if env vars are missing on an empty DB.

- [ ] **Step 1: Write failing tests**

`server/src/bootstrap.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/bootstrap.test.ts`
Expected: FAIL — cannot find `./bootstrap.js`.

- [ ] **Step 3: Implement bootstrap.ts and wire into index.ts**

`server/src/bootstrap.ts`:

```ts
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
```

In `server/src/index.ts`, replace the listen block with:

```ts
import { bootstrap } from './bootstrap.js';

await bootstrap(db, {
  adminEmail: process.env.ETD_ADMIN_EMAIL,
  adminPassword: process.env.ETD_ADMIN_PASSWORD,
  initialGroup: process.env.ETD_INITIAL_GROUP,
});

const port = Number(process.env.PORT ?? 8787);
createApp(db).listen(port, () => {
  console.log(`etd-server listening on :${port} (db: ${dbPath})`);
});
```

(imports go at the top of the file with the others.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/bootstrap.ts server/src/bootstrap.test.ts server/src/index.ts
git commit -m "feat(server): bootstrap first site admin and initial group from env"
```

---

### Task 4: Auth routes (login / logout / me) + test helpers

**Files:**
- Create: `server/src/routes/auth.ts`, `server/test/helpers.ts`
- Modify: `server/src/app.ts` (mount router)
- Test: `server/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `createSession`, `deleteSession`, `verifyPassword`, `requireAuth` from `../auth.js`
- Produces routes:
  - `POST /api/auth/login {email, password}` → `{token, user: {id, email, displayName, isSiteAdmin}}` | 401
  - `POST /api/auth/logout` (auth) → 204
  - `GET /api/auth/me` (auth) → user object above
- Produces test helper: `makeTestServer(): Promise<{ app: Express; db: Db; adminToken: string }>` — in-memory DB bootstrapped with admin `admin@test.edu` / `admin-pw-123`, group `COMS`, admin already logged in.

- [ ] **Step 1: Write the test helper**

`server/test/helpers.ts`:

```ts
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb, type Db } from '../src/db.js';
import { bootstrap } from '../src/bootstrap.js';

export const ADMIN_EMAIL = 'admin@test.edu';
export const ADMIN_PASSWORD = 'admin-pw-123';

export async function makeTestServer(): Promise<{ app: Express; db: Db; adminToken: string }> {
  const db = openDb(':memory:');
  await bootstrap(db, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, initialGroup: 'COMS' });
  const app = createApp(db);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  return { app, db, adminToken: res.body.token as string };
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
```

- [ ] **Step 2: Write failing route tests**

`server/src/routes/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN_EMAIL, ADMIN_PASSWORD, auth, makeTestServer } from '../../test/helpers.js';

describe('auth routes', () => {
  it('logs in with correct credentials', async () => {
    const { app } = await makeTestServer();
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: ADMIN_EMAIL, isSiteAdmin: true });
  });

  it('rejects a wrong password with 401', async () => {
    const { app } = await makeTestServer();
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
  });

  it('GET /me returns the session user and logout invalidates the token', async () => {
    const { app, adminToken } = await makeTestServer();
    const me = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(ADMIN_EMAIL);

    const out = await request(app).post('/api/auth/logout').set(auth(adminToken));
    expect(out.status).toBe(204);

    const after = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(after.status).toBe(401);
  });

  it('GET /me without a token is 401', async () => {
    const { app } = await makeTestServer();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/auth.test.ts`
Expected: FAIL — login route missing (helper's login returns no token / 404).

- [ ] **Step 4: Implement the router and mount it**

`server/src/routes/auth.ts`:

```ts
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
```

In `server/src/app.ts`, replace the `void db;` line with:

```ts
app.use('/api/auth', authRoutes(db));
```

and add `import { authRoutes } from './routes/auth.js';` at the top.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/auth.ts server/src/routes/auth.test.ts server/test/helpers.ts server/src/app.ts
git commit -m "feat(server): login/logout/me routes with rate limiting + test helpers"
```

---

### Task 5: Invites + registration (with policy acknowledgment)

**Files:**
- Create: `server/src/routes/invites.ts`, `server/src/access.ts`
- Modify: `server/src/routes/auth.ts` (add `POST /register`), `server/src/app.ts` (mount invites)
- Test: `server/src/routes/invites.test.ts`

**Interfaces:**
- Produces: `getRole(db: Db, userId: number, groupId: number): 'admin' | 'member' | null` in `server/src/access.ts`
- Produces routes:
  - `POST /api/invites {groupId}` (site admin or that group's admin) → `{token, expiresInDays: 14}` | 403
  - `POST /api/auth/register {inviteToken, email, password, displayName, acceptedPolicy: true}` → `{token, user}` | 400 (bad/expired invite, weak password, policy not accepted) | 409 (email taken)
- Registration adds the user as `member` of the invite's group and marks the invite used (single-use).

- [ ] **Step 1: Write failing tests**

`server/src/routes/invites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function makeInvite(app: import('express').Express, adminToken: string): Promise<string> {
  const res = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

const REG = {
  email: 'newbie@uga.edu',
  password: 'longenough',
  displayName: 'Newbie',
  acceptedPolicy: true,
};

describe('invites + register', () => {
  it('admin creates an invite; new user registers and lands in the group', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const res = await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: REG.email, displayName: 'Newbie', isSiteAdmin: false });
    const m = db
      .prepare(`SELECT role FROM memberships WHERE user_id = ? AND group_id = 1`)
      .get(res.body.user.id) as { role: string };
    expect(m.role).toBe('member');
  });

  it('an invite is single-use', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    const second = await request(app)
      .post('/api/auth/register')
      .send({ inviteToken, ...REG, email: 'other@uga.edu' });
    expect(second.status).toBe(400);
  });

  it('rejects registration without acceptedPolicy', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ inviteToken, ...REG, acceptedPolicy: false });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    const { app, adminToken } = await makeTestServer();
    const t1 = await makeInvite(app, adminToken);
    const t2 = await makeInvite(app, adminToken);
    await request(app).post('/api/auth/register').send({ inviteToken: t1, ...REG });
    const res = await request(app).post('/api/auth/register').send({ inviteToken: t2, ...REG });
    expect(res.status).toBe(409);
  });

  it('non-admin members cannot create invites', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const reg = await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    const res = await request(app).post('/api/invites').set(auth(reg.body.token)).send({ groupId: 1 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/invites.test.ts`
Expected: FAIL — 404s on `/api/invites` and `/api/auth/register`.

- [ ] **Step 3: Implement access.ts, invites router, register route**

`server/src/access.ts`:

```ts
import type { Db } from './db.js';

export function getRole(db: Db, userId: number, groupId: number): 'admin' | 'member' | null {
  const row = db
    .prepare('SELECT role FROM memberships WHERE user_id = ? AND group_id = ?')
    .get(userId, groupId) as { role: 'admin' | 'member' } | undefined;
  return row?.role ?? null;
}
```

`server/src/routes/invites.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { mintToken, requireAuth } from '../auth.js';
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

  return router;
}
```

Add to `server/src/routes/auth.ts` (inside `authRoutes`, alongside login; new imports: `hashPassword`, `sha256` from `../auth.js`):

```ts
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
  const invite = db
    .prepare(
      `SELECT token_hash, group_id FROM invites
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    )
    .get(sha256(inviteToken)) as { token_hash: string; group_id: number } | undefined;
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
  db.transaction(() => {
    const u = db
      .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
      .run(email, pwHash, displayName);
    userId = Number(u.lastInsertRowid);
    db.prepare(`INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, 'member')`).run(
      userId, invite.group_id,
    );
    db.prepare(`UPDATE invites SET used_at = datetime('now') WHERE token_hash = ?`).run(invite.token_hash);
  })();
  const token = createSession(db, userId);
  res.json({ token, user: { id: userId, email, displayName, isSiteAdmin: false } });
});
```

Mount in `server/src/app.ts` after the auth router:

```ts
app.use('/api', inviteRoutes(db));
```

with `import { inviteRoutes } from './routes/invites.js';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): single-use invites and invite-only registration with policy acknowledgment"
```

---

### Task 6: Groups & membership routes

**Files:**
- Create: `server/src/routes/groups.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/src/routes/groups.test.ts`

**Interfaces:**
- Produces routes:
  - `GET /api/groups` (auth) → `[{id, name, role}]` for the current user
  - `POST /api/groups {name}` (site admin) → `{id, name}`; creator gets `admin` membership
  - `POST /api/groups/:id/members {email, role}` (site admin or group admin) → 204; 404 if no user with that email
  - `DELETE /api/groups/:id/members/:userId` (site admin or group admin) → 204

- [ ] **Step 1: Write failing tests**

`server/src/routes/groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function registerMember(
  app: import('express').Express, adminToken: string, email: string,
): Promise<{ token: string; id: number }> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return { token: reg.body.token, id: reg.body.user.id };
}

describe('groups', () => {
  it('lists my groups with role', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app).get('/api/groups').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'COMS', role: 'admin' }]);
  });

  it('site admin creates a group and becomes its admin', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'AlgebraProject' });
    expect(res.status).toBe(200);
    const groups = await request(app).get('/api/groups').set(auth(adminToken));
    expect(groups.body).toContainEqual({ id: res.body.id, name: 'AlgebraProject', role: 'admin' });
  });

  it('non-site-admin cannot create groups', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm1@uga.edu');
    const res = await request(app).post('/api/groups').set(auth(member.token)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('group admin adds and removes members by email', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm2@uga.edu');
    const g = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Second' });
    const add = await request(app)
      .post(`/api/groups/${g.body.id}/members`).set(auth(adminToken))
      .send({ email: 'm2@uga.edu', role: 'member' });
    expect(add.status).toBe(204);
    const mine = await request(app).get('/api/groups').set(auth(member.token));
    expect(mine.body).toContainEqual({ id: g.body.id, name: 'Second', role: 'member' });

    const del = await request(app)
      .delete(`/api/groups/${g.body.id}/members/${member.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    const after = await request(app).get('/api/groups').set(auth(member.token));
    expect(after.body).not.toContainEqual({ id: g.body.id, name: 'Second', role: 'member' });
  });

  it('plain members cannot add members', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm3@uga.edu');
    const res = await request(app)
      .post('/api/groups/1/members').set(auth(member.token))
      .send({ email: 'm3@uga.edu', role: 'admin' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/groups.test.ts`
Expected: FAIL — 404s.

- [ ] **Step 3: Implement groups router**

`server/src/routes/groups.ts`:

```ts
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
```

Mount in `server/src/app.ts`: `app.use('/api', groupRoutes(db));` with the matching import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): group listing/creation and membership management"
```

---

### Task 7: Password resets

**Files:**
- Create: `server/src/routes/resets.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/src/routes/resets.test.ts`

**Interfaces:**
- Produces routes:
  - `POST /api/password-resets {email}` (site admin, or admin of any group the target user belongs to) → `{token, expiresInHours: 24}`
  - `POST /api/auth/reset-password {token, newPassword}` (no auth) → 204; marks token used, updates hash, **deletes all of that user's sessions**
  - The reset-password route lives in `resets.ts` (mounted under `/api`, full path `/api/auth/reset-password`).

- [ ] **Step 1: Write failing tests**

`server/src/routes/resets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function registerMember(app: import('express').Express, adminToken: string, email: string): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'oldpassword', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

describe('password resets', () => {
  it('admin issues a reset; user sets a new password; old sessions die', async () => {
    const { app, adminToken } = await makeTestServer();
    const oldToken = await registerMember(app, adminToken, 'forgetful@uga.edu');

    const issued = await request(app)
      .post('/api/password-resets').set(auth(adminToken)).send({ email: 'forgetful@uga.edu' });
    expect(issued.status).toBe(200);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: issued.body.token, newPassword: 'brand-new-pw' });
    expect(reset.status).toBe(204);

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(401);

    const relogin = await request(app)
      .post('/api/auth/login').send({ email: 'forgetful@uga.edu', password: 'brand-new-pw' });
    expect(relogin.status).toBe(200);
  });

  it('reset token is single-use', async () => {
    const { app, adminToken } = await makeTestServer();
    await registerMember(app, adminToken, 'x@uga.edu');
    const issued = await request(app)
      .post('/api/password-resets').set(auth(adminToken)).send({ email: 'x@uga.edu' });
    await request(app).post('/api/auth/reset-password').send({ token: issued.body.token, newPassword: 'first-new-pw' });
    const again = await request(app)
      .post('/api/auth/reset-password').send({ token: issued.body.token, newPassword: 'second-new-pw' });
    expect(again.status).toBe(400);
  });

  it('a plain member cannot issue resets', async () => {
    const { app, adminToken } = await makeTestServer();
    const memberToken = await registerMember(app, adminToken, 'm@uga.edu');
    await registerMember(app, adminToken, 'target@uga.edu');
    const res = await request(app)
      .post('/api/password-resets').set(auth(memberToken)).send({ email: 'target@uga.edu' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/resets.test.ts`
Expected: FAIL — 404s.

- [ ] **Step 3: Implement resets router**

`server/src/routes/resets.ts`:

```ts
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
```

Mount in `server/src/app.ts`: `app.use('/api', resetRoutes(db));` with the matching import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat(server): admin-issued password resets (no email infrastructure)"
```

---

### Task 8: Diagram routes (create / list / open / save / delete)

**Files:**
- Create: `server/src/snapshots.ts`, `server/src/routes/diagrams.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/src/routes/diagrams.test.ts`

**Interfaces:**
- Produces: `packSnapshot(snapshot: unknown): Buffer` (gzip of JSON) and `unpackSnapshot(buf: Buffer): unknown` in `server/src/snapshots.ts`
- Produces routes (all auth + membership-checked):
  - `POST /api/diagrams {groupId, title, snapshot}` → `{id, currentVersionId}`
  - `GET /api/groups/:id/diagrams` → `[{id, title, updatedAt, lastEditor, versionCount}]` (newest first)
  - `GET /api/diagrams/:id` → `{id, groupId, title, currentVersionId, updatedAt, snapshot}`
  - `PUT /api/diagrams/:id {snapshot, title?}` → `{currentVersionId}` (appends a version; last-write-wins in Phase 1)
  - `DELETE /api/diagrams/:id` (creator, group admin, or site admin) → 204 (deletes versions + comments + diagram)
- `snapshot` is validated only as `z.record(z.string(), z.unknown())` — the server does not interpret diagram internals.

- [ ] **Step 1: Write failing tests**

`server/src/routes/diagrams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

const SNAP = { version: '1.6', name: 'Test', elements: [], connections: [], styleConfig: {}, transcript: null };

async function registerMember(app: import('express').Express, adminToken: string, email: string): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

describe('diagrams', () => {
  it('creates, lists, opens, and saves a diagram', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken))
      .send({ groupId: 1, title: 'Lesson 4 argument', snapshot: SNAP });
    expect(created.status).toBe(200);
    const { id } = created.body;

    const list = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id, title: 'Lesson 4 argument', versionCount: 1 });
    expect(list.body[0].lastEditor).toBeTypeOf('string');

    const opened = await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken));
    expect(opened.status).toBe(200);
    expect(opened.body.snapshot).toEqual(SNAP);

    const saved = await request(app)
      .put(`/api/diagrams/${id}`).set(auth(adminToken))
      .send({ snapshot: { ...SNAP, name: 'Renamed' }, title: 'Renamed' });
    expect(saved.status).toBe(200);
    expect(saved.body.currentVersionId).not.toBe(created.body.currentVersionId);

    const list2 = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
    expect(list2.body[0]).toMatchObject({ title: 'Renamed', versionCount: 2 });
  });

  it('every save is retained as a version row', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'T', snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number };
    expect(n).toBe(3);
  });

  it('non-members get 403 on every diagram route', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Private', snapshot: SNAP });
    const id = created.body.id;
    // outsider: a member of a *different* group only
    const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
    const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: g2.body.id });
    const reg = await request(app).post('/api/auth/register').send({
      inviteToken: inv.body.token, email: 'out@uga.edu', password: 'longenough',
      displayName: 'Out', acceptedPolicy: true,
    });
    const outsider = reg.body.token as string;

    expect((await request(app).get('/api/groups/1/diagrams').set(auth(outsider))).status).toBe(403);
    expect((await request(app).get(`/api/diagrams/${id}`).set(auth(outsider))).status).toBe(403);
    expect((await request(app).put(`/api/diagrams/${id}`).set(auth(outsider)).send({ snapshot: SNAP })).status).toBe(403);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(outsider))).status).toBe(403);
    expect(
      (await request(app).post('/api/diagrams').set(auth(outsider)).send({ groupId: 1, title: 'X', snapshot: SNAP })).status,
    ).toBe(403);
  });

  it('members can edit but only creator/admin can delete', async () => {
    const { app, adminToken } = await makeTestServer();
    const memberToken = await registerMember(app, adminToken, 'peer@uga.edu');
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Shared', snapshot: SNAP });
    const id = created.body.id;

    expect((await request(app).put(`/api/diagrams/${id}`).set(auth(memberToken)).send({ snapshot: SNAP })).status).toBe(200);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(memberToken))).status).toBe(403);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(adminToken))).status).toBe(204);
    expect((await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/routes/diagrams.test.ts`
Expected: FAIL — 404s.

- [ ] **Step 3: Implement snapshots.ts and diagrams router**

`server/src/snapshots.ts`:

```ts
import { gunzipSync, gzipSync } from 'node:zlib';

export function packSnapshot(snapshot: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'));
}

export function unpackSnapshot(buf: Buffer): unknown {
  return JSON.parse(gunzipSync(buf).toString('utf8'));
}
```

`server/src/routes/diagrams.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getRole } from '../access.js';
import { packSnapshot, unpackSnapshot } from '../snapshots.js';
import type { Db } from '../db.js';

const snapshotSchema = z.record(z.string(), z.unknown());

interface DiagramRow {
  id: number;
  group_id: number;
  creator_id: number;
  title: string;
  current_version_id: number;
  updated_at: string;
}

export function diagramRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAuth(db));

  function addVersion(diagramId: number, authorId: number, snapshot: unknown): number {
    const v = db
      .prepare('INSERT INTO diagram_versions (diagram_id, author_id, snapshot_gz) VALUES (?, ?, ?)')
      .run(diagramId, authorId, packSnapshot(snapshot));
    const versionId = Number(v.lastInsertRowid);
    db.prepare(`UPDATE diagrams SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      versionId, diagramId,
    );
    return versionId;
  }

  function getDiagramForMember(
    req: import('express').Request, res: import('express').Response,
  ): DiagramRow | null {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid diagram id' });
      return null;
    }
    const row = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(id) as DiagramRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'diagram not found' });
      return null;
    }
    if (getRole(db, req.user!.id, row.group_id) === null) {
      res.status(403).json({ error: 'not a member of this diagram’s group' });
      return null;
    }
    return row;
  }

  router.post('/diagrams', (req, res) => {
    const parsed = z
      .object({ groupId: z.number().int(), title: z.string().trim().min(1), snapshot: snapshotSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const { groupId, title, snapshot } = parsed.data;
    if (getRole(db, req.user!.id, groupId) === null) {
      res.status(403).json({ error: 'not a member of this group' });
      return;
    }
    let id = 0;
    let currentVersionId = 0;
    db.transaction(() => {
      const d = db
        .prepare('INSERT INTO diagrams (group_id, creator_id, title) VALUES (?, ?, ?)')
        .run(groupId, req.user!.id, title);
      id = Number(d.lastInsertRowid);
      currentVersionId = addVersion(id, req.user!.id, snapshot);
    })();
    res.json({ id, currentVersionId });
  });

  router.get('/groups/:id/diagrams', (req, res) => {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'invalid group id' });
      return;
    }
    if (getRole(db, req.user!.id, groupId) === null) {
      res.status(403).json({ error: 'not a member of this group' });
      return;
    }
    const rows = db
      .prepare(
        `SELECT d.id, d.title, d.updated_at AS updatedAt, u.display_name AS lastEditor,
                (SELECT COUNT(*) FROM diagram_versions v WHERE v.diagram_id = d.id) AS versionCount
         FROM diagrams d
         JOIN diagram_versions cv ON cv.id = d.current_version_id
         JOIN users u ON u.id = cv.author_id
         WHERE d.group_id = ?
         ORDER BY d.updated_at DESC, d.id DESC`,
      )
      .all(groupId);
    res.json(rows);
  });

  router.get('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const version = db
      .prepare('SELECT snapshot_gz FROM diagram_versions WHERE id = ?')
      .get(row.current_version_id) as { snapshot_gz: Buffer };
    res.json({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      currentVersionId: row.current_version_id,
      updatedAt: row.updated_at,
      snapshot: unpackSnapshot(version.snapshot_gz),
    });
  });

  router.put('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const parsed = z
      .object({ snapshot: snapshotSchema, title: z.string().trim().min(1).optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    let currentVersionId = 0;
    db.transaction(() => {
      currentVersionId = addVersion(row.id, req.user!.id, parsed.data.snapshot);
      if (parsed.data.title) {
        db.prepare('UPDATE diagrams SET title = ? WHERE id = ?').run(parsed.data.title, row.id);
      }
    })();
    res.json({ currentVersionId });
  });

  router.delete('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const isCreator = row.creator_id === req.user!.id;
    const isGroupAdmin = getRole(db, req.user!.id, row.group_id) === 'admin';
    if (!isCreator && !isGroupAdmin && !req.user!.isSiteAdmin) {
      res.status(403).json({ error: 'only the creator or a group admin can delete a diagram' });
      return;
    }
    db.transaction(() => {
      // current_version_id references diagram_versions; clear it before deleting versions
      db.prepare('UPDATE diagrams SET current_version_id = NULL WHERE id = ?').run(row.id);
      db.prepare('DELETE FROM comments WHERE diagram_id = ?').run(row.id);
      db.prepare('DELETE FROM diagram_versions WHERE diagram_id = ?').run(row.id);
      db.prepare('DELETE FROM diagrams WHERE id = ?').run(row.id);
    })();
    res.status(204).end();
  });

  return router;
}
```

Mount in `server/src/app.ts`: `app.use('/api', diagramRoutes(db));` with the matching import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: PASS (full suite).

- [ ] **Step 5: Typecheck and commit**

Run: `cd server && npm run typecheck`
Expected: no errors.

```bash
git add server/src
git commit -m "feat(server): diagram CRUD with gzipped version snapshots and membership enforcement"
```

---

### Task 9: Frontend API client + auth store

**Files:**
- Create: `src/api/client.ts`, `src/api/types.ts`, `src/api/authStore.ts`, `src/store/cloudStore.ts`
- Test: `src/api/client.test.ts`, `src/api/authStore.test.ts`

**Interfaces:**
- Consumes: server routes from Tasks 4–8.
- Produces (`src/api/client.ts`):
  - `DEFAULT_SERVER_URL: string` (from `import.meta.env.VITE_ETD_API_URL`, fallback `http://localhost:8787`)
  - `getServerUrl(): string` / `setServerUrl(url: string): void` (localStorage key `etd:serverUrl`; setServerUrl trims trailing `/`)
  - `getToken(): string | null` / `setToken(token: string | null): void` (localStorage key `etd:sessionToken`)
  - `class ApiError extends Error { status: number }`
  - `api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T>`
- Produces (`src/api/types.ts`):
  - `CloudUser = { id: number; email: string; displayName: string; isSiteAdmin: boolean }`
  - `CloudGroup = { id: number; name: string; role: 'admin' | 'member' }`
  - `DiagramListItem = { id: number; title: string; updatedAt: string; lastEditor: string; versionCount: number }`
  - `CloudDiagram = { id: number; groupId: number; title: string; currentVersionId: number; updatedAt: string; snapshot: SavedDiagramFile }`
  - `SavedDiagramFile = { version: string; name: string; elements: unknown[]; connections: unknown[]; styleConfig?: unknown; transcript?: unknown }`
- Produces (`src/api/authStore.ts`): zustand store `useAuthStore` with state `{ user: CloudUser | null; groups: CloudGroup[] }` and actions:
  - `signIn(email: string, password: string): Promise<void>` — POST login, setToken, fetch groups
  - `register(input: { inviteToken: string; email: string; password: string; displayName: string; acceptedPolicy: boolean }): Promise<void>`
  - `signOut(): Promise<void>` — POST logout (ignore errors), setToken(null), clear state
  - `restore(): Promise<void>` — if a token exists, GET `/api/auth/me` + `/api/groups`; on 401 clear token silently
- Produces (`src/store/cloudStore.ts`): zustand store `useCloudStore` with `{ diagramId: number | null; groupId: number | null; setCloudTarget(diagramId: number, groupId: number): void; clearCloudTarget(): void }`

- [ ] **Step 1: Write failing tests**

`src/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getServerUrl, getToken, setServerUrl, setToken } from './client';

describe('client config', () => {
  beforeEach(() => localStorage.clear());

  it('defaults the server URL and persists an override without a trailing slash', () => {
    expect(getServerUrl()).toBe('http://localhost:8787');
    setServerUrl('https://etd.example.org/');
    expect(getServerUrl()).toBe('https://etd.example.org');
  });

  it('persists and clears the token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe('api()', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('sends the bearer token and JSON body, parses JSON responses', async () => {
    setToken('tok123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api<{ ok: boolean }>('/api/health', { method: 'POST', body: { a: 1 } });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8787/api/health');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect(init!.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws ApiError with the server message on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid email or password' }), { status: 401 }),
    );
    await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'invalid email or password',
    });
    await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
  });

  it('returns undefined for 204 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
```

`src/api/authStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { getToken, setToken } from './client';

const USER = { id: 1, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false };
const GROUPS = [{ id: 1, name: 'COMS', role: 'member' }];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, groups: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('signIn stores the token, user, and groups', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/login')) return jsonResponse({ token: 'tok', user: USER });
      if (url.endsWith('/api/groups')) return jsonResponse(GROUPS);
      throw new Error(`unexpected fetch: ${url}`);
    });
    await useAuthStore.getState().signIn('a@uga.edu', 'pw123456');
    expect(getToken()).toBe('tok');
    expect(useAuthStore.getState().user).toEqual(USER);
    expect(useAuthStore.getState().groups).toEqual(GROUPS);
  });

  it('restore clears a dead token silently', async () => {
    setToken('stale');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    await useAuthStore.getState().restore();
    expect(getToken()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('signOut clears state even if the server call fails', async () => {
    setToken('tok');
    useAuthStore.setState({ user: USER, groups: GROUPS as never });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await useAuthStore.getState().signOut();
    expect(getToken()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().groups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement the four modules**

`src/api/types.ts`:

```ts
export interface CloudUser {
  id: number;
  email: string;
  displayName: string;
  isSiteAdmin: boolean;
}

export interface CloudGroup {
  id: number;
  name: string;
  role: 'admin' | 'member';
}

export interface DiagramListItem {
  id: number;
  title: string;
  updatedAt: string;
  lastEditor: string;
  versionCount: number;
}

/** Exactly the shape saveDiagramJson writes to local .json files. */
export interface SavedDiagramFile {
  version: string;
  name: string;
  elements: unknown[];
  connections: unknown[];
  styleConfig?: unknown;
  transcript?: unknown;
}

export interface CloudDiagram {
  id: number;
  groupId: number;
  title: string;
  currentVersionId: number;
  updatedAt: string;
  snapshot: SavedDiagramFile;
}
```

`src/api/client.ts`:

```ts
const SERVER_URL_KEY = 'etd:serverUrl';
const TOKEN_KEY = 'etd:sessionToken';

export const DEFAULT_SERVER_URL: string =
  (import.meta.env.VITE_ETD_API_URL as string | undefined) ?? 'http://localhost:8787';

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ''));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getServerUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

`src/api/authStore.ts`:

```ts
import { create } from 'zustand';
import { api, ApiError, getToken, setToken } from './client';
import type { CloudGroup, CloudUser } from './types';

interface AuthState {
  user: CloudUser | null;
  groups: CloudGroup[];
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    inviteToken: string;
    email: string;
    password: string;
    displayName: string;
    acceptedPolicy: boolean;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  groups: [],

  signIn: async (email, password) => {
    const res = await api<{ token: string; user: CloudUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    const groups = await api<CloudGroup[]>('/api/groups');
    set({ user: res.user, groups });
  },

  register: async (input) => {
    const res = await api<{ token: string; user: CloudUser }>('/api/auth/register', {
      method: 'POST',
      body: input,
    });
    setToken(res.token);
    const groups = await api<CloudGroup[]>('/api/groups');
    set({ user: res.user, groups });
  },

  signOut: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // clearing local state matters more than the server call succeeding
    }
    setToken(null);
    set({ user: null, groups: [] });
  },

  restore: async () => {
    if (!getToken()) return;
    try {
      const user = await api<CloudUser>('/api/auth/me');
      const groups = await api<CloudGroup[]>('/api/groups');
      set({ user, groups });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        set({ user: null, groups: [] });
      }
      // network errors: stay signed out this session but keep the token for next launch
    }
  },
}));
```

`src/store/cloudStore.ts`:

```ts
import { create } from 'zustand';

/** Tracks which cloud diagram (if any) the canvas currently corresponds to. */
interface CloudState {
  diagramId: number | null;
  groupId: number | null;
  setCloudTarget: (diagramId: number, groupId: number) => void;
  clearCloudTarget: () => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  diagramId: null,
  groupId: null,
  setCloudTarget: (diagramId, groupId) => set({ diagramId, groupId }),
  clearCloudTarget: () => set({ diagramId: null, groupId: null }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api`
Expected: PASS. Then run the full frontend suite: `npm test` — everything still green.

- [ ] **Step 5: Commit**

```bash
git add src/api src/store/cloudStore.ts
git commit -m "feat(cloud): API client, auth store, and cloud-target store"
```

---

### Task 10: Sign-in / registration UI

**Files:**
- Create: `src/components/Cloud/SignInModal.tsx`, `src/components/Cloud/CloudMenu.tsx`, `src/components/Cloud/index.ts`
- Modify: `src/components/Toolbar/Toolbar.tsx` (render `<CloudMenu />`), `src/App.tsx` (call `restore()` once on mount)

**Interfaces:**
- Consumes: `useAuthStore`, `getServerUrl`/`setServerUrl`/`DEFAULT_SERVER_URL` from `src/api/client`, `Modal` from `src/components/ui/Modal`, `useToastStore`.
- Produces: `CloudMenu` — a toolbar dropdown (follow the existing `MoreMenu.tsx` pattern and `useMenu.ts` hook in `src/components/Toolbar/`). Signed out: single item "Sign in…". Signed in: header row with display name, items "Save to cloud…" and "Library…" (both disabled placeholders until Tasks 11–12 wire them — render them but with `disabled` until those tasks), and "Sign out".
- Produces: `SignInModal` with two modes:
  - **Sign in** (default): email, password, collapsible "Server" section showing a server URL input prefilled from `getServerUrl()`; submit calls `setServerUrl(...)` then `signIn(...)`.
  - **Register**: shown when the app URL contains `?invite=<token>`; fields displayName, email, password (min 8, with hint), and a required checkbox with EXACTLY this label: *"I understand that only de-identified data may be uploaded — no names or other identifying information in transcripts, images, or diagram content."* Submit calls `register({...})`. If the URL also contains `?server=<url>`, call `setServerUrl(decodeURIComponent(value))` before registering and prefill the server field.
- Behavior details:
  - Errors from `signIn`/`register` render inline in the modal (red text under the form), not as toasts.
  - On success: close modal, `addToast('info', 'Signed in as <displayName>')`, and remove `invite`/`server` params from the URL via `history.replaceState`.
  - `App.tsx`: add `useEffect(() => { void useAuthStore.getState().restore(); }, []);`
  - CloudMenu on mount: if `new URLSearchParams(window.location.search).get('invite')` is non-null, open SignInModal in register mode automatically.

- [ ] **Step 1: Implement SignInModal**

Component skeleton (fill in styling to match existing modals — see `src/components/Toolbar/AboutModal.tsx` for Modal usage conventions):

```tsx
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useAuthStore } from '../../api/authStore';
import { getServerUrl, setServerUrl } from '../../api/client';
import { useToastStore } from '../../store/toastStore';

export const POLICY_LABEL =
  'I understand that only de-identified data may be uploaded — no names or other identifying information in transcripts, images, or diagram content.';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  inviteToken: string | null; // non-null ⇒ register mode
  initialServerUrl?: string;
}

export function SignInModal({ open, onClose, inviteToken, initialServerUrl }: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [serverUrl, setServer] = useState(initialServerUrl ?? getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registerMode = inviteToken !== null;

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      setServerUrl(serverUrl);
      if (registerMode) {
        await useAuthStore.getState().register({
          inviteToken: inviteToken!, email, password, displayName, acceptedPolicy,
        });
      } else {
        await useAuthStore.getState().signIn(email, password);
      }
      const name = useAuthStore.getState().user?.displayName ?? email;
      useToastStore.getState().addToast('info', `Signed in as ${name}`);
      window.history.replaceState(null, '', window.location.pathname);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  };

  // Render: Modal size="sm", title = registerMode ? 'Create account' : 'Sign in',
  // form fields per mode, policy checkbox (register mode, required before submit
  // button enables), collapsible server URL input, inline error, footer with
  // primary submit button (data-modal-focus="primary", disabled while busy or,
  // in register mode, until acceptedPolicy).
  ...
}
```

(The `...` is the JSX using the state above — labeled inputs bound to each state setter, `<label>` with `<input type="checkbox">` for the policy, and a footer `<button onClick={handleSubmit}>`. Match the visual style of existing modal forms.)

- [ ] **Step 2: Implement CloudMenu and mount it**

`CloudMenu.tsx`: follow `MoreMenu.tsx`'s structure (same `useMenu` hook, `MenuItem` components, `IconButton` trigger — use the `Cloud` icon from `lucide-react`). State: `const user = useAuthStore((s) => s.user);` plus `signInOpen` local state and the invite-param check:

```tsx
const [params] = useState(() => new URLSearchParams(window.location.search));
const inviteToken = params.get('invite');
const serverParam = params.get('server');
const [signInOpen, setSignInOpen] = useState(inviteToken !== null);
```

Menu contents:
- signed out → `MenuItem` "Sign in…" → `setSignInOpen(true)`
- signed in → non-interactive header showing `user.displayName`, "Save to cloud…" (disabled, tooltip "coming in this release" — enabled in Task 11), "Library…" (disabled — enabled in Task 12), "Sign out" → `void useAuthStore.getState().signOut()` + toast `'Signed out'`.

Render `<SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} inviteToken={inviteToken} initialServerUrl={serverParam ? decodeURIComponent(serverParam) : undefined} />`.

`src/components/Cloud/index.ts`:

```ts
export { CloudMenu } from './CloudMenu';
export { SignInModal } from './SignInModal';
```

In `src/components/Toolbar/Toolbar.tsx`, render `<CloudMenu />` in the toolbar next to the existing `MoreMenu` usage. In `src/App.tsx`, add the one-time restore effect from the Interfaces block.

- [ ] **Step 3: Verify manually against a live server**

```bash
cd server && ETD_ADMIN_EMAIL=admin@test.edu ETD_ADMIN_PASSWORD=admin-pw-123 npm start
# separate terminal:
npm run dev
```

In the browser (Claude for Chrome): sign in as the admin → toast appears, menu shows display name. Sign out. Create an invite (`curl -X POST http://localhost:8787/api/invites -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"groupId":1}'` — get the token from the login response), then visit `http://localhost:5173/?invite=<token>` → register modal opens; submit stays disabled until the policy box is checked; register succeeds.

- [ ] **Step 4: Lint, typecheck, test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Cloud src/components/Toolbar/Toolbar.tsx src/App.tsx
git commit -m "feat(cloud): sign-in/register UI with invite links and data-policy acknowledgment"
```

---

### Task 11: Cloud save flow

**Files:**
- Create: `src/components/Cloud/CloudSaveDialog.tsx`
- Modify: `src/utils/saveDiagram.ts` (extract `buildDiagramFile`), `src/components/Cloud/CloudMenu.tsx` (enable "Save to cloud…"), `src/App.tsx` (clear cloud target on local load / recovery)
- Test: `src/utils/saveDiagram.test.ts` (extend)

**Interfaces:**
- Consumes: `DiagramSnapshot` + `saveDiagramJson` from `src/utils/saveDiagram.ts`, `useDiagramStore`, `useCloudStore`, `useAuthStore`, `api` client.
- Produces: `buildDiagramFile(snapshot: DiagramSnapshot): SavedDiagramFile` in `src/utils/saveDiagram.ts` — the `{version, name, elements, connections, styleConfig, transcript}` object currently built inline in `saveDiagramJson`; `saveDiagramJson` now calls it.
- Produces: `CloudSaveDialog` and a `saveToCloud()` flow in CloudMenu:
  - If `useCloudStore.getState().diagramId` is set → immediate `PUT /api/diagrams/:id` with `{snapshot: buildDiagramFile(...), title: diagramName}`, toast `'Saved to cloud'`. No dialog.
  - Else → open `CloudSaveDialog`: group select (from `useAuthStore` groups; hidden when only one), title input prefilled with the store's `diagramName`, and this exact reminder line above the buttons: *"Reminder: only de-identified data may be saved to the shared library."* Save → `POST /api/diagrams`, then `setCloudTarget(res.id, groupId)`, toast `'Saved to cloud'`.
  - Errors → `addToast('error', message)` from the caught `ApiError`.

- [ ] **Step 1: Write failing test for buildDiagramFile**

Add to `src/utils/saveDiagram.test.ts`:

```ts
import { buildDiagramFile } from './saveDiagram';
import { SAVE_SCHEMA_VERSION } from './schema';

describe('buildDiagramFile', () => {
  it('produces the exact local save-file shape', () => {
    const file = buildDiagramFile({
      diagramName: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {} as never,
      transcript: null,
    });
    expect(file).toEqual({
      version: SAVE_SCHEMA_VERSION,
      name: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {},
      transcript: null,
    });
  });
});
```

(merge imports with the file's existing imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/saveDiagram.test.ts`
Expected: FAIL — `buildDiagramFile` not exported.

- [ ] **Step 3: Extract buildDiagramFile**

In `src/utils/saveDiagram.ts`:

```ts
export function buildDiagramFile(snapshot: DiagramSnapshot) {
  return {
    version: SAVE_SCHEMA_VERSION,
    name: snapshot.diagramName,
    elements: snapshot.elements,
    connections: snapshot.connections,
    styleConfig: snapshot.styleConfig,
    transcript: snapshot.transcript,
  };
}
```

and change `saveDiagramJson` to `const data = buildDiagramFile(snapshot);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/saveDiagram.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement CloudSaveDialog + wire the menu item**

`CloudSaveDialog.tsx` core logic (styling per existing modals):

```tsx
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { buildDiagramFile } from '../../utils/saveDiagram';

export const SAVE_REMINDER = 'Reminder: only de-identified data may be saved to the shared library.';

export function CloudSaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = useAuthStore((s) => s.groups);
  const diagramName = useDiagramStore((s) => s.diagramName);
  const [title, setTitle] = useState(diagramName);
  const [groupId, setGroupId] = useState<number>(groups[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      const s = useDiagramStore.getState();
      const snapshot = buildDiagramFile({
        diagramName: title,
        elements: s.elements,
        connections: s.connections,
        styleConfig: s.styleConfig,
        transcript: s.transcript,
      });
      const res = await api<{ id: number; currentVersionId: number }>('/api/diagrams', {
        method: 'POST',
        body: { groupId, title, snapshot },
      });
      useCloudStore.getState().setCloudTarget(res.id, groupId);
      useToastStore.getState().addToast('info', 'Saved to cloud');
      onClose();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'cloud save failed');
    } finally {
      setBusy(false);
    }
  };
  // Render: Modal size="sm" title="Save to cloud"; group <select> (hidden when
  // groups.length === 1), title <input>, SAVE_REMINDER paragraph, footer Save
  // button (data-modal-focus="primary", disabled while busy or title empty).
  ...
}
```

**Check the actual field names on `useDiagramStore`** before wiring (`elements`, `connections`, `diagramName`, `transcript`, `styleConfig` — confirm in `src/store/diagramStore.ts`; `useAutoSave.ts` reads the same fields and is the reference for the correct names).

In `CloudMenu.tsx`, enable "Save to cloud…":

```tsx
const handleCloudSave = async () => {
  const { diagramId } = useCloudStore.getState();
  if (diagramId === null) {
    setSaveDialogOpen(true);
    return;
  }
  try {
    const s = useDiagramStore.getState();
    const snapshot = buildDiagramFile({
      diagramName: s.diagramName, elements: s.elements, connections: s.connections,
      styleConfig: s.styleConfig, transcript: s.transcript,
    });
    await api(`/api/diagrams/${diagramId}`, { method: 'PUT', body: { snapshot, title: s.diagramName } });
    useToastStore.getState().addToast('info', 'Saved to cloud');
  } catch (err) {
    useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'cloud save failed');
  }
};
```

In `src/App.tsx`: in `handleFileLoad` (local file open, around `src/App.tsx:213`) and in the autosave-recovery load (around `src/App.tsx:92`), add `useCloudStore.getState().clearCloudTarget();` after `loadDiagram(...)`, and the same in whatever handler calls `clearDiagram` for "New diagram" — a locally opened or new diagram is not linked to any cloud diagram until explicitly saved there.

- [ ] **Step 6: Verify manually**

With server + dev app running (as in Task 10): draw a couple of elements → Cloud menu → "Save to cloud…" → dialog shows reminder → save → toast. Save again → no dialog, direct save. Check the server: `GET /api/groups/1/diagrams` shows `versionCount: 2`.

- [ ] **Step 7: Lint, typecheck, test, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/components/Cloud src/utils/saveDiagram.ts src/utils/saveDiagram.test.ts src/App.tsx
git commit -m "feat(cloud): save-to-cloud flow with first-save dialog and policy reminder"
```

---

### Task 12: Library modal (browse / open / delete)

**Files:**
- Create: `src/components/Cloud/LibraryModal.tsx`
- Modify: `src/components/Cloud/CloudMenu.tsx` (enable "Library…")

**Interfaces:**
- Consumes: `api`, `DiagramListItem`, `CloudDiagram` from `src/api`, `useAuthStore`, `useCloudStore`, `useDiagramStore` (`loadDiagram`), `confirmAsync` from `src/store/confirmStore`, `useToastStore`.
- Produces: `LibraryModal({ open, onClose })`:
  - On open (and on group switch): `GET /api/groups/:groupId/diagrams` into local state; loading spinner text "Loading…"; errors → error toast + empty state.
  - Group `<select>` when the user has >1 group; default = first group.
  - Rows: title, lastEditor, `new Date(updatedAt + 'Z').toLocaleString()`, version count. (SQLite `datetime('now')` is UTC without a zone suffix — append `'Z'` before parsing.)
  - Click row → `GET /api/diagrams/:id`, then load using the same loose pattern as `App.tsx handleFileLoad` (`src/App.tsx:213-230`): if `snapshot.elements && snapshot.connections`, call `loadDiagram(snapshot.elements, snapshot.connections, snapshot.name, snapshot.transcript ?? null, snapshot.styleConfig)`, then `setCloudTarget(diagram.id, diagram.groupId)`, close the modal, toast `'Opened "<title>" from cloud'`. Otherwise error toast `'that cloud diagram looks corrupted'`.
  - Per-row delete (trash icon): `confirmAsync({ title: 'Delete diagram', message: 'Delete "<title>" from the shared library? All of its versions will be removed.', confirmLabel: 'Delete', variant: 'destructive' })` → `DELETE /api/diagrams/:id` → refresh list. A 403 lands in the error toast ("only the creator or a group admin can delete a diagram").

- [ ] **Step 1: Implement LibraryModal**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import type { CloudDiagram, DiagramListItem } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';

export function LibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = useAuthStore((s) => s.groups);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<DiagramListItem[] | null>(null);
  const effectiveGroupId = groupId ?? groups[0]?.id ?? null;

  const refresh = useCallback(async () => {
    if (effectiveGroupId === null) return;
    setItems(null);
    try {
      setItems(await api<DiagramListItem[]>(`/api/groups/${effectiveGroupId}/diagrams`));
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'failed to load library');
      setItems([]);
    }
  }, [effectiveGroupId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleOpen = async (item: DiagramListItem) => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      if (!snap.elements || !snap.connections) {
        useToastStore.getState().addToast('error', 'that cloud diagram looks corrupted');
        return;
      }
      useDiagramStore.getState().loadDiagram(
        snap.elements as never, snap.connections as never, snap.name,
        (snap.transcript ?? null) as never, snap.styleConfig as never,
      );
      useCloudStore.getState().setCloudTarget(d.id, d.groupId);
      useToastStore.getState().addToast('info', `Opened "${d.title}" from cloud`);
      onClose();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'failed to open diagram');
    }
  };

  const handleDelete = async (item: DiagramListItem) => {
    const ok = await confirmAsync({
      title: 'Delete diagram',
      message: `Delete "${item.title}" from the shared library? All of its versions will be removed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'DELETE' });
      if (useCloudStore.getState().diagramId === item.id) useCloudStore.getState().clearCloudTarget();
      void refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'delete failed');
    }
  };
  // Render: Modal size="lg" title="Group library"; group <select> when
  // groups.length > 1 (onChange={(e) => setGroupId(Number(e.target.value))});
  // "Loading…" while items === null; empty state "No diagrams yet — use
  // 'Save to cloud' to add the first one."; otherwise a table/list where each
  // row is a button calling handleOpen(item), showing title, lastEditor,
  // new Date(item.updatedAt + 'Z').toLocaleString(), `${item.versionCount} versions`,
  // and a Trash2 icon button calling handleDelete(item) with stopPropagation.
  ...
}
```

Check `loadDiagram`'s exact parameter types in `src/store/diagramStore.ts` and replace the `as never` casts with the real types if they line up cleanly (they should — the snapshot came from the same store).

In `CloudMenu.tsx`, wire "Library…" to open the modal.

- [ ] **Step 2: Verify manually**

Two-account walkthrough with the dev server: save a diagram as the admin → sign out → sign in as the member (registered in Task 10) → Library shows the diagram with the admin as last editor → open it → canvas renders it → edit → Save to cloud → reopen library, `versionCount` incremented and lastEditor is now the member. Delete as member → error toast (member isn't creator). Delete as admin → row disappears.

- [ ] **Step 3: Lint, typecheck, test, commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/components/Cloud
git commit -m "feat(cloud): group library modal — browse, open, delete shared diagrams"
```

---

### Task 13: Deployment artifacts (COMS Mac + self-hosting)

**Files:**
- Create: `server/.env.example`, `server/README.md`, `server/deploy/com.etd.server.plist`, `server/deploy/com.etd.backup.plist`, `server/deploy/backup.sh`

**Interfaces:** none (documentation + config; nothing imports these).

- [ ] **Step 1: Write .env.example**

```bash
# etd-server configuration — copy to .env location of your choice or export in the launchd plist
PORT=8787
ETD_DB_PATH=/Users/YOUR_USER/etd-data/etd.sqlite
# Only read when the database is empty (first launch):
ETD_ADMIN_EMAIL=you@example.edu
ETD_ADMIN_PASSWORD=change-me-before-first-launch
ETD_INITIAL_GROUP=COMS
```

- [ ] **Step 2: Write backup.sh**

```bash
#!/bin/bash
# Nightly SQLite snapshot. Point ETD_BACKUP_DIR at a folder synced by
# OneDrive (UGA-approved storage) so offsite copies happen automatically.
set -euo pipefail

DB="${ETD_DB_PATH:?set ETD_DB_PATH}"
DEST="${ETD_BACKUP_DIR:?set ETD_BACKUP_DIR}"
KEEP=30

mkdir -p "$DEST"
STAMP="$(date +%Y-%m-%d)"
sqlite3 "$DB" ".backup '$DEST/etd-$STAMP.sqlite'"

# prune: keep the newest $KEEP snapshots
ls -1t "$DEST"/etd-*.sqlite 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r f; do
  rm -- "$f"
done
echo "backup ok: $DEST/etd-$STAMP.sqlite"
```

`chmod +x server/deploy/backup.sh`.

- [ ] **Step 3: Write the two launchd plists**

`server/deploy/com.etd.server.plist` (paths marked EDIT-ME are machine-specific):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.etd.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/EDIT-ME/path/to/node</string> <!-- `which node` -->
    <string>node_modules/.bin/tsx</string>
    <string>src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>/EDIT-ME/path/to/etd/server</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>8787</string>
    <key>ETD_DB_PATH</key><string>/EDIT-ME/path/to/etd-data/etd.sqlite</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/EDIT-ME/path/to/etd-data/server.log</string>
  <key>StandardErrorPath</key><string>/EDIT-ME/path/to/etd-data/server.err.log</string>
</dict>
</plist>
```

`server/deploy/com.etd.backup.plist`: same skeleton with `Label` `com.etd.backup`, `ProgramArguments` = `[/bin/bash, /EDIT-ME/path/to/etd/server/deploy/backup.sh]`, `EnvironmentVariables` including `ETD_DB_PATH` and `ETD_BACKUP_DIR`, no `KeepAlive`, and:

```xml
<key>StartCalendarInterval</key>
<dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
```

- [ ] **Step 4: Write server/README.md**

Sections (write each fully):
1. **What this is** — one paragraph: the ETD groupware backend; one Node process + one SQLite file; the editor frontend talks to it over HTTPS.
2. **Quick start (any machine)** — `cd server && npm install`, first-launch env vars (`ETD_ADMIN_EMAIL`, `ETD_ADMIN_PASSWORD`, optional `ETD_INITIAL_GROUP`, `ETD_DB_PATH`, `PORT`), `npm start`, verify `curl localhost:8787/api/health`. Note: admin email/password are only read when the DB is empty.
3. **Admin cookbook (curl)** — copy-paste examples with a `$TOKEN` variable: log in; create an invite and turn it into a link (`https://<your-frontend>/?invite=<TOKEN>&server=<https%3A%2F%2Fyour-api-host>`); create a group; add/remove a member; issue a password reset and the link-free instruction to run `POST /api/auth/reset-password`.
4. **COMS Mac setup** — FileVault on; Energy Saver: never sleep; install Node ≥ 20; clone repo; fill in the two plists (EDIT-ME paths), copy to `/Library/LaunchDaemons/`, `sudo launchctl load /Library/LaunchDaemons/com.etd.server.plist` (same for backup); where the logs are.
5. **Exposing it to the internet** — the Mac must not open inbound ports; use an outbound tunnel. Two documented options with links to their own docs: Cloudflare Tunnel (needs a domain on Cloudflare; map `etd-api.<domain>` → `localhost:8787`) or Tailscale Funnel (no domain needed; serves on a `*.ts.net` hostname). Flag: **confirm with UGA IT that a tunneled service on an office machine is permitted** before going live.
6. **Backups** — how backup.sh works, pointing `ETD_BACKUP_DIR` into the OneDrive-synced folder, restore procedure (`stop the daemon, copy the snapshot over ETD_DB_PATH, start`).
7. **Connecting the frontend** — set `VITE_ETD_API_URL` at build time for the default, and/or type the server URL in the app's Sign in → Server field. Data policy note: this system is for **de-identified data only**.

- [ ] **Step 5: Commit**

```bash
git add server/.env.example server/README.md server/deploy
git commit -m "docs(server): deployment guide, launchd daemons, nightly OneDrive-synced backups"
```

---

### Task 14: Full verification pass

**Files:** none created; fixes only if something fails.

- [ ] **Step 1: Run every automated check**

```bash
npm run lint && npm run typecheck && npm test && npm run build
cd server && npm run typecheck && npm test
```

Expected: all green, including the production build (server code must not leak into the Vite build).

- [ ] **Step 2: Full browser walkthrough (Claude for Chrome)**

Against a fresh server (`rm -rf server/data` first, then start with bootstrap env vars):

1. Signed-out sanity: draw, local save, local open, autosave recovery — identical to pre-feature behavior.
2. Sign in as admin. Create an invite via curl; open the invite URL in the app; register a second account (policy checkbox required).
3. As admin: build a small diagram with a transcript attached, save to cloud (dialog + reminder shown), save again (no dialog).
4. As member: open the library, open the diagram — elements, styles, and transcript all present; edit; save to cloud.
5. As admin: library shows member as last editor, versionCount 3; member cannot delete (error toast); admin deletes successfully.
6. Kill the server; try a cloud save → clean error toast, app keeps working locally.

- [ ] **Step 3: Fix anything found, re-run, commit**

```bash
git add -A
git commit -m "test(cloud): phase-1 verification fixes"
```

(Skip the commit if nothing changed.)

- [ ] **Step 4: Wrap up**

Announce Phase 1 complete. Do NOT deploy to jenkleiman.com or the office Mac without explicit go-ahead — deployment day needs the tunnel decision and the UGA IT policy check (spec's open item).
