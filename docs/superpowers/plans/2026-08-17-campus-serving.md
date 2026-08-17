# Campus-VPN Same-Origin Serving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the ETD server serve the built frontend (same-origin app + API) so the COMS team can use the cloud features at `http://<campus-ip>:<port>/` over the UGA VPN, with a no-admin (LaunchAgent) operations guide.

**Architecture:** Optional `ETD_STATIC_DIR` env var; when set, `createApp` serves static files after the `/api` routes plus an SPA fallback for non-`/api` GET requests. Frontend production builds default the server URL to `window.location.origin` when `VITE_ETD_API_URL` is unset (dev keeps `http://localhost:8787`). Docs gain a campus-VPN deployment variant.

**Tech Stack:** unchanged (Express 5, vitest; React frontend).

**Spec:** `docs/superpowers/specs/2026-08-17-groupware-design.md` — Addendum section.

## Global Constraints

- `/api/*` behavior must be byte-identical to today: JSON responses, JSON 404 fallback, JSON error middleware still last.
- Static serving is strictly opt-in: without `ETD_STATIC_DIR`, the server behaves exactly as before (all existing tests keep passing unmodified).
- No real campus IPs/hostnames anywhere in the repo — placeholders only (`<campus-ip>` / EDIT-ME).
- Existing verification recipe: root `npm run lint` (baseline 17 pre-existing problems, zero new), `npx tsc -b`, `npm test` (144), `npm run build`; server `npm run typecheck`, `npx vitest run` (40 + new).
- Commit after every task.

---

### Task 1: Server static serving + SPA fallback

**Files:**
- Modify: `server/src/app.ts` (add `opts` param + static/SPA blocks), `server/src/index.ts` (pass env)
- Test: `server/src/app.test.ts` (extend)

**Interfaces:**
- Produces: `createApp(db: Db, opts?: { staticDir?: string }): express.Express` — existing single-arg calls stay valid.

- [ ] **Step 1: Write failing tests**

Add to `server/src/app.test.ts` (merge imports; `mkdtempSync`/`writeFileSync`/`mkdirSync` from `node:fs`, `tmpdir` from `node:os`, `join` from `node:path`):

```ts
describe('static serving (ETD_STATIC_DIR)', () => {
  function makeStaticDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'etd-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ETD</title>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
    return dir;
  }

  it('serves index.html at / and static assets when staticDir is set', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const root = await request(app).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('<title>ETD</title>');
    const asset = await request(app).get('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('console.log');
  });

  it('serves index.html for unknown non-api GET routes (SPA fallback)', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const res = await request(app).get('/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>ETD</title>');
  });

  it('keeps /api JSON behavior with staticDir set', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const health = await request(app).get('/api/health');
    expect(health.body).toEqual({ ok: true });
    const unknown = await request(app).get('/api/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBeTypeOf('string');
  });

  it('returns 404 for / when staticDir is not set (unchanged behavior)', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd server && npx vitest run src/app.test.ts`
Expected: the three staticDir tests FAIL (createApp takes no opts / returns 404s); existing tests pass.

- [ ] **Step 3: Implement**

In `server/src/app.ts`: add `import { resolve } from 'node:path';`, change the signature to `createApp(db: Db, opts: { staticDir?: string } = {})`, and insert AFTER the `/api` JSON-404 fallback and BEFORE the error middleware:

```ts
// Optional same-origin frontend hosting (campus-VPN deployment):
// static assets plus an SPA fallback for client-side routes. Mounted after
// all /api handlers so API behavior is unchanged.
if (opts.staticDir) {
  const staticDir = resolve(opts.staticDir);
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(resolve(staticDir, 'index.html'));
  });
}
```

In `server/src/index.ts`, pass it through:

```ts
createApp(db, { staticDir: process.env.ETD_STATIC_DIR }).listen(port, () => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run && npm run typecheck`
Expected: all pass (40 + 4 new), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/index.ts server/src/app.test.ts
git commit -m "feat(server): optional same-origin frontend serving via ETD_STATIC_DIR"
```

---

### Task 2: Frontend same-origin default server URL

**Files:**
- Modify: `src/api/client.ts`
- Test: `src/api/client.test.ts` (extend comment/assertion only)

**Interfaces:**
- `DEFAULT_SERVER_URL` semantics change: `VITE_ETD_API_URL` if set; else `http://localhost:8787` in dev (and in non-browser test envs); else `window.location.origin` in production builds.

- [ ] **Step 1: Update the implementation**

In `src/api/client.ts` replace the `DEFAULT_SERVER_URL` definition with:

```ts
// Server URL default: explicit env wins; dev (and non-browser test envs)
// falls back to the local server; production builds served by the ETD
// server itself default to same-origin (campus-VPN deployment).
export const DEFAULT_SERVER_URL: string =
  (import.meta.env.VITE_ETD_API_URL as string | undefined) ??
  (import.meta.env.DEV || typeof window === 'undefined'
    ? 'http://localhost:8787'
    : window.location.origin);
```

- [ ] **Step 2: Extend the existing default-URL test**

In `src/api/client.test.ts`, the existing test asserting `getServerUrl()` returns `http://localhost:8787` still holds (vitest runs with `DEV` true and no DOM). Add one line of comment above it noting that production builds default to `window.location.origin` instead, verified manually in Task 3's walkthrough.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/api && npx tsc -b && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat(cloud): default server URL to same-origin in production builds"
```

---

### Task 3: Campus-VPN deployment docs + LaunchAgent

**Files:**
- Create: `server/deploy/com.etd.server.agent.plist`
- Modify: `server/README.md`, `server/.env.example`

**Interfaces:** none (docs/config).

- [ ] **Step 1: Write the LaunchAgent plist**

`server/deploy/com.etd.server.agent.plist` — same skeleton as `com.etd.server.plist` with: `Label` `com.etd.server.agent`, an added `ETD_STATIC_DIR` env entry (`/EDIT-ME/path/to/etd/dist`), and a comment header noting it installs to `~/Library/LaunchAgents/` (user-level, NO admin required, runs only while the user is logged in).

- [ ] **Step 2: Add the README section**

New section in `server/README.md` after the tunnel section: **"Campus-network / VPN deployment (no admin required)"** covering, fully written:
1. When to use it: no admin password obtainable; team already reaches this machine over the campus network / UGA VPN (placeholders like `<campus-ip>` only — never a real IP).
2. Build the frontend for same-origin: at repo root, `npm run build` with `VITE_ETD_API_URL` unset; the built app defaults its server URL to the address it is loaded from. Set `ETD_STATIC_DIR` to the repo's `dist/` path.
3. LaunchAgent install: fill EDIT-ME paths in `deploy/com.etd.server.agent.plist`, copy to `~/Library/LaunchAgents/`, `launchctl load ~/Library/LaunchAgents/com.etd.server.agent.plist`. Same pattern for the backup plist at user level.
4. Keeping the Mac awake without admin: a `caffeinate` LaunchAgent (inline 10-line plist snippet running `/usr/bin/caffeinate -dims`).
5. Trade-offs, stated plainly: after a reboot the server is down until someone logs into the account; FileVault can't be enabled without admin; on-campus traffic is plain HTTP (off-campus leg is encrypted by the UGA VPN). Note that the de-identified-data-only policy is the primary control and that a tunnel/cert upgrade needs no code changes later.
6. Team usage: visit `http://<campus-ip>:<port>/` (VPN on when off campus); invite links are `http://<campus-ip>:<port>/?invite=<TOKEN>` (no `server` param needed — same-origin default).
7. Note that jenkleiman.com continues to host the public local-files-only editor; its cloud sign-in cannot reach a plain-HTTP campus server (browser mixed-content rule) — use the campus URL for cloud work.

Add `ETD_STATIC_DIR=` (commented, with explanation) to `server/.env.example`.

- [ ] **Step 3: Validate and commit**

Run: `plutil -lint server/deploy/com.etd.server.agent.plist` → OK.

```bash
git add server/deploy/com.etd.server.agent.plist server/README.md server/.env.example
git commit -m "docs(server): campus-VPN deployment variant — LaunchAgent, same-origin frontend"
```
