# Version History & Conflict Protection Implementation Plan (sub-project C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Researchers browse and restore any saved version, and concurrent saves are caught with a clear Overwrite / Save-as-copy / Cancel choice — nothing is ever silently overwritten or lost.

**Architecture:** Two additive server endpoints (version list + single version) plus an optional `baseVersionId` on PUT that 409s on mismatch. Frontend tracks the base version in cloudStore, `saveToLibrary` sends it, a global ConflictDialog handles 409s, and a History panel drives a read-only preview mode (interaction-blocked canvas + banner) with Restore implemented as a normal save of the previewed content. A cleanup task bundles the small parked items from A/B finals.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-08-18-versions-conflicts-design.md` (binding copy is quoted inline below).

## Global Constraints

- Server changes strictly additive; all 53 existing server tests keep passing. Old clients (no `baseVersionId`) keep last-write-wins behavior.
- BINDING COPY (byte-exact): conflict dialog title `Someone else saved this diagram`; body `While you were editing, a teammate saved a newer version. Your unsaved changes are still here — choose what to do.`; buttons `Overwrite` / `Save as a copy` / `Cancel`. Server 409 error string `someone else saved this diagram while you were editing`. Preview banner `Viewing the version from <date> — ` with buttons `Restore` / `Back to current`. Restore toast `Restored — the previous version is still in history.` History button label `History`; `Current` tag on the head version. Save-first prompt: title `Save before viewing?`, message `Save your changes before viewing an old version? Unsaved changes would otherwise be lost.`, confirm `Save`, cancel `Stay`.
- No user-visible "cloud". Errors via friendlyError.
- Frontend verification per task: `npm run lint` (baseline 17, zero new), `npx tsc -b`, `npm test`, `npm run build`. Server: `cd server && npm run typecheck && npx vitest run`.
- Walkthrough (Task 7) uses PORT=8790 and `npm run dev -- --port 5180` — Jennifer may be using 8787/5173 locally. Never kill processes you didn't start.
- Commit after every task.

---

### Task 1: Server — version list + single-version endpoints

**Files:**
- Modify: `server/src/routes/diagrams.ts`
- Test: `server/src/routes/diagrams.test.ts` (extend)

**Interfaces:**
- `GET /api/diagrams/:id/versions` (member via getDiagramForMember) → `[{id, author, createdAt, isCurrent}]`, newest first (ORDER BY v.id DESC).
- `GET /api/diagrams/:id/versions/:versionId` (member) → `{id, author, createdAt, snapshot}`; 400 non-integer versionId; 404 when the version doesn't exist OR belongs to a different diagram.

- [ ] **Step 1: Write failing tests** (extend diagrams.test.ts; reuse SNAP + helpers)

```ts
it('lists versions newest-first with authors and isCurrent', async () => {
  const { app, adminToken } = await makeTestServer();
  const created = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'V', snapshot: SNAP });
  await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
  const res = await request(app).get(`/api/diagrams/${created.body.id}/versions`).set(auth(adminToken));
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
  expect(res.body[0].isCurrent).toBe(true);
  expect(res.body[1].isCurrent).toBe(false);
  expect(res.body[0].id).toBeGreaterThan(res.body[1].id);
  expect(res.body[0].author).toBeTypeOf('string');
});

it('fetches a single version snapshot; cross-diagram access 404s', async () => {
  const { app, adminToken } = await makeTestServer();
  const a = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'A', snapshot: SNAP });
  const b = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'B', snapshot: { ...SNAP, name: 'B' } });
  const bVersions = await request(app).get(`/api/diagrams/${b.body.id}/versions`).set(auth(adminToken));
  const bVersionId = bVersions.body[0].id;

  const ok = await request(app)
    .get(`/api/diagrams/${b.body.id}/versions/${bVersionId}`).set(auth(adminToken));
  expect(ok.status).toBe(200);
  expect(ok.body.snapshot).toEqual({ ...SNAP, name: 'B' });

  const cross = await request(app)
    .get(`/api/diagrams/${a.body.id}/versions/${bVersionId}`).set(auth(adminToken));
  expect(cross.status).toBe(404);
});
```

(Non-member 403 coverage exists for the diagram routes generally; add one line to the existing outsider test hitting `GET /diagrams/:id/versions` → 403.)

- [ ] **Step 2: Run to verify failure** — `cd server && npx vitest run src/routes/diagrams.test.ts` → new tests FAIL.

- [ ] **Step 3: Implement** (inside diagramRoutes, after `GET /diagrams/:id`)

```ts
router.get('/diagrams/:id/versions', (req, res) => {
  const row = getDiagramForMember(req, res);
  if (!row) return;
  const versions = db
    .prepare(
      `SELECT v.id, u.display_name AS author, v.created_at AS createdAt
       FROM diagram_versions v JOIN users u ON u.id = v.author_id
       WHERE v.diagram_id = ? ORDER BY v.id DESC`,
    )
    .all(row.id) as { id: number; author: string; createdAt: string }[];
  res.json(versions.map((v) => ({ ...v, isCurrent: v.id === row.current_version_id })));
});

router.get('/diagrams/:id/versions/:versionId', (req, res) => {
  const row = getDiagramForMember(req, res);
  if (!row) return;
  const versionId = Number(req.params.versionId);
  if (!Number.isInteger(versionId)) {
    res.status(400).json({ error: 'invalid version id' });
    return;
  }
  const v = db
    .prepare(
      `SELECT v.id, v.snapshot_gz, v.created_at AS createdAt, u.display_name AS author
       FROM diagram_versions v JOIN users u ON u.id = v.author_id
       WHERE v.id = ? AND v.diagram_id = ?`,
    )
    .get(versionId, row.id) as
    | { id: number; snapshot_gz: Buffer; createdAt: string; author: string }
    | undefined;
  if (!v) {
    res.status(404).json({ error: 'version not found' });
    return;
  }
  res.json({ id: v.id, author: v.author, createdAt: v.createdAt, snapshot: unpackSnapshot(v.snapshot_gz) });
});
```

- [ ] **Step 4: Verify** — full server suite + typecheck green (53 + 2-3 new).
- [ ] **Step 5: Commit** — `feat(server): version list and single-version endpoints`

---

### Task 2: Server — baseVersionId conflict detection on PUT

**Files:**
- Modify: `server/src/routes/diagrams.ts` (PUT route)
- Test: `server/src/routes/diagrams.test.ts` (extend)

**Interfaces:**
- PUT body gains `baseVersionId: z.number().int().optional()`. When present and ≠ `row.current_version_id` → **409** `{error: 'someone else saved this diagram while you were editing', currentVersionId: row.current_version_id}` and NO version row is created. When absent → existing last-write-wins behavior unchanged. When matching → normal save.

- [ ] **Step 1: Write failing tests**

```ts
it('409s a stale baseVersionId without creating a version; matching base saves', async () => {
  const { app, db, adminToken } = await makeTestServer();
  const created = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'C', snapshot: SNAP });
  const id = created.body.id;
  const base = created.body.currentVersionId;

  const second = await request(app)
    .put(`/api/diagrams/${id}`).set(auth(adminToken)).send({ snapshot: SNAP, baseVersionId: base });
  expect(second.status).toBe(200);

  const before = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
  const stale = await request(app)
    .put(`/api/diagrams/${id}`).set(auth(adminToken)).send({ snapshot: SNAP, baseVersionId: base });
  expect(stale.status).toBe(409);
  expect(stale.body.currentVersionId).toBe(second.body.currentVersionId);
  expect(stale.body.error).toBe('someone else saved this diagram while you were editing');
  const after = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
  expect(after).toBe(before);
});

it('PUT without baseVersionId keeps last-write-wins', async () => {
  const { app, adminToken } = await makeTestServer();
  const created = await request(app)
    .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'L', snapshot: SNAP });
  await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
  const res = await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — in the PUT route, extend the zod schema with `baseVersionId: z.number().int().optional()`, and after parsing (before the transaction):

```ts
if (parsed.data.baseVersionId !== undefined && parsed.data.baseVersionId !== row.current_version_id) {
  res.status(409).json({
    error: 'someone else saved this diagram while you were editing',
    currentVersionId: row.current_version_id,
  });
  return;
}
```

- [ ] **Step 4: Verify** — full server suite + typecheck.
- [ ] **Step 5: Commit** — `feat(server): optional baseVersionId on save — 409 on concurrent edit`

---

### Task 3: Frontend — base-version tracking, 409 → conflict state, context guards

**Files:**
- Modify: `src/api/client.ts` (+ test), `src/store/cloudStore.ts` (+ test), `src/hooks/librarySave.ts` (+ test), `src/components/Workspace/Workspace.tsx`, `AddToLibraryDialog.tsx`, `src/api/types.ts`

**Interfaces (later tasks rely on these exactly):**
- `ApiError` gains `body?: unknown` (the parsed error JSON when available); `api()` passes it: `throw new ApiError(res.status, message, parsedBody)`. Existing two-arg constructions stay valid (third param optional).
- cloudStore additions: `baseVersionId: number | null` (null default); `conflict: { currentVersionId: number } | null` (null default); `setBaseVersionId(id: number | null)`, `setConflict(c: { currentVersionId: number } | null)`. `setCloudTarget(diagramId, groupId, baseVersionId?: number)` — third optional arg also sets baseVersionId (undefined → leaves it unchanged); `clearCloudTarget()` also nulls baseVersionId and conflict.
- `saveToLibrary(opts?: { force?: boolean }): Promise<void>`: linked-save PUT body includes `baseVersionId: useCloudStore.getState().baseVersionId ?? undefined` unless `opts.force`; PUT/POST success captures the response `{currentVersionId}` → `setBaseVersionId`. On ApiError 409: `setStatus('dirty')`, `setConflict({currentVersionId})` (from `err.body`), NO toast (the dialog is the UI). Context guards (A-parked): capture `diagramIdAtStart`; in success/404/offline/error handlers, bail without mutating state if `useCloudStore.getState().diagramId !== diagramIdAtStart || !useAuthStore.getState().user`.
- Call-site updates: `Workspace.openDiagram` → `setCloudTarget(d.id, d.groupId, d.currentVersionId)`; `AddToLibraryDialog` success → `setCloudTarget(res.id, groupId, res.currentVersionId)`.
- types.ts: `DiagramVersionListItem = { id: number; author: string; createdAt: string; isCurrent: boolean }` and `DiagramVersion = { id: number; author: string; createdAt: string; snapshot: SavedDiagramFile }` (for Task 5).

TDD the store, client, and saveToLibrary changes (extend the three existing test files: ApiError body capture; setCloudTarget 3-arg + clearCloudTarget nulling; PUT sends baseVersionId; 409 → conflict set + dirty + no toast; force omits baseVersionId; success updates baseVersionId; sign-out-mid-save guard: change diagramId between call and resolve → no state mutation). Verify full recipe, commit `feat(versions): base-version tracking and conflict state in the save path`.

---

### Task 4: Frontend — ConflictDialog

**Files:**
- Create: `src/components/Workspace/ConflictDialog.tsx`
- Modify: `src/App.tsx` (mount globally), `src/components/Workspace/index.ts`

**Interfaces:**
- Self-contained: open = `useCloudStore((s) => s.conflict) !== null`. Modal size="sm", title `Someone else saved this diagram`, body copy per Global Constraints (byte-exact).
- **Overwrite** → `await saveToLibrary({ force: true })`; on completion, if status became `'saved'`, `setConflict(null)`; else leave the dialog (a second failure surfaces via the normal paths).
- **Save as a copy** → POST `/api/diagrams` `{groupId, title: `${diagramName} (copy)`, snapshot: buildCloudSnapshot(`${diagramName} (copy)`)}` → `setDiagramName` to the copy title, `setCloudTarget(res.id, groupId, res.currentVersionId)`, `setConflict(null)`, toast `Saved as a copy`. Errors → friendlyError toast, dialog stays.
- **Cancel** → `setConflict(null)` (status stays `dirty`).
- Busy states disable all three buttons; Modal `initialFocus` cancel-side (destructive-adjacent choice) — follow ConfirmHost's convention for destructive confirmations.

No unit tests (logic covered by Task 3's saveToLibrary tests); verify recipe; commit `feat(versions): conflict dialog — overwrite, save as copy, or cancel`.

---

### Task 5: Frontend — History panel + read-only preview + restore

**Files:**
- Create: `src/components/Workspace/HistoryPanel.tsx`, `PreviewBanner.tsx`
- Modify: `src/store/cloudStore.ts` (+ test), `src/components/Workspace/CanvasHeader.tsx`, `src/App.tsx`, `src/hooks/dirtyTracking.ts` (suspend during preview), `index.ts`

**Interfaces:**
- cloudStore: `historyOpen: boolean` + `setHistoryOpen`; `preview: { versionId: number; createdAt: string } | null` + `setPreview` (TDD store additions).
- CanvasHeader gains a `History` button (near File ▾; disabled when `diagramId === null` — unsaved diagrams have no history). Toggles `historyOpen`.
- **HistoryPanel** (right side; study `src/components/TranscriptPanel/` for the app's existing side-panel conventions): fetches `GET /api/diagrams/:id/versions` on open (stale-guard), rows = author + relative time + `Current` tag. Row click:
  1. If a preview is already active → just load the newly clicked version (no guard needed; nothing unsaved in preview).
  2. Else if status is `dirty`/`offline`, or `notInLibrary` with content → `confirmAsync({ title: 'Save before viewing?', message: 'Save your changes before viewing an old version? Unsaved changes would otherwise be lost.', confirmLabel: 'Save', cancelLabel: 'Stay' })`; on confirm `await saveToLibrary()` and proceed only if status is `'saved'`.
  3. Fetch `GET /api/diagrams/:id/versions/:versionId`, `loadDiagram` its snapshot (loose-load pattern), `setPreview({versionId, createdAt})`.
- **Preview mode** (driven by `preview !== null`):
  - `PreviewBanner` rendered under the CanvasHeader: `Viewing the version from <formatted date> — ` + `Restore` + `Back to current` buttons.
  - CanvasHeader while previewing: hide the status line and Save affordances; ← button and File ▾ disabled.
  - Canvas interactions blocked: in App, the main canvas/palette/properties region gets `style={{ pointerEvents: preview ? 'none' : undefined }}` on its wrapper (CanvasHeader + panels stay interactive). Keyboard: App's shortcut handler early-returns when `preview !== null` (before any preventDefault EXCEPT still swallow ⌘S/⌘O like the workspace guard).
  - Dirty tracking suspended: `useDirtyTracking(enabled)` call site becomes `useDirtyTracking(user !== null && preview === null)`; ALSO the preview load itself must not flip status — verify order (loadDiagram fires while tracking disabled if setPreview is set first? setPreview happens AFTER the async fetch+loadDiagram — fix by disabling before load: set preview state BEFORE calling loadDiagram, or gate via a module flag; pick the cleanest and note it in the report).
  - **Restore** → `await saveToLibrary()` (content on canvas IS the previewed snapshot; baseVersionId still tracks the real head so conflicts are caught) → if status `'saved'`: `setPreview(null)`, toast `Restored — the previous version is still in history.`, refresh the panel list.
  - **Back to current** → `GET /api/diagrams/:id` → loadDiagram current snapshot → `setBaseVersionId(currentVersionId)` → `setPreview(null)` (status returns to `'saved'` via setCloudTarget or explicit setStatus — end state must be `saved`).
  - Sign-out and ← -to-workspace during preview: both clear preview (`clearCloudTarget` nulls it — add `preview: null, historyOpen: false` to clearCloudTarget's reset).
- Store transitions TDD'd; UI verified in Task 7's walkthrough. Verify recipe; commit `feat(versions): history panel with read-only preview and restore`.

---

### Task 6: Cleanup bundle (parked A/B items)

**Files:**
- Modify: `src/components/Workspace/CanvasHeader.tsx`, `AddToLibraryDialog.tsx`, `MemberRow.tsx`, `Workspace.tsx`

Four independent fixes, one commit:
1. **Leave-dialog × 404 stacking (A-parked):** in CanvasHeader's `handleSaveAndLeave`, the `addToLibraryOpen` branch already closes the leave dialog — verify it does after Task 3's changes and extend: also close the leave dialog when a conflict was set during the awaited save (`useCloudStore.getState().conflict !== null` → close leave dialog, don't leave; the ConflictDialog takes over).
2. **AddToLibraryDialog no-groups guard:** when `groups.length === 0`, disable the primary button and show a short line `You're not in a group yet — ask your admin for an invite.` instead of posting with groupId 0.
3. **MemberRow crumbs (B-parked):** remove the dead `isLoading` from the row-menu action type/usages; add `disabled: busy !== null` to the `Reset password…` item.
4. **Workspace ternary indentation (B-parked):** re-indent the diagrams-branch JSX properly (whitespace-only change; verify with `git diff -w` showing no logic delta).

Verify recipe (lint especially — indentation changes); commit `chore(workspace): parked cleanups — dialog stacking, no-group guard, menu crumbs, indentation`.

---

### Task 7: Full verification + browser walkthrough

**Files:** fixes only.

- [ ] Automated: full frontend recipe + server typecheck/suite; `git diff --stat main -- server/` shows only diagrams.ts + diagrams.test.ts.
- [ ] Playwright walkthrough — fresh backend on **PORT=8790** (`rm -rf server/data` in THIS worktree only), frontend `npm run dev -- --port 5180`. Do not touch processes on 8787/5173 (Jennifer's). Steps (snapshot each; byte-check copy):
  1. Sign in (admin), create + save a diagram twice (two versions). History → panel lists 2 versions, newest `Current`, authors right.
  2. Click the older version → preview banner (copy exact); canvas non-interactive (attempt a click/drag — nothing changes); Save/status hidden; `Back to current` returns to head, status `Saved ✓`.
  3. Preview older again → `Restore` → toast exact → panel now shows 3 versions, newest Current.
  4. Conflict: invite + register a second account (or reuse) in another browser context. A opens the diagram; B saves a change; A edits and ⌘S → conflict dialog (copy byte-exact). Test all three paths across repeats: Cancel (stays dirty, dialog closable), Overwrite (saves; history shows both versions), and Save as a copy (new `<title> (copy)` diagram in the library, original untouched).
  5. Unsaved-work guard: edit without saving, open History, click a version → `Save before viewing?` prompt; `Stay` keeps everything; retry with `Save` → saves then previews.
  6. Cleanup checks: AddToLibrary with a zero-group account if cheaply testable (else skip honestly); member-row menu still keyboard-clean.
- [ ] Fix real bugs found (smallest change), re-verify, commit `fix(versions): walkthrough fixes` (skip if clean). Kill only the processes you started.
