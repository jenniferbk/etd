# Groupware for the Extended Toulmin Diagram Editor — Design

**Date:** 2026-08-17
**Status:** Approved design, pending implementation plan
**Requested by:** Annamarie Conner / COMS team

## Goal

Add collaboration to the ETD editor: user accounts, cloud storage of diagrams
(including transcripts and embedded images), shared group libraries, version
history, and per-diagram comments. The COMS office Mac hosts the backend for
all Conner-affiliated research groups; other groups can self-host the same
server from this repo.

## Decisions already made

- **Collaboration model:** async, save-based. No live co-editing, no locks.
  Every cloud save is a version; conflicting saves are detected and the user
  chooses how to resolve.
- **Accounts:** invite-only now, designed so open signup could come later.
- **Hosting:** self-hosted lightweight backend on the COMS office Mac (UGA
  machine), exposed via an outbound tunnel. Portable to any VM/cloud host.
- **Data policy:** users must only upload de-identified data. The app states
  this at account creation (acknowledgment) and in the cloud-save dialog
  (standing reminder). The system is still built to real security standards
  (HTTPS, hashed passwords, membership checks, encryption at rest).
- **Comments:** per-diagram flat discussion thread. No element-anchored
  comments in v1.
- **Multi-group from day one:** one server hosts multiple group libraries.

## Architecture

Two pieces, one repo:

```
etd/
├── src/            existing React app (stays on Netlify, unchanged home)
│   ├── api/        NEW: thin API client + auth store (zustand)
│   └── components/ NEW: Library, Comments, VersionHistory UI
└── server/         NEW: Node + TypeScript + SQLite backend
    └── README.md   setup guide for the COMS Mac and for self-hosters
```

- **Frontend:** cloud features are additive and hidden until sign-in. Local
  open/save and localStorage autosave are untouched. A **server URL setting**
  (login screen, persisted in localStorage, default = COMS server) is the
  entire self-hosting hook on the app side.
- **Backend:** one Node process, one SQLite database file. No Docker
  required. Express for routing (boring and well-trodden), Zod for request
  validation (already used in the app).
- **Auth:** email + password with invite links. **No SMTP anywhere** — an
  admin generates invite links and password-reset links and sends them
  personally. Sessions are opaque bearer tokens (stored in localStorage,
  sent via `Authorization` header) over HTTPS. Argon2 password hashing,
  login rate-limiting, session expiry.

## Data model

Six tables:

| Table | Contents |
|---|---|
| `users` | email, password hash, display name, `is_site_admin` |
| `groups` | name (e.g., "COMS") |
| `memberships` | user ↔ group, role `admin` \| `member` |
| `diagrams` | title, owning group, creator, pointer to current version |
| `diagram_versions` | full JSON snapshot per save (gzipped), author, timestamp, optional label |
| `comments` | diagram, author, text, timestamp |

Plus `invites` / `password_resets`: single-use tokens with expiry.

**Access rule (deliberately simple):** every member of a group can view and
edit every diagram in that group's library. Deleting a diagram requires the
creator or a group admin. No per-diagram permissions in v1.

**Snapshots, not diffs:** each version stores the complete diagram JSON,
gzipped (embedded images can make snapshots a few MB; SQLite handles blobs
fine at this team's scale). Restore = a new save whose content is the old
version, so history is never rewritten.

**Conflict handling:** the client remembers which version it opened
(`base_version_id`) and sends it with each save. If the diagram's head has
moved, the server rejects with 409 and the UI offers three choices:
**overwrite**, **save as a copy**, or **cancel and view the newer version**.
Nothing is lost in any branch — every save is a version.

## API surface

All JSON under `/api`. Everything except register/login requires the bearer
token; every diagram/version/comment route checks group membership
server-side.

- **Auth:** `POST /auth/register` (requires invite token), `POST /auth/login`,
  `POST /auth/logout`, `GET /auth/me`
- **Admin:** `POST /invites` → returns a shareable link; `POST
  /password-resets` → same; `POST /groups`; membership add/remove
- **Diagrams:** `GET /groups/:id/diagrams` (library list: title, last
  editor, updated time, version count), `POST /diagrams`, `GET
  /diagrams/:id` (current version), `PUT /diagrams/:id` (save; carries
  `base_version_id`), `DELETE /diagrams/:id`
- **Versions:** `GET /diagrams/:id/versions`, `GET /versions/:id`
- **Comments:** `GET` / `POST /diagrams/:id/comments`; delete own comment

## Frontend UX

- **Toolbar "Cloud" area:** "Sign in" when signed out; library/save/account
  actions when signed in. Login screen includes the server URL field.
- **Library:** modal listing the group's diagrams (title, last editor,
  updated, version count) with a group switcher for multi-group users.
- **Saving:** "Save to cloud" alongside existing local save. First cloud
  save asks for a title and shows the de-identified reminder; later saves
  are one click with an optional version label. Conflicts open the
  three-choice dialog.
- **Version history:** right-side panel listing versions; clicking one
  previews it read-only with a banner ("Viewing version from … — Restore /
  Back to current").
- **Comments:** right-side panel, flat thread, newest at bottom, refetch on
  open (no websockets).
- **Autosave stays local-only** so cloud versions stay meaningful
  (deliberate saves, not one per keystroke).

## Deployment & operations (COMS Mac)

- Server runs under `launchd` (LaunchDaemon): starts on boot, restarts on
  crash, no user login required.
- Machine checklist in `server/README.md`: enable FileVault (encryption at
  rest), disable sleep, keep macOS auto-updates from silently rebooting at
  bad times.
- **Tunnel:** Cloudflare Tunnel (if a domain/subdomain can live on
  Cloudflare) or Tailscale Funnel (`*.ts.net`, no domain needed). Both free,
  outbound-only — no inbound firewall changes on the UGA network. Which one
  is a deployment-day decision; the server doesn't care.
  - Open item: confirm UGA IT policy permits a long-running tunneled
    service on an office machine. [VERIFY with UGA IT / department]
- **Backups:** nightly `launchd` job snapshots the SQLite file (via
  `sqlite3 .backup`) into a dated file in `backups/`, keep ~30; that folder
  lives inside the Mac's OneDrive-synced directory so UGA OneDrive
  (UGA-approved storage) holds offsite copies automatically.
- **Self-hosting:** `server/README.md` is the guide — clone, `npm install`,
  set env vars (port, first-admin bootstrap), run. First launch creates the
  admin account and first group.

## Phasing

1. **Phase 1 — usable end-to-end:** server skeleton, auth + invites +
   groups, save/open/list diagrams, policy notices, deployed on the Mac.
2. **Phase 2:** version history + conflict handling.
3. **Phase 3:** comments.
4. **Phase 4:** self-hosting docs polish, admin UI for member management
   (replacing raw API calls).

## Testing

- **Server:** vitest integration tests, each API route against a throwaway
  SQLite file. Priority coverage: auth flows, membership enforcement on
  every route, conflict detection (409 paths).
- **Frontend:** unit tests for the API client and new stores.
- **Manual:** browser walkthrough with Claude for Chrome after each phase
  (login, save, reopen from another account, conflict flow, versions,
  comments).

## Out of scope (v1)

Live co-editing, element-anchored comments, per-diagram permissions, email
sending, open signup, admin analytics. The data model doesn't preclude any
of these.

## Addendum (2026-08-17, approved in conversation): campus-VPN deployment variant

Reality check from the COMS office: no admin password is obtainable for the
Mac, UGA IT won't assist, and the team already reaches a Transana/MySQL
server on that machine via its campus IP with the UGA VPN from off campus.
ETD rides the identical access pattern instead of a tunnel:

- The ETD server also **serves the built frontend** (new optional
  `ETD_STATIC_DIR` env var: static files + SPA fallback for non-`/api` GET
  routes). The team visits `http://<campus-ip>:<port>/` directly — app and
  API are same-origin, which sidesteps the HTTPS-page → HTTP-API
  mixed-content block that made jenkleiman.com unusable against a campus
  HTTP server.
- The frontend's **default server URL becomes same-origin** in production
  builds when `VITE_ETD_API_URL` is unset (dev keeps `http://localhost:8787`).
- **No-admin operation:** LaunchAgent (`~/Library/LaunchAgents`) instead of
  LaunchDaemon, plus `caffeinate`; documented as a variant in
  server/README.md with its stated trade-offs (survives reboot only after
  someone logs in; no FileVault toggle). Same operational posture the
  Transana server already has and the team already accepts.
- **Security posture:** off-campus leg encrypted by UGA VPN; on-campus leg
  is plain HTTP. Carried by the de-identified-data-only policy; Tailscale
  or a certificate remain bolt-on upgrades later.
- jenkleiman.com keeps hosting the public, local-files-only editor.
- The real campus IP stays out of the repo (placeholders in docs).

Tunnel-based deployment (previous plan) remains documented and preferred
where an admin exists; nothing in the server depends on which is used.
