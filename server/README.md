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

Only a site admin can issue a reset for another site admin; a group admin
can only issue resets for non-site-admin members of a group they admin. This
is also the recovery invariant for the whole system: because site admins can
manage any group's membership, the bootstrap site-admin account is always
the recovery path if a group ever loses all of its own admins.

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
     your OneDrive-synced backup folder (see Section 7).
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
   to stop it (needed before restoring a backup — see Section 7).

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

Either way, point the frontend's server URL (Section 8) at whichever public
hostname you end up with, over HTTPS.

**Before going live, confirm with UGA IT that running a tunneled service on
an office/lab machine is permitted under university network policy.** This
is a policy question, not just a technical one — check before exposing
anything.

The server trusts exactly one proxy hop (`trust proxy: 1`), which matches
either tunnel putting one local daemon in front of it — on deployment day,
verify `X-Forwarded-For` is being set correctly by the tunnel (e.g. check
that per-user rate limiting isn't bucketing the whole team behind one IP).

## 6. Campus-network / VPN deployment (no admin required)

Everything in Sections 4–5 assumes you can get `sudo` on the Mac (to install
a LaunchDaemon in `/Library/LaunchDaemons/` and to turn on FileVault). If
that's not available — you don't have the admin password for the machine —
but your team can already reach it over the campus network or the UGA VPN,
this section covers a variant that needs no admin access anywhere in the
setup, at the cost of a few trade-offs spelled out in Section 6.6.

### 6.1 When to use it

Use this path when both of the following are true:

- You cannot get an admin password on the Mac (so no LaunchDaemon in
  `/Library/LaunchDaemons/`, no toggling FileVault, no `sudo` anything).
- The people who need access already reach this Mac over the campus network,
  or over the UGA VPN when off campus — i.e. everyone connects to
  `<campus-ip>` (a placeholder — substitute the Mac's actual campus-network
  IP or hostname; never hard-code a real one into shared docs or scripts).

If you *can* get admin access, prefer Sections 4–5 instead — a LaunchDaemon
survives logout, and a real tunnel (Cloudflare/Tailscale, Section 5) avoids
the plain-HTTP trade-off below.

### 6.2 Build the frontend for same-origin

At the repo root (not `server/`), build the frontend **without** setting
`VITE_ETD_API_URL`:

```bash
npm run build
```

With that variable unset, a production build defaults its API server to
`window.location.origin` — the address the page itself was loaded from —
so the same build works no matter what IP or hostname you end up serving it
from, and no `?server=` param is needed on invite links (Section 6.7). This
is the same-origin behavior added by the ETD server's `ETD_STATIC_DIR` option
(Section 2, `server/.env.example`); see `src/api/client.ts` for the default
logic.

The build output lands in `dist/` at the repo root. Point `ETD_STATIC_DIR`
(in the LaunchAgent plist below, or in your own `.env`) at that `dist/`
path — the server will serve it as static files with SPA fallback, alongside
its own `/api/*` routes, so one process on one port serves both the app and
the API.

### 6.3 LaunchAgent install

`server/deploy/com.etd.server.agent.plist` is the same shape as
`com.etd.server.plist` (Section 4), plus `ETD_STATIC_DIR`, and it installs
to `~/Library/LaunchAgents/` — a per-user directory that needs no admin
password. The trade-off is that a LaunchAgent only runs while that user is
logged into a graphical session (see Section 6.6).

1. Fill in every `/EDIT-ME/...` path in
   `server/deploy/com.etd.server.agent.plist`, same as Section 4 Step 5:
   the `node` binary, `WorkingDirectory`, `ETD_DB_PATH`, `ETD_STATIC_DIR`
   (the `dist/` path from Section 6.2), and the two log paths. Add
   `ETD_ADMIN_EMAIL` / `ETD_ADMIN_PASSWORD` temporarily for the very first
   load, exactly as in Section 4.
2. Copy and load it — no `sudo`:

   ```bash
   cp server/deploy/com.etd.server.agent.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.etd.server.agent.plist
   ```

   Use `launchctl unload ~/Library/LaunchAgents/com.etd.server.agent.plist`
   to stop it.
3. The backup daemon (`com.etd.backup.plist`, Section 7) follows the same
   pattern at user level — fill in its `/EDIT-ME/...` paths, then:

   ```bash
   cp server/deploy/com.etd.backup.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.etd.backup.plist
   ```

### 6.4 Automatic updates from GitHub

The `com.etd.update` daemon pulls `origin/main` every 15 minutes, rebuilds the
frontend and server if anything changed, restarts the server LaunchAgent, and
rolls back to the previous commit if the health check fails — all unattended.

**What happens:** A successful pull-and-rebuild takes a few seconds; during
that window the server restarts. If users are already signed in when the restart
happens, the frontend's reconnect logic catches the brief outage and resumes on
retry. An in-flight save that straddles the restart will appear to lose contact,
then reconnect and succeed; this is the same behavior as a network hiccup.

**Install steps:**

1. Fill in every `/EDIT-ME/...` path in `server/deploy/com.etd.update.plist`:
   - the script path
   - the `PATH` environment variable: the directory containing `node` binary
     (usually something like `~/.nvm/versions/node/vXX/bin` if using nvm; use
     `which node` to find the binary, then use its directory)
   - the two log paths (by convention alongside the server and backup logs,
     e.g. `/Users/coms/etd-data/update.log`, `update.err.log`)
2. In `server/deploy/update.sh`, verify that `PORT=8787` matches the `PORT`
   in the `com.etd.server.agent.plist` (or your `.env`) — they must be the
   same.
3. Make the script executable:

   ```bash
   chmod +x server/deploy/update.sh
   ```

4. Copy and load the plist — no `sudo`:

   ```bash
   cp server/deploy/com.etd.update.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.etd.update.plist
   ```

   Use `launchctl unload ~/Library/LaunchAgents/com.etd.update.plist`
   to stop it.

**Adjusting the update schedule:** By default, updates check every 15 minutes
(StartInterval 900). If you prefer to avoid mid-day restarts, change the plist
to use `StartCalendarInterval` instead — e.g. a 2:00 AM nightly update:

```xml
<key>StartCalendarInterval</key>
<dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
```

Then reload: `launchctl unload` and `launchctl load` again.

**Logs:** Both `update.log` and `update.err.log` (wherever you pointed the plist)
contain timestamps and messages like `updating <hash> -> <hash>` on success,
or `update FAILED — rolling back to <hash>` if a rebuild failed. Tail them
while testing:

```bash
tail -f /EDIT-ME/path/to/etd-data/update.log
```

**Trust and dependency scripts:** The update loop runs `npm install` with no
human supervision, which means it executes any install scripts in the
`package.json` of this repo and its dependencies. Pin dependency versions and
use the usual care you would for any `npm install` in a production environment.
This repo's own `package.json` has no install scripts; the risk is in its
dependencies, so keep them up to date (or vendor them if you run an older
snapshot). A failed install blocks the update but does not halt the server —
the next interval's pull will retry.

### 6.5 Keeping the Mac awake without admin

Preventing sleep normally goes through System Settings, which can be
locked down by MDM on machines you don't administer. `caffeinate(8)` is a
user-level command-line tool that needs no admin rights, so a LaunchAgent
that runs it at login keeps the Mac awake for as long as that user stays
logged in:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.etd.caffeinate</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-dims</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

Save that as, e.g., `~/Library/LaunchAgents/com.etd.caffeinate.plist`, then
`launchctl load` it the same way as above. `-dims` prevents display sleep,
system idle sleep, and disk idle sleep, and holds while on AC power (see
`man caffeinate`) — it does not require the utility it wraps to keep
running, since `caffeinate` itself is the long-running process here.

### 6.6 Trade-offs, stated plainly

This path trades some robustness for not needing an admin password:

- **Downtime after a reboot.** A LaunchAgent (unlike a LaunchDaemon) does
  not start until a user logs into a graphical session. If the Mac
  restarts (power outage, macOS update), the server — and the caffeinate
  agent keeping it awake — stay down until someone physically logs into
  that account.
- **No FileVault.** Turning on FileVault requires admin rights. The SQLite
  database (account credentials, hashed, plus diagram content) is
  therefore not encrypted at rest on this machine under this setup.
- **Plain HTTP on campus.** The server is not fronted by a tunnel or TLS
  certificate here, so traffic between a user's browser and `<campus-ip>`
  travels as plain HTTP while on the campus network itself. The leg
  between an off-campus user and the campus network is encrypted by the
  UGA VPN tunnel, but the on-campus hop is not separately encrypted.

Given those gaps, the **de-identified-data-only policy** (Section 8) is the
primary safeguard here, not disk encryption or transport encryption — don't
store names, student IDs, or other identifying information in this
deployment regardless of which trade-offs apply. If admin access becomes
available later, or a tunnel (Section 5) is set up, upgrading from this
plain-HTTP campus setup needs **no code changes** — the server and frontend
already support HTTPS via a fronting tunnel/proxy; it's purely a
deployment/config change (LaunchDaemon instead of LaunchAgent, tunnel
hostname instead of `<campus-ip>`, rebuild if you want a different
`VITE_ETD_API_URL`).

### 6.7 Team usage

Team members visit:

```
http://<campus-ip>:<port>/
```

turning the VPN on first if they're off campus. Invite links (created the
same way as Section 3) are:

```
http://<campus-ip>:<port>/?invite=<INVITE_TOKEN>
```

No `server=` param is needed — the same-origin default from Section 6.2
means the page already points at the host it was loaded from.

### 6.8 jenkleiman.com stays separate

The public editor at jenkleiman.com continues to serve the local-files-only
version of the tool — diagrams saved to disk, no groupware. Its cloud
sign-in cannot be pointed at a plain-HTTP campus server: browsers block
"mixed content" (an HTTPS page making requests to a plain HTTP endpoint),
and jenkleiman.com is served over HTTPS. For groupware/cloud features
against this campus deployment, use the campus URL directly (Section 6.7),
not jenkleiman.com.

## 7. Backups

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

## 8. Connecting the frontend

The editor frontend picks its default API server from the build-time
environment variable `VITE_ETD_API_URL`. If you set it, that value wins;
if you leave it unset, a production build defaults to `window.location.origin`
(same-origin — see Section 6.2) and a dev build falls back to
`http://localhost:8787`. Set `VITE_ETD_API_URL` explicitly when the frontend
is served from somewhere other than the API server itself, e.g.:

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
