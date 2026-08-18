# Workspace UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users get a friendly groupware experience — a card-gallery Workspace home, a Google-Docs-style canvas header with live save status, cloud-first Save/⌘S, and plain-language copy — while signed-out behavior stays byte-identical to today.

**Architecture:** Frontend only; zero server changes. A `view` + `status` state machine lives in the extended `cloudStore`; a plain-function save router (`saveToLibrary`) replaces the scattered save calls; the old Cloud dropdown/LibraryModal/CloudSaveDialog are replaced by `Workspace/` (home view), `CanvasHeader` (status strip), and `AddToLibraryDialog`. Dirty tracking subscribes to `diagramStore` the same way autosave observes it.

**Tech Stack:** unchanged — React 19, zustand 5, Tailwind 4, vitest (node env; store/util-level tests, no DOM test runner).

**Spec:** `docs/superpowers/specs/2026-08-17-workspace-ux-design.md`

## Global Constraints

- **Signed-out behavior byte-identical to today** (jenkleiman.com unaffected): canvas-only, local Save/⌘S, no header strip, no Workspace. The existing 144 tests must keep passing.
- **Zero server changes.** `server/` is untouched.
- **Policy copy verbatim, unchanged:** registration checkbox "I understand that only de-identified data may be uploaded — no names or other identifying information in transcripts, images, or diagram content." and save reminder "Reminder: only de-identified data may be saved to the shared library."
- **Binding copy (exact strings):**
  - Status line: `Saved to <group> ✓` / `Unsaved changes — ⌘S to save` / `Saving…` / `Not in the library — Save adds it`
  - Offline banner: `Can't reach the <group> server — your work is safe on this computer. We'll save to the library when you reconnect.` Button: `Try again`
  - Workspace empty state: `No diagrams yet — create the first one.`
  - Buttons: `＋ New diagram`, `Open a file…`, `Download a copy`, `Add to library`
  - friendlyError mappings (Task 1) are binding copy.
  - The word "cloud" must not appear anywhere in user-visible UI text after Task 8.
- **The word "Advanced…"** labels the server-URL disclosure in SignInModal; field label `Server address`.
- No new dependencies. Verification recipe per task: `npm run lint` (baseline: 17 pre-existing problems in ImageImportModal.tsx / imageImport.test.ts / orthogonalRouting.ts — zero NEW), `npx tsc -b`, `npm test`, `npm run build` (root `npm run typecheck` does not exist).
- Visual work must match the existing app aesthetic: study `src/utils/theme.ts`, `src/components/ui/Modal.tsx`, `src/components/Toolbar/` before writing JSX. Reference mockups: `.superpowers/brainstorm/71876-1787015157/content/home-screen.html` (card gallery = option A) and `canvas-status.html` (header = option A).
- Commit after every task.

## File Structure (end state)

```
src/
├── api/friendlyError.ts            NEW  (Task 1)
├── store/cloudStore.ts             EXTENDED: view/status/addToLibraryOpen (Task 2)
├── hooks/dirtyTracking.ts          NEW  (Task 3)
├── hooks/librarySave.ts            NEW  (Task 4)
├── utils/buildCloudSnapshot.ts     MOVED here from components/Cloud/ (Task 4)
├── components/Workspace/
│   ├── AddToLibraryDialog.tsx      NEW  (Task 5)
│   ├── Workspace.tsx               NEW  (Task 6)
│   ├── WorkspaceHeader.tsx         NEW  (Task 6)
│   ├── DiagramCard.tsx             NEW  (Task 6)
│   ├── AccountChip.tsx             NEW  (Task 6; reused by CanvasHeader)
│   ├── CanvasHeader.tsx            NEW  (Task 7)
│   ├── OfflineBanner.tsx           NEW  (Task 7)
│   └── index.ts                    NEW
├── components/Cloud/               DELETED in Task 8 (SignInModal.tsx moves to Workspace/)
├── App.tsx                         view switching, save rerouting (Tasks 7-8)
└── components/Toolbar/Toolbar.tsx  save rerouting, CloudMenu removal, title-input hiding (Tasks 7-8)
```

---

### Task 1: friendlyError utility

**Files:**
- Create: `src/api/friendlyError.ts`
- Test: `src/api/friendlyError.test.ts`

**Interfaces:**
- Produces: `friendlyError(err: unknown, fallback?: string): string` — later tasks call it for every caught library/API error shown to a user.

- [ ] **Step 1: Write failing tests**

`src/api/friendlyError.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it('maps the used/expired invite message', () => {
    expect(friendlyError(new ApiError(400, 'invalid or expired invite'))).toBe(
      'That invite link has already been used or expired — ask your group admin for a new one.',
    );
  });

  it('maps the wrong-password message', () => {
    expect(friendlyError(new ApiError(401, 'invalid email or password'))).toBe(
      "That email and password don't match — try again, or ask your group admin to reset your password.",
    );
  });

  it('maps the delete-permission message', () => {
    expect(friendlyError(new ApiError(403, 'only the creator or a group admin can delete a diagram'))).toBe(
      'Only the person who created this diagram or a group admin can delete it.',
    );
  });

  it('maps fetch network failures (TypeError) to a connection hint', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(
      "Can't reach the server — check your connection (and the VPN, if you're off campus).",
    );
  });

  it('passes through unmapped ApiError messages verbatim', () => {
    expect(friendlyError(new ApiError(404, 'diagram not found'))).toBe('diagram not found');
  });

  it('uses the fallback for unknown errors', () => {
    expect(friendlyError(42)).toBe('Something went wrong — please try again.');
    expect(friendlyError(new Error('boom'), 'custom fallback')).toBe('boom');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/api/friendlyError.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/api/friendlyError.ts`:

```ts
import { ApiError } from './client';

// Server messages → plain language for non-technical researchers.
// Unmapped ApiError messages pass through verbatim; they are already
// human-readable JSON error strings from our own server.
const MESSAGE_MAP: Record<string, string> = {
  'invalid or expired invite':
    'That invite link has already been used or expired — ask your group admin for a new one.',
  'invalid email or password':
    "That email and password don't match — try again, or ask your group admin to reset your password.",
  'only the creator or a group admin can delete a diagram':
    'Only the person who created this diagram or a group admin can delete it.',
};

export function friendlyError(
  err: unknown,
  fallback = 'Something went wrong — please try again.',
): string {
  if (err instanceof ApiError) {
    return MESSAGE_MAP[err.message] ?? err.message;
  }
  if (err instanceof TypeError) {
    // fetch() rejects with TypeError on network failure
    return "Can't reach the server — check your connection (and the VPN, if you're off campus).";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/api/friendlyError.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/friendlyError.ts src/api/friendlyError.test.ts
git commit -m "feat(workspace): friendlyError — plain-language error mapping"
```

---

### Task 2: cloudStore view + save-status state machine

**Files:**
- Modify: `src/store/cloudStore.ts`
- Test: `src/store/cloudStore.test.ts` (new)

**Interfaces:**
- Produces (added to the existing store; existing fields/actions unchanged):
  - `type LibrarySaveStatus = 'saved' | 'dirty' | 'saving' | 'notInLibrary' | 'offline'`
  - `type AppView = 'workspace' | 'canvas'`
  - state: `view: AppView` (initial `'canvas'`), `status: LibrarySaveStatus` (initial `'notInLibrary'`), `addToLibraryOpen: boolean` (initial `false`)
  - actions: `setView(view: AppView)`, `setStatus(status: LibrarySaveStatus)`, `setAddToLibraryOpen(open: boolean)`
  - changed semantics: `setCloudTarget(diagramId, groupId)` ALSO sets `status: 'saved'`; `clearCloudTarget()` ALSO sets `status: 'notInLibrary'`.

- [ ] **Step 1: Write failing tests**

`src/store/cloudStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useCloudStore } from './cloudStore';

describe('cloudStore view/status', () => {
  beforeEach(() =>
    useCloudStore.setState({
      diagramId: null, groupId: null, view: 'canvas', status: 'notInLibrary', addToLibraryOpen: false,
    }),
  );

  it('starts on canvas, notInLibrary', () => {
    expect(useCloudStore.getState().view).toBe('canvas');
    expect(useCloudStore.getState().status).toBe('notInLibrary');
  });

  it('setCloudTarget marks the diagram saved', () => {
    useCloudStore.getState().setCloudTarget(7, 1);
    expect(useCloudStore.getState()).toMatchObject({ diagramId: 7, groupId: 1, status: 'saved' });
  });

  it('clearCloudTarget returns to notInLibrary', () => {
    useCloudStore.getState().setCloudTarget(7, 1);
    useCloudStore.getState().clearCloudTarget();
    expect(useCloudStore.getState()).toMatchObject({ diagramId: null, groupId: null, status: 'notInLibrary' });
  });

  it('setView, setStatus, setAddToLibraryOpen update state', () => {
    useCloudStore.getState().setView('workspace');
    useCloudStore.getState().setStatus('dirty');
    useCloudStore.getState().setAddToLibraryOpen(true);
    expect(useCloudStore.getState()).toMatchObject({ view: 'workspace', status: 'dirty', addToLibraryOpen: true });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/store/cloudStore.test.ts` → FAIL (missing fields).

- [ ] **Step 3: Implement**

Extend `src/store/cloudStore.ts` to:

```ts
import { create } from 'zustand';

export type LibrarySaveStatus = 'saved' | 'dirty' | 'saving' | 'notInLibrary' | 'offline';
export type AppView = 'workspace' | 'canvas';

/** Tracks which library diagram (if any) the canvas corresponds to, plus the
 *  signed-in app view and the save-status state machine shown in the canvas
 *  header. Signed-out sessions never read view/status. */
interface CloudState {
  diagramId: number | null;
  groupId: number | null;
  view: AppView;
  status: LibrarySaveStatus;
  addToLibraryOpen: boolean;
  setCloudTarget: (diagramId: number, groupId: number) => void;
  clearCloudTarget: () => void;
  setView: (view: AppView) => void;
  setStatus: (status: LibrarySaveStatus) => void;
  setAddToLibraryOpen: (open: boolean) => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  diagramId: null,
  groupId: null,
  view: 'canvas',
  status: 'notInLibrary',
  addToLibraryOpen: false,
  setCloudTarget: (diagramId, groupId) => set({ diagramId, groupId, status: 'saved' }),
  clearCloudTarget: () => set({ diagramId: null, groupId: null, status: 'notInLibrary' }),
  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setAddToLibraryOpen: (addToLibraryOpen) => set({ addToLibraryOpen }),
}));
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/store/cloudStore.test.ts` then full `npm test` (all green; no existing test asserts the old setCloudTarget semantics beyond fields, but verify).

- [ ] **Step 5: Commit**

```bash
git add src/store/cloudStore.ts src/store/cloudStore.test.ts
git commit -m "feat(workspace): view + save-status state machine in cloudStore"
```

---

### Task 3: Dirty tracking

**Files:**
- Create: `src/hooks/dirtyTracking.ts`
- Test: `src/hooks/dirtyTracking.test.ts`

**Interfaces:**
- Produces: `startDirtyTracking(): () => void` — subscribes to `useDiagramStore`; whenever elements/connections/styleConfig/transcript/diagramName change (reference inequality) while `cloudStore.status === 'saved'`, sets status `'dirty'`. Returns the unsubscribe function. Also `useDirtyTracking(enabled: boolean): void` — React wrapper (`useEffect` calling `startDirtyTracking` when enabled).

- [ ] **Step 1: Write failing tests** (test the plain function; no DOM needed)

`src/hooks/dirtyTracking.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';
import { startDirtyTracking } from './dirtyTracking';

let stop: (() => void) | null = null;

describe('startDirtyTracking', () => {
  beforeEach(() => {
    useCloudStore.setState({ diagramId: 1, groupId: 1, status: 'saved' });
  });
  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('marks saved → dirty when the diagram name changes', () => {
    stop = startDirtyTracking();
    useDiagramStore.getState().setDiagramName('Renamed');
    expect(useCloudStore.getState().status).toBe('dirty');
  });

  it('does not touch status when not saved (e.g. notInLibrary)', () => {
    useCloudStore.setState({ status: 'notInLibrary' });
    stop = startDirtyTracking();
    useDiagramStore.getState().setDiagramName('Another name');
    expect(useCloudStore.getState().status).toBe('notInLibrary');
  });

  it('stops tracking after unsubscribe', () => {
    stop = startDirtyTracking();
    stop();
    stop = null;
    useDiagramStore.getState().setDiagramName('Late change');
    expect(useCloudStore.getState().status).toBe('saved');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/hooks/dirtyTracking.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/hooks/dirtyTracking.ts`:

```ts
import { useEffect } from 'react';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';

/** Flip the library save status to 'dirty' on any diagram content change.
 *  Reference inequality is enough: the store replaces arrays/objects on edit. */
export function startDirtyTracking(): () => void {
  return useDiagramStore.subscribe((state, prev) => {
    if (
      state.elements !== prev.elements ||
      state.connections !== prev.connections ||
      state.styleConfig !== prev.styleConfig ||
      state.transcript !== prev.transcript ||
      state.diagramName !== prev.diagramName
    ) {
      const cloud = useCloudStore.getState();
      if (cloud.status === 'saved') cloud.setStatus('dirty');
    }
  });
}

export function useDirtyTracking(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return startDirtyTracking();
  }, [enabled]);
}
```

Note: `useDiagramStore` uses the zundo temporal middleware; plain `.subscribe(listener)` still receives `(state, prevState)`. If the subscription signature differs in practice, adapt inside `startDirtyTracking` only — the exported contract stays.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/hooks/dirtyTracking.test.ts`, then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/dirtyTracking.ts src/hooks/dirtyTracking.test.ts
git commit -m "feat(workspace): dirty tracking flips saved → dirty on diagram edits"
```

---

### Task 4: saveToLibrary router (+ relocate buildCloudSnapshot)

**Files:**
- Create: `src/hooks/librarySave.ts`
- Move: `src/components/Cloud/buildCloudSnapshot.ts` → `src/utils/buildCloudSnapshot.ts` (git mv; update the two imports in `src/components/Cloud/CloudMenu.tsx` and `src/components/Cloud/CloudSaveDialog.tsx`)
- Test: `src/hooks/librarySave.test.ts`

**Interfaces:**
- Consumes: `api`, `ApiError` (`src/api/client`), `friendlyError`, `useCloudStore` (Task 2 shape), `useAuthStore`, `useDiagramStore`, `buildCloudSnapshot(titleOverride?: string)` (existing), `saveDiagramJson` + `DiagramSnapshot` (`src/utils/saveDiagram`), `useToastStore`.
- Produces: `saveToLibrary(): Promise<void>` — the single save entry point:
  - signed out → local `saveDiagramJson` (today's behavior);
  - signed in + unlinked → `setAddToLibraryOpen(true)`;
  - signed in + linked → status `'saving'`, PUT `/api/diagrams/:id` `{snapshot, title?}` (title omitted when blank), status `'saved'`;
  - PUT 404 → clear target, info toast `That diagram was removed from the library — save it as new.`, open dialog;
  - network TypeError or 5xx → status `'offline'` (silent — the banner is the UI);
  - other errors → status `'dirty'`, error toast `friendlyError(err)`.

- [ ] **Step 1: Move buildCloudSnapshot**

```bash
git mv src/components/Cloud/buildCloudSnapshot.ts src/utils/buildCloudSnapshot.ts
```

Update its imports in `CloudMenu.tsx` and `CloudSaveDialog.tsx` to `'../../utils/buildCloudSnapshot'`. Run `npx tsc -b` to confirm.

- [ ] **Step 2: Write failing tests**

`src/hooks/librarySave.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveToLibrary } from './librarySave';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';

const USER = { id: 1, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('saveToLibrary', () => {
  beforeEach(() => {
    localStorage?.clear?.();
    useAuthStore.setState({ user: USER, groups: [{ id: 1, name: 'COMS', role: 'member' }] });
    useCloudStore.setState({ diagramId: 9, groupId: 1, status: 'dirty', addToLibraryOpen: false });
    useDiagramStore.getState().setDiagramName('My diagram');
    useToastStore.getState().clearAll();
  });
  afterEach(() => vi.restoreAllMocks());

  it('PUTs a linked diagram and lands on saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ currentVersionId: 4 }));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('saved');
  });

  it('opens the Add-to-library dialog for an unlinked diagram', async () => {
    useCloudStore.setState({ diagramId: null, groupId: null, status: 'notInLibrary' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await saveToLibrary();
    expect(useCloudStore.getState().addToLibraryOpen).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('recovers from a 404 by clearing the target and opening the dialog', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'diagram not found' }, 404));
    await saveToLibrary();
    const s = useCloudStore.getState();
    expect(s.diagramId).toBeNull();
    expect(s.addToLibraryOpen).toBe(true);
  });

  it('goes offline on network failure without a toast', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('offline');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('surfaces other errors as dirty + friendly toast', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'invalid request' }, 400));
    await saveToLibrary();
    expect(useCloudStore.getState().status).toBe('dirty');
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'error')).toBe(true);
  });
});
```

(Also add the localStorage `vi.stubGlobal` block used by `src/api/client.test.ts` at the top of this file — the client reads localStorage.)

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/hooks/librarySave.test.ts` → FAIL.

- [ ] **Step 4: Implement**

`src/hooks/librarySave.ts`:

```ts
import { api, ApiError } from '../api/client';
import { friendlyError } from '../api/friendlyError';
import { useAuthStore } from '../api/authStore';
import { useCloudStore } from '../store/cloudStore';
import { useDiagramStore } from '../store';
import { useToastStore } from '../store/toastStore';
import { buildCloudSnapshot } from '../utils/buildCloudSnapshot';
import { saveDiagramJson } from '../utils/saveDiagram';

/** The single Save entry point. Signed out it behaves exactly like the old
 *  local save; signed in it targets the team library. */
export async function saveToLibrary(): Promise<void> {
  const user = useAuthStore.getState().user;
  const d = useDiagramStore.getState();

  if (!user) {
    await saveDiagramJson({
      diagramName: d.diagramName,
      elements: d.elements,
      connections: d.connections,
      styleConfig: d.styleConfig,
      transcript: d.transcript,
    });
    return;
  }

  const cloud = useCloudStore.getState();
  if (cloud.diagramId === null) {
    cloud.setAddToLibraryOpen(true);
    return;
  }

  cloud.setStatus('saving');
  try {
    const snapshot = buildCloudSnapshot();
    const title = d.diagramName.trim() || undefined;
    await api(`/api/diagrams/${cloud.diagramId}`, { method: 'PUT', body: { snapshot, title } });
    useCloudStore.getState().setStatus('saved');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const c = useCloudStore.getState();
      c.clearCloudTarget();
      useToastStore.getState().addToast('info', 'That diagram was removed from the library — save it as new.');
      c.setAddToLibraryOpen(true);
      return;
    }
    if (err instanceof TypeError || (err instanceof ApiError && err.status >= 500)) {
      useCloudStore.getState().setStatus('offline');
      return;
    }
    useCloudStore.getState().setStatus('dirty');
    useToastStore.getState().addToast('error', friendlyError(err));
  }
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/hooks/librarySave.test.ts`, then `npm test`, `npx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add -A src/hooks/librarySave.ts src/hooks/librarySave.test.ts src/utils/buildCloudSnapshot.ts src/components/Cloud
git commit -m "feat(workspace): saveToLibrary router — one save path for all states"
```

---

### Task 5: AddToLibraryDialog

**Files:**
- Create: `src/components/Workspace/AddToLibraryDialog.tsx`, `src/components/Workspace/index.ts`
- Modify: `src/App.tsx` (render the dialog once, near the other top-level modals)

**Interfaces:**
- Consumes: `useCloudStore` (`addToLibraryOpen`, `setAddToLibraryOpen`, `setCloudTarget`), `useAuthStore` (groups), `useDiagramStore` (`diagramName`, `setDiagramName`), `api`, `friendlyError`, `buildCloudSnapshot`, `Modal`, `useToastStore`.
- Produces: `<AddToLibraryDialog />` — self-contained (reads its open flag from the store; no props). Later tasks only need it mounted once in App.

- [ ] **Step 1: Implement the component**

Behavior (adapted from `src/components/Cloud/CloudSaveDialog.tsx` — read it first; visual conventions identical):
- Open = `useCloudStore((s) => s.addToLibraryOpen)`; close = `setAddToLibraryOpen(false)`.
- On open-transition: resync `title` from `useDiagramStore.getState().diagramName` and `groupId` from `groups[0]?.id` (same effect pattern CloudSaveDialog uses).
- Modal `size="sm"`, title `Add to library`. Fields: title input (label `Title`); group `<select>` only when `groups.length > 1` (label `Group`); reminder paragraph with the EXACT text `Reminder: only de-identified data may be saved to the shared library.`
- Footer: primary button `Add to library` (`data-modal-focus="primary"`, disabled while busy or title blank). Submit:

```tsx
const handleAdd = async () => {
  setBusy(true);
  try {
    const snapshot = buildCloudSnapshot(title);
    const res = await api<{ id: number; currentVersionId: number }>('/api/diagrams', {
      method: 'POST',
      body: { groupId, title, snapshot },
    });
    useDiagramStore.getState().setDiagramName(title);
    useCloudStore.getState().setCloudTarget(res.id, groupId);
    useToastStore.getState().addToast('info', 'Added to the library');
    useCloudStore.getState().setAddToLibraryOpen(false);
  } catch (err) {
    useToastStore.getState().addToast('error', friendlyError(err));
  } finally {
    setBusy(false);
  }
};
```

- Export from `src/components/Workspace/index.ts`. Mount `<AddToLibraryDialog />` once in `src/App.tsx` alongside the app's other top-level overlay components (find where `RecoveryPrompt`/toaster hosts render).

- [ ] **Step 2: Verify** — `npm run lint` (no new), `npx tsc -b`, `npm test`, `npm run build`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Workspace src/App.tsx
git commit -m "feat(workspace): Add-to-library dialog (first save into the team library)"
```

---

### Task 6: Workspace home view

**Files:**
- Create: `src/components/Workspace/Workspace.tsx`, `WorkspaceHeader.tsx`, `DiagramCard.tsx`, `AccountChip.tsx`
- Modify: `src/components/Workspace/index.ts`

**Interfaces:**
- Consumes: `api`, `friendlyError`, `DiagramListItem`/`CloudDiagram` types, `useAuthStore` (user, groups, signOut), `useCloudStore` (setCloudTarget, clearCloudTarget, setView), `useDiagramStore` (loadDiagram, clearDiagram), `confirmAsync`, `useToastStore`, `saveDiagramJson`, `Modal`, `useMenu`/`MenuItem` patterns from `src/components/Toolbar/`.
- Produces: `<Workspace />` (no props — App renders it when `view === 'workspace'` and a user exists); `<AccountChip />` (props: none; shows initials → menu with display name, email, `Sign out`) — reused by CanvasHeader in Task 7. `Sign out` handler: `await signOut(); useCloudStore.getState().clearCloudTarget(); useCloudStore.getState().setView('canvas');`

- [ ] **Step 1: Implement Workspace container + data**

`Workspace.tsx`: port the data logic from `src/components/Cloud/LibraryModal.tsx` VERBATIM in behavior — `effectiveGroupId` defaulting to `groups[0]`, `requestSeq` stale-response guard, `items: DiagramListItem[] | null`. Fetch on mount and on group change. States: loading (`Loading your diagrams…`), error (error toast via `friendlyError` + a `Try again` button that calls refresh), empty (`No diagrams yet — create the first one.`).

Actions row: `＋ New diagram` (primary style per `theme.ts`): `useDiagramStore.getState().clearDiagram(); useCloudStore.getState().clearCloudTarget(); useCloudStore.getState().setView('canvas');`. `Open a file…`: hidden `<input type="file" accept=".json,.drawing">`; on pick, reuse the parsing behavior of `Toolbar.tsx`'s `handleFileChange` (read it; same JSON.parse → shape check → `loadDiagram` → `clearCloudTarget`; for `.drawing` the importer util it calls) then `setView('canvas')`.

Open a diagram (card click):

```tsx
const openDiagram = async (item: DiagramListItem) => {
  try {
    const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
    const snap = d.snapshot;
    if (!snap.elements || !snap.connections) {
      useToastStore.getState().addToast('error', 'That diagram looks corrupted — ask your group admin.');
      return;
    }
    useDiagramStore.getState().loadDiagram(
      snap.elements as never, snap.connections as never, snap.name,
      (snap.transcript ?? null) as never, snap.styleConfig as never,
    );
    useCloudStore.getState().setCloudTarget(d.id, d.groupId);
    useCloudStore.getState().setView('canvas');
  } catch (err) {
    useToastStore.getState().addToast('error', friendlyError(err));
  }
};
```

(Replace the `as never` casts with the real types if they line up as they did in LibraryModal — they should.)

- [ ] **Step 2: Implement WorkspaceHeader + AccountChip + DiagramCard**

`WorkspaceHeader`: `<group name> Workspace` heading (group name from the selected group), group `<select>` only when `groups.length > 1`, `<AccountChip />` right-aligned. `AccountChip`: circular initials button (first letters of displayName) opening a `useMenu`-pattern dropdown: non-interactive rows for displayName + email, divider, `Sign out` MenuItem.

`DiagramCard`: card layout per the approved mockup (title, `last edited by <lastEditor> · <relative time>`, `<versionCount> version(s)`), whole card clickable (role="button", keyboard handling like LibraryModal rows), ⋯ menu (stopPropagation) with:
- `Rename`: small Modal with a title input; submit → `api PUT /api/diagrams/:id` with `{snapshot, title}`? NO — rename must not create a version. There is no rename-only endpoint (zero server changes), so Rename = open the diagram is the honest alternative… **Decision (binding):** the card menu offers `Rename` implemented as: fetch the diagram (`GET`), PUT back the same snapshot with the new title. This does add a version row (harmless; versions are cheap) — add a code comment noting a rename-only endpoint is a sub-project-B nicety.
- `Download a copy`: `GET /api/diagrams/:id` → `saveDiagramJson({ diagramName: <new title from item>, elements/connections/styleConfig/transcript from snapshot })`.
- `Delete`: `confirmAsync({ title: 'Delete diagram', message: 'Delete "<title>" from the shared library? All of its versions will be removed.', confirmLabel: 'Delete', variant: 'destructive' })` → `DELETE` → refresh; errors → `friendlyError` toast (the 403 maps to the friendly permission message from Task 1). Delete appears for everyone; the server enforces the creator-or-admin rule (the list endpoint doesn't expose creator — acceptable, documented in a comment).

Relative time helper (local to DiagramCard): minutes/hours/days ago, falling back to `toLocaleDateString()` past 7 days; parse with `new Date(item.updatedAt + 'Z')`.

- [ ] **Step 3: Verify** — `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`. Visual check happens in Task 9's walkthrough.

- [ ] **Step 4: Commit**

```bash
git add src/components/Workspace
git commit -m "feat(workspace): card-gallery home — browse, open, rename, download, delete"
```

---

### Task 7: CanvasHeader + save rerouting

**Files:**
- Create: `src/components/Workspace/CanvasHeader.tsx`, `src/components/Workspace/OfflineBanner.tsx`
- Modify: `src/App.tsx` (render header when signed in; reroute handleSave; mount dirty tracking), `src/components/Toolbar/Toolbar.tsx` (reroute its Save; hide its title input when signed in), `src/components/Workspace/index.ts`

**Interfaces:**
- Consumes: `saveToLibrary`, `useDirtyTracking`, `useCloudStore` (status, view, setView), `useAuthStore`, `useDiagramStore` (`diagramName`, `setDiagramName`), `AccountChip`, `saveDiagramJson`, `Modal`, `useMenu`/`MenuItem`/`IconButton` patterns.
- Produces: `<CanvasHeader />` (no props; App renders it above the Toolbar when `user && view === 'canvas'`), `<OfflineBanner />` (rendered by CanvasHeader when `status === 'offline'`).

- [ ] **Step 1: Implement CanvasHeader**

Layout per the approved mockup: left `← <group name>` button; center stack = inline-editable title (input styled as a heading, commits to `setDiagramName` on blur/Enter, placeholder `Untitled diagram`) with the status line beneath; right = `File ▾` menu + `<AccountChip />`.

Status line copy (exact, from Global Constraints), driven by `useCloudStore((s) => s.status)`:

```tsx
const STATUS_TEXT: Record<LibrarySaveStatus, (group: string) => string> = {
  saved: (g) => `Saved to ${g} ✓`,
  dirty: () => 'Unsaved changes — ⌘S to save',
  saving: () => 'Saving…',
  notInLibrary: () => 'Not in the library — Save adds it',
  offline: () => '', // the banner carries the message
};
```

(Group name: the group matching `cloudStore.groupId` in `authStore.groups`, else the first group's name.)

Back button: if status is `dirty` or `offline`, open a small three-choice Modal (`Save before leaving?` — buttons `Save`, `Discard changes`, `Stay`): Save → `await saveToLibrary()`, then leave only if status became `saved`; Discard → leave; Stay → close. Leaving = `setView('workspace')`. Otherwise leave immediately.

File ▾ menu (useMenu pattern): `Download a copy` → `saveDiagramJson` with the current store fields; `Open a file…` → same hidden-input loader as Workspace (after load: `clearCloudTarget()`, stay in canvas).

`OfflineBanner`: slim bar under the header when `status === 'offline'`: text `Can't reach the <group> server — your work is safe on this computer. We'll save to the library when you reconnect.` + `Try again` button → `void saveToLibrary()`.

- [ ] **Step 2: Reroute saves and mount tracking**

- `src/App.tsx:160` `handleSave` becomes `void saveToLibrary();` (drop the direct `saveDiagramJson` call and its now-unused imports; ⌘S at ~:271 flows through it already).
- `src/components/Toolbar/Toolbar.tsx:71` `handleSave` likewise becomes `void saveToLibrary();`.
- In App: `useDirtyTracking(useAuthStore((s) => s.user) !== null);` and render `{user && view === 'canvas' && <CanvasHeader />}` above the Toolbar.
- Toolbar: wrap its existing title `<input>` (Toolbar.tsx:229) in `{!user && (...)}` — signed in, the CanvasHeader owns the title.

- [ ] **Step 3: Verify** — `npm run lint`, `npx tsc -b`, `npm test` (the librarySave tests cover routing), `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Workspace src/App.tsx src/components/Toolbar/Toolbar.tsx
git commit -m "feat(workspace): canvas header with live save status; Save/⌘S routes through saveToLibrary"
```

---

### Task 8: View switching, sign-in entry, Cloud/ removal, copy pass

**Files:**
- Modify: `src/App.tsx` (view switching + invite handling), `src/components/Toolbar/Toolbar.tsx` (remove CloudMenu; add signed-out `Sign in` button), `src/api/authStore.ts` (no change expected — verify), SignInModal copy
- Move: `src/components/Cloud/SignInModal.tsx` → `src/components/Workspace/SignInModal.tsx`
- Delete: `src/components/Cloud/` (CloudMenu.tsx, CloudSaveDialog.tsx, LibraryModal.tsx, index.ts)

**Interfaces:**
- Consumes: everything above.
- Produces: final app wiring. `App` renders: `user && view === 'workspace'` → `<Workspace />`; otherwise the canvas UI (with CanvasHeader when signed in). SignInModal keeps its props (`open`, `onClose`, `inviteToken`, `initialServerUrl`) — NOTE: it already has an `onAuthenticated` callback (added when CloudMenu cleared its invite state); reuse it for view routing rather than adding a new prop.

- [ ] **Step 1: Move invite/sign-in ownership to App**

Port from `CloudMenu.tsx` into `App.tsx` (before deleting it): the one-time `URLSearchParams` read of `invite`/`server`, `signInOpen` state initialized to `inviteToken !== null`, and rendering `<SignInModal open={...} onClose={...} inviteToken={inviteToken} initialServerUrl={...} onAuthenticated={handleAuthenticated} />`.

```tsx
const handleAuthenticated = () => {
  setInviteToken(null);
  const d = useDiagramStore.getState();
  const hasWork = d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null;
  if (!hasWork) useCloudStore.getState().setView('workspace');
};
```

Also extend the existing `restore()` effect: after `await restore()`, if a user is now present and the diagram store has no work (same `hasWork` check), `setView('workspace')`.

- [ ] **Step 2: Toolbar changes**

Remove `<CloudMenu />` and its import. Add, visible only when signed out, a `Sign in` button (IconButton or text button matching toolbar style) that opens the App-level SignInModal (App passes an `onOpenSignIn` prop to Toolbar, or Toolbar reads a small setter passed down — follow whichever prop-passing pattern Toolbar already uses for its callbacks).

- [ ] **Step 3: View switching in App render**

```tsx
const user = useAuthStore((s) => s.user);
const view = useCloudStore((s) => s.view);
if (user && view === 'workspace') return (<><Workspace ... /><SignInModal .../><Toaster/... overlay hosts/></>);
```

Follow App's actual render structure: the Workspace replaces the canvas+toolbar subtree, while global overlay hosts (Toaster, ConfirmHost, AddToLibraryDialog, SignInModal) render in both views. Keyboard shortcuts (⌘S etc.) must not fire in workspace view — guard the handler with `view === 'canvas' || !user`.

- [ ] **Step 4: SignInModal copy pass + move**

`git mv src/components/Cloud/SignInModal.tsx src/components/Workspace/SignInModal.tsx`; fix imports. Copy edits: disclosure label `Advanced…`, field label `Server address`; register-mode title `Create your account`; inline errors go through `friendlyError(err)`. POLICY_LABEL text unchanged. Call `onAuthenticated()` after successful signIn/register (in addition to existing behavior).

- [ ] **Step 5: Delete the Cloud directory + sweep for "cloud"**

```bash
git rm -r src/components/Cloud
```

Fix any dangling imports (`npx tsc -b` finds them). Then sweep: `grep -rn "cloud" src --include="*.tsx" -i | grep -v cloudStore | grep -v buildCloudSnapshot | grep -v CloudDiagram` — no USER-VISIBLE string may contain "cloud" (internal identifiers are fine).

- [ ] **Step 6: Verify** — `npm run lint` (baseline only), `npx tsc -b`, `npm test`, `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(workspace): view switching, sign-in entry, remove old cloud menu, language pass"
```

---

### Task 9: Full verification + browser walkthrough

**Files:** none planned; fixes only.

- [ ] **Step 1: Automated checks**

```bash
npm run lint && npx tsc -b && npm test && npm run build
cd server && npm run typecheck && npx vitest run   # must be untouched: 44 passing
git diff --stat main -- server/   # MUST be empty (zero server changes)
```

- [ ] **Step 2: Browser walkthrough (Playwright MCP, fresh server + dev frontend)**

Fresh backend (`rm -rf server/data`, bootstrap env vars), `npm run dev`. Verify, taking snapshots:
1. Signed out: canvas identical to production today; Sign in button present; no Workspace, no header strip; local save prompts a file dialog (verify the call path, not the native dialog).
2. Sign in as admin → lands on Workspace (empty state copy exact) → New diagram → canvas shows header: `← COMS`, title `Untitled Diagram`, status `Not in the library — Save adds it`.
3. Draw an element → ⌘S → Add to library dialog (reminder text exact) → Add → status `Saved to COMS ✓`; edit → status flips to `Unsaved changes — ⌘S to save`; ⌘S → `Saving…` → `Saved to COMS ✓`.
4. ← back → Workspace shows the card (editor/time/version count); rename via card menu; download a copy; open again; delete (confirm copy exact).
5. Invite → register second account (policy checkbox gating) → lands on Workspace.
6. Kill the server mid-edit → ⌘S → offline banner (copy exact), work continues; restart server → `Try again` → `Saved ✓`.
7. Sign out → canvas, signed-out toolbar back to normal.
8. Sweep the rendered UI for the word "cloud" — must not appear.

- [ ] **Step 3: Fix anything found, re-run, commit**

```bash
git add -A && git commit -m "fix(workspace): walkthrough fixes"
```

(Skip if clean.)
