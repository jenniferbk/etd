# In-App Admin — "People" page (Groupware sub-project B) — Design

**Date:** 2026-08-18 (overnight session)
**Status:** Drafted autonomously under Jennifer's overnight authorization; decisions flagged ⚑ for her morning review.
**Context:** Second of three UX sub-projects (A: Workspace experience — merged; B: this; C: versions/conflicts). Goal: Annamarie and Jennifer manage their groups entirely in-app — invites, members, roles, password resets — no terminal, no curl.

## What a non-technical admin can do after this ships

1. Open **People** from the Workspace header.
2. See everyone in the group (name, email, role).
3. **Invite someone**: one click → a copyable invite link with plain instructions ("Send this to your colleague — the link works once and expires in 14 days").
4. **Help someone locked out**: click *Reset password* next to their name → copyable reset link → the colleague opens it and sets a new password right in the app.
5. Change roles (member ↔ admin), remove members, with confirmation.
6. Site admins additionally: create a new group; add an existing account to a group by email.

Members (non-admins) can open People too and see the roster (⚑ decision: visible to all group members — a team roster is friendly groupware; admin actions hidden unless you're an admin).

## Server additions (small, additive; existing endpoints reused wherever they exist)

| Change | Why |
|---|---|
| `GET /api/groups/:id/members` → `[{id, email, displayName, role}]` (member-visible) | roster; doesn't exist yet |
| `GET /api/invites/:token/preview` → `{groupName}` (unauthenticated, valid unused tokens only) | lets the register modal say "Join COMS" (deferred from A); leaks only the group name of a valid invite ⚑ |
| `PATCH /api/diagrams/:id` `{title}` (member) — title-only update, NO version row | fixes A's ledgered "rename creates a version" wart |
| Reuse as-is: `POST /api/invites`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:userId`, `POST /api/password-resets`, `POST /api/auth/reset-password`, `POST /api/groups` | already built + tested in Phase 1 |

## Frontend

- **PeoplePage** (Workspace sub-view, not a modal — it's a peer of the diagram gallery; header gains a `People` nav item): roster table/cards; per-row ⋯ menu (admin-only): `Make admin`/`Make member`, `Reset password…`, `Remove from group…` (confirm, destructive).
- **InviteDialog**: role note, generate → shows the full link (`<origin>/?invite=<TOKEN>`) with a Copy button + the plain-language instruction + expiry note. ⚑ link uses `window.location.origin`, correct for the campus same-origin deployment.
- **ResetLinkDialog**: same pattern (`<origin>/?reset=<TOKEN>`), copy + "This link lets them set a new password. It expires in 24 hours."
- **SetNewPasswordModal**: opens when the app URL has `?reset=<token>` (mirrors the invite-param pattern): new password ×2, min 8, submit → `POST /api/auth/reset-password` → success message → opens Sign in.
- **Register modal**: title becomes `Join <groupName>` when the invite preview resolves; falls back to `Create your account`.
- **NewGroupDialog** (site admins only, from the group switcher area): name → create → switch to it.
- Rename on diagram cards switches to the new PATCH (no more version-row side effect).
- All copy plain-language; errors via friendlyError; no "cloud".

## Out of scope
Email sending (links are copy/paste by design), per-diagram permissions, audit logs, C's version/conflict work.

## Testing
Server: vitest for the three new endpoints (roster member-visibility, preview token validity/no-info-leak on invalid, PATCH title no-version-row + permissions). Frontend: friendlyError additions, reset-param routing logic. Manual walkthrough: full admin loop (invite → join → promote → reset → remove) via Playwright at the end.

## Binding copy (added at spec self-review)

- Workspace nav item: `People`. Roster columns: Name / Email / Role.
- Row menu (admins only): `Make admin` / `Make member` / `Reset password…` / `Remove from group…`
- InviteDialog: title `Invite someone`; instruction `Send this link to your colleague. It works once and expires in 14 days.`; buttons `Create invite link`, `Copy link` (→ `Copied ✓`).
- ResetLinkDialog: title `Reset password`; instruction `Send this link to <name>. It lets them set a new password and expires in 24 hours.`
- Remove confirm: `Remove <name> from <group>? They'll lose access to its diagrams. Their account stays active.` — destructive button `Remove`.
- SetNewPasswordModal: title `Set a new password`; fields `New password` / `Confirm new password`; button `Set password`; mismatch error `Those passwords don't match.`; success toast `Password updated — you can sign in now.`
- Register title with resolved preview: `Join <groupName>`; fallback unchanged (`Create your account`).
- NewGroupDialog: title `New group`; button `Create group`.
- ⚑ Link composition uses `window.location.origin + window.location.pathname` (NOT origin alone) so links stay correct under sub-path deployments like jenkleiman.com/tools/etd/.

## Self-review notes
- Mount-order constraint: the unauthenticated `GET /api/invites/:token/preview` lives in inviteRoutes, which is mounted BEFORE the router-wide-requireAuth routers (diagrams, groups) — already true in app.ts; the plan must state it so nobody reorders.
- PATCH rename bumps `updated_at` (list stays freshest-first) but not lastEditor (that derives from the current version's author) — accepted.
- Invalid/used preview tokens return the same generic 404 as expired ones — no oracle for token validity beyond what registration itself reveals.
