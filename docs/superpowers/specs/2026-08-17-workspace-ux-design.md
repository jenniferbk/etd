# Workspace UX Redesign (Groupware sub-project A) — Design

**Date:** 2026-08-17
**Status:** Approved design, pending implementation plan
**Context:** First of three UX sub-projects (A: core experience — this spec; B: in-app admin; C: version history + conflict protection). Goal: the groupware features should feel purpose-built and friendly for non-technical researchers — intuitive discovery, one obvious save model, always-visible "where am I / is my work safe."

## Decisions already made (with Jennifer, incl. visual mockups)

- **Cloud-first save:** signed in, Save/⌘S targets the team library. Downloading a `.json` file becomes an explicit "Download a copy" action.
- **Deliberate saves + visible nudge**, not autosave-to-cloud: every save is a meaningful version; an always-visible status shows unsaved/saved state. Local autosave (crash protection) unchanged.
- **Workspace home, card-gallery layout** (mockup option A): signed-in users land on their team's diagram cards, not the canvas.
- **Canvas header, Google-Docs style** (mockup option A): ← back button, centered editable title with live save status beneath, account chip right.
- **Language pass:** the word "cloud" disappears from the UI; "library"/"workspace" vocabulary; plain-language errors.
- **Frontend only. Zero server changes.**

## App structure

Two top-level views, toggled by App state (no router):

| State | View |
|---|---|
| Signed out | Canvas, byte-for-byte today's behavior (jenkleiman.com unaffected) |
| Signed in, no diagram open | **Workspace** (home) |
| Signed in, diagram open | Canvas with the new header |

- On launch signed in → Workspace. After `restore()` resolves a valid session mid-launch, switch to Workspace only if the user hasn't started editing.
- Registering via an invite link ends on the Workspace.
- Signing out from either view → canvas (signed-out mode), cloud target cleared.

## The Workspace (home view)

**Header:** `<group name> Workspace` (server-provided group name); group switcher (select) only when the user belongs to >1 group; account chip (initials → menu: display name, email, Sign out).

**Actions row:** primary button **＋ New diagram** (opens a fresh canvas, not yet in the library); secondary **Open a file…** (local `.json`/`.drawing`, existing loaders; opens canvas with status "Not in the library").

**Diagram cards:** title, "last edited by <name> · <relative time>", version count ("4 versions"). Click → open in canvas (existing GET + loadDiagram path, sets cloud target). Card ⋯ menu: **Rename** (PUT with new title), **Download a copy** (fetch snapshot → existing saveDiagramJson), **Delete** (visible/enabled per the existing creator-or-admin rule; existing destructive confirm copy).

**States:** loading ("Loading your diagrams…"), empty ("No diagrams yet — create the first one."), error (plain-language toast + retry button). Stale-response guard from the current LibraryModal carries over.

## Canvas header (signed in)

Layout: `[← <group name>] — [title, editable inline] / [status line] — [File ▾] [account chip]`

- **← button:** returns to Workspace. If unsaved changes: confirm dialog "Save before leaving?" → Save / Discard changes / Stay.
- **Title:** click to edit inline; blur/Enter commits to `diagramName` (and to the library on next save). Placeholder "Untitled diagram" when blank.
- **Status line** (the save-state machine):
  - `saved` — "Saved to <group> ✓" (quiet green)
  - `dirty` — "Unsaved changes — ⌘S to save" (amber dot)
  - `saving` — "Saving…"
  - `notInLibrary` — "Not in the library — Save adds it"
  - `offline` — banner state, see below
  - Dirty detection: any diagramStore mutation after the last successful library save (reuse the store's temporal/undo tick or a lightweight dirty flag set by the same code path autosave watches).
- **File ▾ menu:** Download a copy (.json) and Open a file… only. The existing Export menu (PNG/SVG/PDF) stays exactly where it is today — no relocation, no duplication.
- **Save button + ⌘S:** signed in → library save. New/unlinked diagram → **Add to library dialog**: title (prefilled), group picker (only if >1), the exact policy reminder "Reminder: only de-identified data may be saved to the shared library.", primary button "Add to library". Linked diagram → direct PUT; on 404 keep the existing recovery (clear target, reopen dialog with plain-language toast).
- Signed out: header reverts to today's toolbar; Save/⌘S = local file save, unchanged.

## Offline / unreachable server

On a failed library call (network error, 5xx): calm banner under the header — "Can't reach the <group> server — your work is safe on this computer. We'll save to the library when you reconnect." Local autosave continues. Save button becomes "Try again". No modal interruptions. Banner clears on the next successful call.

## Language pass (copy inventory — binding)

| Where | Old | New |
|---|---|---|
| UI everywhere | "cloud", "Save to cloud" | "library", "Save" (header status carries the meaning) |
| Old cloud menu | (menu removed) | — |
| Sign-in modal title | "Sign in" | "Sign in" (unchanged) |
| Server field | "Server settings…" | "Advanced…" disclosure, field label "Server address" |
| Register title | "Create account" | "Join <group name>" when the invite resolves a group name; else "Create your account" |
| Policy checkbox | (exact text unchanged — research requirement) | (unchanged) |
| Save reminder | (exact text unchanged) | (unchanged, shown in Add-to-library dialog) |
| Used invite error | "invalid or expired invite" | "That invite link has already been used or expired — ask your group admin for a new one." (client-side mapping; server message unchanged) |
| Wrong password | "invalid email or password" | "That email and password don't match — try again, or ask your group admin to reset your password." (client-side mapping) |
| Delete confirm | (existing copy) | unchanged |

Client-side error mapping happens in one place (a `friendlyError(err)` helper) keyed on status + server message; unmapped errors pass through verbatim.

## What this replaces / keeps

- **Removed:** CloudMenu (dropdown), LibraryModal, CloudSaveDialog (its logic moves into AddToLibraryDialog).
- **New components:** `Workspace/` (home view: header, cards, card menu), `CanvasHeader/` (title, status, File menu), `AddToLibraryDialog`, `friendlyError` util, save-routing hook (`useLibrarySave`).
- **Kept unchanged:** SignInModal (copy edits only), API client, authStore, cloudStore (gains a `dirty`/status slice or a sibling store), diagramStore, all server code, local autosave, all export/palette/canvas features.
- Invite links keep working: `?invite=` opens the register modal over the signed-out canvas; success → Workspace.

## Testing

- Unit: save-routing (signed-in ⌘S → library vs signed-out → file; unlinked → dialog; 404 recovery), status-state machine transitions (edit → dirty; save → saving → saved; failure → offline), friendlyError mappings, Workspace data handling (loading/empty/error/stale-guard).
- Existing 144 tests keep passing; signed-out behavior is regression-tested by them.
- Manual browser walkthrough at the end: invite → register → land on Workspace → new diagram → save flow → reopen → rename → download copy → delete; offline banner by killing the server; signed-out sanity on the same build.
- Visual quality: implementation uses the frontend-design approach, matching the app's existing clean/sage aesthetic; reference mockups saved under `.superpowers/brainstorm/` (session 71876-1787015157).

## Out of scope (later sub-projects)

- B: in-app admin — invites, member management, password resets as a Workspace "People" page.
- C: version history browser + conflict protection (409/base_version_id; server already stores all versions).
- Comments (original Phase 3), autosave-to-cloud, drafts/publish.
