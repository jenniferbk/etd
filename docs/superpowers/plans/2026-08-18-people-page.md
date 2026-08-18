# People Page Implementation Plan (Groupware sub-project B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group admins manage everything in-app — invite links, member roles, removals, password-reset links — and locked-out users set a new password from a reset link; no terminal anywhere.

**Architecture:** Three small additive server endpoints (roster, invite preview, title-only PATCH); a People sub-view inside the Workspace (tab state in cloudStore); copy-link dialogs for invites/resets; a `?reset=` URL flow mirroring the existing `?invite=` flow; register modal upgrades to "Join <group>" via the preview endpoint; diagram rename switches to the new PATCH.

**Tech Stack:** unchanged (Express 5 + better-sqlite3 + vitest server-side; React 19 + zustand + vitest client-side).

**Spec:** `docs/superpowers/specs/2026-08-18-people-page-design.md` (its Binding copy section governs all strings).

## Global Constraints

- All spec "Binding copy" strings byte-exact. No user-visible "cloud".
- Server changes are strictly additive: every existing endpoint/test keeps passing (44 server tests at start).
- MOUNT-ORDER CONSTRAINT: the unauthenticated `GET /api/invites/:token/preview` must live in `inviteRoutes` (already mounted before the router-wide-`requireAuth` routers in `server/src/app.ts`) — do not reorder mounts; extend the mount-order comment to name it.
- Invite/reset links compose as `` `${window.location.origin}${window.location.pathname}?invite=${token}` `` (resp. `?reset=`) — origin+pathname, never origin alone.
- Errors through `friendlyError`; plain-language copy only.
- Frontend verification recipe per task: `npm run lint` (baseline 17 pre-existing problems, zero new), `npx tsc -b`, `npm test` (165 at start), `npm run build`. Server: `cd server && npm run typecheck && npx vitest run`.
- Commit after every task.

---

### Task 1: Server — group roster endpoint

**Files:**
- Modify: `server/src/routes/groups.ts`
- Test: `server/src/routes/groups.test.ts` (extend)

**Interfaces:**
- Produces: `GET /api/groups/:id/members` (auth; any member of the group, or site admin) → `[{id, email, displayName, role}]` ordered by displayName (case-insensitive); 404 unknown group; 403 non-member.

- [ ] **Step 1: Write failing tests** (extend groups.test.ts; reuse its `registerMember` helper)

```ts
it('lists group members with roles, ordered by displayName', async () => {
  const { app, adminToken } = await makeTestServer();
  await registerMember(app, adminToken, 'zoe@uga.edu');
  await registerMember(app, adminToken, 'amir@uga.edu');
  const res = await request(app).get('/api/groups/1/members').set(auth(adminToken));
  expect(res.status).toBe(200);
  // makeTestServer's admin has display_name 'Admin'; registerMember uses the
  // email as displayName — case-insensitive name order:
  expect(res.body.map((m: { displayName: string }) => m.displayName)).toEqual([
    'Admin', 'amir@uga.edu', 'zoe@uga.edu',
  ]);
  expect(res.body[0]).toMatchObject({ email: 'admin@test.edu', role: 'admin' });
});
```

Add two more tests:

```ts
it('a plain member can view the roster', async () => {
  const { app, adminToken } = await makeTestServer();
  const member = await registerMember(app, adminToken, 'm@uga.edu');
  const res = await request(app).get('/api/groups/1/members').set(auth(member.token));
  expect(res.status).toBe(200);
});

it('non-members get 403; unknown group 404', async () => {
  const { app, adminToken } = await makeTestServer();
  const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: g2.body.id });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email: 'out@uga.edu', password: 'longenough',
    displayName: 'Out', acceptedPolicy: true,
  });
  expect((await request(app).get('/api/groups/1/members').set(auth(reg.body.token))).status).toBe(403);
  expect((await request(app).get('/api/groups/999/members').set(auth(adminToken))).status).toBe(404);
});
```

(`registerMember` in groups.test.ts returns `{token, id}` — check its actual shape and adapt.)

- [ ] **Step 2: Run to verify failure** — `cd server && npx vitest run src/routes/groups.test.ts` → new tests FAIL (404 on the route).

- [ ] **Step 3: Implement** (inside `groupRoutes`, after the existing GET /groups)

```ts
router.get('/groups/:id/members', (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId)) {
    res.status(400).json({ error: 'invalid group id' });
    return;
  }
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    res.status(404).json({ error: 'group not found' });
    return;
  }
  if (!req.user!.isSiteAdmin && getRole(db, req.user!.id, groupId) === null) {
    res.status(403).json({ error: 'not a member of this group' });
    return;
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.display_name AS displayName, m.role
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all(groupId);
  res.json(rows);
});
```

- [ ] **Step 4: Verify** — `cd server && npx vitest run && npm run typecheck` → all green.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/groups.ts server/src/routes/groups.test.ts
git commit -m "feat(server): group roster endpoint — members can view their group"
```

---

### Task 2: Server — invite preview endpoint

**Files:**
- Modify: `server/src/routes/invites.ts`, `server/src/app.ts` (comment only)
- Test: `server/src/routes/invites.test.ts` (extend)

**Interfaces:**
- Produces: `GET /api/invites/:token/preview` (NO auth) → `{groupName}` for a valid, unused, unexpired invite; otherwise 404 `{error: 'invalid or expired invite'}` (same message for used/expired/nonexistent — no validity oracle).

- [ ] **Step 1: Write failing tests** (extend invites.test.ts; it has a makeInvite helper)

```ts
it('previews a valid invite without auth', async () => {
  const { app, adminToken } = await makeTestServer();
  const token = await makeInvite(app, adminToken);
  const res = await request(app).get(`/api/invites/${token}/preview`);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ groupName: 'COMS' });
});

it('previews of used or bogus invites 404 identically', async () => {
  const { app, adminToken } = await makeTestServer();
  const token = await makeInvite(app, adminToken);
  await request(app).post('/api/auth/register').send({
    inviteToken: token, email: 'u@uga.edu', password: 'longenough',
    displayName: 'U', acceptedPolicy: true,
  });
  const used = await request(app).get(`/api/invites/${token}/preview`);
  const bogus = await request(app).get('/api/invites/not-a-real-token/preview');
  expect(used.status).toBe(404);
  expect(bogus.status).toBe(404);
  expect(used.body).toEqual(bogus.body);
});
```

- [ ] **Step 2: Run to verify failure** — new tests FAIL.

- [ ] **Step 3: Implement** (inside `inviteRoutes`, NO requireAuth on this route; import `sha256` from `../auth.js`)

```ts
// Unauthenticated by design: lets the register modal greet with the group
// name. Valid+unused+unexpired only; all failures return the same 404 so the
// endpoint is not a token-validity oracle beyond what registration reveals.
router.get('/invites/:token/preview', (req, res) => {
  const row = db
    .prepare(
      `SELECT g.name FROM invites i JOIN groups g ON g.id = i.group_id
       WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > datetime('now')`,
    )
    .get(sha256(req.params.token)) as { name: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'invalid or expired invite' });
    return;
  }
  res.json({ groupName: row.name });
});
```

In `server/src/app.ts`, extend the existing mount-order comment to also name this route: unauthenticated routes (`/api/auth/reset-password`, `/api/invites/:token/preview`) must be mounted before any router applying requireAuth router-wide.

- [ ] **Step 4: Verify** — full server suite + typecheck green.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/invites.ts server/src/routes/invites.test.ts server/src/app.ts
git commit -m "feat(server): unauthenticated invite preview — group name for the register greeting"
```

---

### Task 3: Server — title-only rename (PATCH, no version row)

**Files:**
- Modify: `server/src/routes/diagrams.ts`
- Test: `server/src/routes/diagrams.test.ts` (extend)

**Interfaces:**
- Produces: `PATCH /api/diagrams/:id {title}` (any group member) → `{ok: true}`; updates `title` and `updated_at`, creates NO diagram_versions row; 400 blank title; 403/404 via the existing `getDiagramForMember`.

- [ ] **Step 1: Write failing tests**

```ts
it('PATCH renames without creating a version row', async () => {
  const { app, db, adminToken } = await makeTestServer();
  const created = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Old', snapshot: SNAP });
  const before = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
  const res = await request(app)
    .patch(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ title: 'New name' });
  expect(res.status).toBe(200);
  const after = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
  expect(after).toBe(before);
  const list = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
  expect(list.body[0].title).toBe('New name');
});

it('PATCH rejects blank titles and enforces membership', async () => {
  const { app, adminToken } = await makeTestServer();
  const created = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'T', snapshot: SNAP });
  expect((await request(app).patch(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ title: '  ' })).status).toBe(400);
  expect((await request(app).patch(`/api/diagrams/${created.body.id}`).send({ title: 'X' })).status).toBe(401);
});
```

- [ ] **Step 2: Run to verify failure** — new tests FAIL.

- [ ] **Step 3: Implement** (inside `diagramRoutes`, after the PUT route)

```ts
// Title-only rename: no version row (renames are metadata, not content).
router.patch('/diagrams/:id', (req, res) => {
  const row = getDiagramForMember(req, res);
  if (!row) return;
  const parsed = z.object({ title: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'title must not be empty' });
    return;
  }
  db.prepare(`UPDATE diagrams SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(
    parsed.data.title, row.id,
  );
  res.json({ ok: true });
});
```

- [ ] **Step 4: Verify** — full server suite + typecheck green.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/diagrams.ts server/src/routes/diagrams.test.ts
git commit -m "feat(server): PATCH title-only rename without a version row"
```

---

### Task 4: Frontend — People tab plumbing + roster view

**Files:**
- Modify: `src/store/cloudStore.ts` (+ test), `src/api/types.ts`, `src/components/Workspace/Workspace.tsx`, `WorkspaceHeader.tsx`
- Create: `src/components/Workspace/PeoplePage.tsx`, `MemberRow.tsx`

**Interfaces:**
- cloudStore gains `workspaceTab: 'diagrams' | 'people'` (initial `'diagrams'`) + `setWorkspaceTab(tab)`; add matching cases to cloudStore.test.ts.
- types.ts gains `GroupMember = { id: number; email: string; displayName: string; role: 'admin' | 'member' }`.
- `<PeoplePage groupId={number} groupName={string} />`: fetches `GET /api/groups/:id/members` (loading `Loading people…`, error via friendlyError toast + `Try again`, requestSeq stale guard like Workspace's diagram fetch); renders roster (Name / Email / Role); when the current user is that group's admin (from authStore groups) or site admin, an `Invite someone` button (wired in Task 5 — render disabled placeholder button in THIS task with no handler) and per-row ⋯ menu with `Make admin`/`Make member` (POST /api/groups/:id/members {email, role} upsert → refresh), `Reset password…` (Task 5 placeholder), `Remove from group…` (confirmAsync destructive with the spec's binding copy → DELETE /api/groups/:id/members/:userId → refresh). Own row: no Remove/role-change on yourself (hide those items).
- Workspace: header gains nav (`Diagrams` / `People`) switching `workspaceTab`; body renders PeoplePage when tab==='people'.

- [ ] **Step 1: cloudStore tab state + test** (extend cloudStore.test.ts with a `setWorkspaceTab` case; TDD: test → fail → implement → pass).
- [ ] **Step 2: Implement PeoplePage/MemberRow + Workspace wiring** per the interfaces above; visual conventions = existing Workspace components (DiagramCard's menu pattern, theme tokens).
- [ ] **Step 3: Verify** — lint baseline / `npx tsc -b` / `npm test` / build.
- [ ] **Step 4: Commit** — `feat(people): roster view with role management and removal`

---

### Task 5: Frontend — InviteDialog + ResetLinkDialog

**Files:**
- Create: `src/components/Workspace/InviteDialog.tsx`, `ResetLinkDialog.tsx`, shared `CopyLinkField.tsx`
- Modify: `PeoplePage.tsx` (wire the two placeholders live)

**Interfaces:**
- `CopyLinkField({link})`: read-only input + `Copy link` button → `navigator.clipboard.writeText` → label flips to `Copied ✓` for ~2s. Clipboard failure → error toast `Couldn't copy — select the link and copy it manually.`
- `InviteDialog({groupId, groupName, open, onClose})`: instruction copy per spec; `Create invite link` → POST /api/invites {groupId} → link = `` `${window.location.origin}${window.location.pathname}?invite=${token}` `` shown in CopyLinkField. Errors → friendlyError toast.
- `ResetLinkDialog({member, open, onClose})`: instruction `Send this link to <displayName>. It lets them set a new password and expires in 24 hours.`; POST /api/password-resets {email} on open (or via a Create button — pick: create on open, one fewer click) → `?reset=` link in CopyLinkField.
- Wire PeoplePage's `Invite someone` button and `Reset password…` menu item to these dialogs.

Steps: implement → verify (lint/tsc/test/build) → commit `feat(people): invite and password-reset links, copyable in-app`.

---

### Task 6: Frontend — reset flow + "Join <group>" register greeting

**Files:**
- Create: `src/components/Workspace/SetNewPasswordModal.tsx`
- Modify: `src/App.tsx` (`?reset=` param), `src/components/Workspace/SignInModal.tsx` (preview greeting)

**Interfaces:**
- App reads `?reset=<token>` at mount exactly like `?invite=` (lazy useState); non-null → render `<SetNewPasswordModal token={...} />` open. Submit: passwords match check (mismatch error copy per spec) → POST /api/auth/reset-password {token, newPassword} → success toast per spec, strip params via history.replaceState, close, open the Sign-in modal. Errors → inline friendlyError text.
- SignInModal: when `inviteToken` is present, on open fetch `GET /api/invites/:token/preview`; success → register title `Join <groupName>`; 404/failure → keep `Create your account` (silent fallback, no toast). Add the api call with a stale-guard (modal could close before resolve).
- Unit test (node env): extract the title-resolution into a helper if practical, else rely on Task 8's walkthrough; add a friendlyError-free smoke test only if cheap.

Steps: implement → verify → commit `feat(people): set-new-password flow and Join-<group> register greeting`.

---

### Task 7: Frontend — rename via PATCH + NewGroupDialog

**Files:**
- Modify: `src/components/Workspace/DiagramCard.tsx` (rename → PATCH), `WorkspaceHeader.tsx` (site-admin `New group`)
- Create: `src/components/Workspace/NewGroupDialog.tsx`

**Interfaces:**
- DiagramCard rename: replace the GET+PUT-snapshot flow with a single `api(`/api/diagrams/${id}`, {method: 'PATCH', body: {title}})`; delete the now-obsolete version-row comment; keep blank-title guards; refresh after.
- NewGroupDialog (visible only when `user.isSiteAdmin`): name input → POST /api/groups {name} → `await useAuthStore.getState().restore()` (refreshes groups) → switch the Workspace group selector to the new group → close + toast `Group created`. Duplicate name error surfaces via friendlyError.

Steps: implement → verify → commit `feat(people): rename via PATCH; site admins create groups in-app`.

---

### Task 8: Full verification + browser walkthrough

**Files:** fixes only.

- [ ] Automated: `npm run lint && npx tsc -b && npm test && npm run build`; `cd server && npm run typecheck && npx vitest run`. Server diff vs main must show ONLY the three planned endpoint additions.
- [ ] Playwright walkthrough (fresh server, bootstrap admin): sign in → Workspace → People tab → roster shows Admin → Invite someone → copy link → open link in a new context → register modal titled `Join COMS` → policy gate → register → lands on Workspace → back as admin: promote the member to admin, demote back, Reset password… → copy reset link → open it → Set a new password (mismatch error first, then success) → sign in with the new password → as admin: remove the member (confirm copy exact) → roster updates. Rename a diagram from the card menu → version count UNCHANGED. Site admin: New group → appears in switcher. Copy strings byte-checked throughout; kill background processes when done.
- [ ] Fix anything found (smallest correct change), re-run, commit `fix(people): walkthrough fixes` (skip if clean).
