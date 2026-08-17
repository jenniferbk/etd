# etd-server

## 1. What this is

`etd-server` is the groupware backend for the Extended Toulmin Diagram (ETD)
editor. It is a single Node.js process backed by a single SQLite file — no
external database, no message queue, no build step beyond `npm install`. It
handles accounts, groups, invites, password resets, and stores diagrams for
signed-in users. The ETD editor frontend (a static site) talks to this
server over HTTPS for anything that needs to be shared or persisted across
devices; the frontend still works standalone (local-only) without it.

## 2. Quick start (any machine)

```bash
cd server
npm install
```

Set the environment variables the server needs. `PORT` and `ETD_DB_PATH`
apply every time the server starts. `ETD_ADMIN_EMAIL`, `ETD_ADMIN_PASSWORD`,
and `ETD_INITIAL_GROUP` are **only read once, when the database is empty** —
on every later launch they're ignored, and if you never set them the very
first time, the server refuses to start with an error telling you to set
`ETD_ADMIN_EMAIL`/`ETD_ADMIN_PASSWORD` (see `server/src/bootstrap.ts`).

```bash
export PORT=8787
export ETD_DB_PATH=./data/etd.sqlite
export ETD_ADMIN_EMAIL=you@example.edu
export ETD_ADMIN_PASSWORD=change-me-before-first-launch
export ETD_INITIAL_GROUP=COMS   # optional; defaults to "COMS"

npm start
```

You can also copy `server/.env.example` to a file of your choice and export
its contents, or put the same keys directly in a launchd plist (see Section
4). There is no `.env`-file loader built into the server — these are plain
process environment variables.

Verify it's up:

```bash
curl localhost:8787/api/health
# {"ok":true}
```

## 3. Admin cookbook (curl)

All authenticated calls send `Authorization: Bearer $TOKEN`.

**Log in** (as the bootstrap admin, or any admin account):

```bash
TOKEN=$(curl -s localhost:8787/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.edu","password":"change-me-before-first-launch"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```

**Create an invite** for a group, and turn it into a link the recipient can
open in their browser:

```bash
curl -s localhost:8787/api/invites \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"groupId":1}'
# {"token":"<INVITE_TOKEN>","expiresInDays":14}
```

Build the link by URL-encoding your API host and appending it as `server=`:

```
https://<your-frontend-host>/?invite=<INVITE_TOKEN>&server=https%3A%2F%2Fyour-api-host
```

Opening that link in the editor pre-fills the invite token and API server,
so the recipient only has to pick a password to finish creating their
account.

**Create a group** (site admin only):

```bash
curl -s localhost:8787/api/groups \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"COMS-2026"}'
# {"id":2,"name":"COMS-2026"}
```

**Add a member to a group** (must already have an account — otherwise send
them an invite instead):

```bash
curl -s localhost:8787/api/groups/1/members \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"email":"colleague@example.edu","role":"member"}'
```

`role` is `"admin"` or `"member"`. Posting again for the same user changes
their role.

**Remove a member from a group:**

```bash
curl -s -X DELETE localhost:8787/api/groups/1/members/42 \
  -H "authorization: Bearer $TOKEN"
```

(`42` is the target user's numeric id, not their email.)

**Issue a password reset.** This does not email anything — it hands back a
token that you relay to the user out-of-band (email, chat, in person):

```bash
curl -s localhost:8787/api/password-resets \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"email":"colleague@example.edu"}'
# {"token":"<RESET_TOKEN>","expiresInHours":24}
```

The user then completes the reset themselves (no admin token needed for
this call — the reset token is the credential):

```bash
curl -s localhost:8787/api/auth/reset-password \
  -H 'content-type: application/json' \
  -d '{"token":"<RESET_TOKEN>","newPassword":"their-new-password"}'
```

The new password must be at least 8 characters. A successful reset also
signs the user out of any existing sessions.

## 4. COMS Mac setup

This assumes a shared Mac in the COMS lab that stays powered on and logged
in, running the server as a `launchd` daemon.

1. **FileVault**: confirm it is turned on (System Settings → Privacy &
   Security → FileVault). The SQLite file contains account credentials
   (hashed) and diagram content, so disk encryption at rest matters.
2. **Energy Saver / Lock Screen**: set the Mac to never sleep (System
   Settings → Energy Saver / Battery → Prevent automatic sleeping), so the
   daemon keeps running. Screen lock/password can still be on.
3. **Install Node ≥ 20** (via the official installer, `nvm`, or Homebrew).
   Confirm with `node --version`.
4. **Clone the repo** to a stable path, e.g. `/Users/coms/etd`, and run
   `cd /Users/coms/etd/server && npm install` once.
5. **Fill in the two plists** in `server/deploy/`:
   - `com.etd.server.plist` — replace every `/EDIT-ME/...` path:
     - the `node` binary path (`which node`)
     - `WorkingDirectory` → your `server` checkout
     - `ETD_DB_PATH` → where you want the SQLite file to live (outside the
       repo checkout is recommended, e.g. `/Users/coms/etd-data/etd.sqlite`)
     - the two log paths
   - `com.etd.backup.plist` — same treatment, plus set `ETD_BACKUP_DIR` to
     your OneDrive-synced backup folder (see Section 6).
   - The first time the server plist runs, its `EnvironmentVariables` block
     only carries `PORT`/`ETD_DB_PATH` — add `ETD_ADMIN_EMAIL` and
     `ETD_ADMIN_PASSWORD` to that same dict temporarily for the very first
     load (bootstrap only fires once, while the database is empty), then you
     may remove them from the plist afterward if you prefer not to leave a
     plaintext password sitting in `/Library/LaunchDaemons`.
6. **Install the daemons:**

   ```bash
   sudo cp server/deploy/com.etd.server.plist /Library/LaunchDaemons/
   sudo cp server/deploy/com.etd.backup.plist /Library/LaunchDaemons/
   sudo launchctl load /Library/LaunchDaemons/com.etd.server.plist
   sudo launchctl load /Library/LaunchDaemons/com.etd.backup.plist
   ```

   Use `sudo launchctl unload /Library/LaunchDaemons/com.etd.server.plist`
   to stop it (needed before restoring a backup — see Section 6).

7. **Logs** live wherever you pointed `StandardOutPath` /
   `StandardErrorPath` in each plist — by convention alongside the database,
   e.g. `/Users/coms/etd-data/server.log`, `server.err.log`, `backup.log`,
   `backup.err.log`. Tail them with `tail -f` while debugging.

## 5. Exposing it to the internet

The COMS Mac should **not** have any inbound port opened on the network or
router. Instead, use an outbound tunnel so the Mac initiates the
connection outward and the tunnel provider handles inbound traffic. Two
documented options:

- **Cloudflare Tunnel** — requires a domain managed on Cloudflare. You run
  `cloudflared` on the Mac and map a hostname (e.g. `etd-api.yourdomain.edu`)
  to `localhost:8787`. Docs:
  <https://developers.cloudflare.com/cloudflare-one/>
- **Tailscale Funnel** — no domain required; the Mac gets a stable hostname
  under `*.ts.net` and Funnel exposes `localhost:8787` on the public
  internet over that hostname. Docs: <https://tailscale.com/kb/>

Either way, point the frontend's server URL (Section 7) at whichever public
hostname you end up with, over HTTPS.

**Before going live, confirm with UGA IT that running a tunneled service on
an office/lab machine is permitted under university network policy.** This
is a policy question, not just a technical one — check before exposing
anything.

## 6. Backups

`server/deploy/backup.sh` runs a live SQLite `.backup` (safe to run against
a database that's actively being written to) into `$ETD_BACKUP_DIR`, named
`etd-YYYY-MM-DD.sqlite`, and prunes anything past the newest 30 snapshots.
The `com.etd.backup.plist` daemon runs it nightly at 3:00 AM via
`StartCalendarInterval`.

Point `ETD_BACKUP_DIR` at a folder that's synced by OneDrive under your
UGA-approved storage agreement, e.g.:

```
ETD_BACKUP_DIR=/EDIT-ME/path/to/OneDrive-synced-folder/etd-backups
# find your Mac's actual OneDrive folder under ~/Library/CloudStorage/ —
# the exact folder name depends on your organization's OneDrive tenant
```

so that offsite copies happen automatically without a separate upload step.

**To restore a snapshot:**

```bash
sudo launchctl unload /Library/LaunchDaemons/com.etd.server.plist   # stop the daemon
cp "$ETD_BACKUP_DIR/etd-2026-08-16.sqlite" "$ETD_DB_PATH"            # copy snapshot over the live db
sudo launchctl load /Library/LaunchDaemons/com.etd.server.plist     # start it again
```

Copying over `ETD_DB_PATH` while the server is stopped avoids restoring
onto a file that's mid-write.

## 7. Connecting the frontend

The editor frontend picks its default API server from the build-time
environment variable `VITE_ETD_API_URL` (falls back to
`http://localhost:8787` if unset). Set it when you build the frontend for
deployment, e.g.:

```bash
VITE_ETD_API_URL=https://etd-api.yourdomain.edu npm run build
```

Regardless of the build-time default, any user can override it at runtime
by opening the **Sign In** modal, clicking **Server settings…** to expand
it, and typing a different URL into the **Server** field — useful for
testing against a local server or a different group's deployment without
rebuilding.

**Data policy:** this system is for **de-identified data only**. Do not
store names, student IDs, or other identifying information in diagram
content, group names, or account display names beyond what's needed to
operate the account itself.
