# Live collaboration and continuous autosave

Date: 2026-10-12. Requested by Jennifer: "a google workspace-like system where it autosaves and multiple people can collaborate in real-time."

Supersedes two decisions in 2026-08-17-groupware-design.md: "Autosave stays local-only" and "no websockets."

## Scope

- Applies to signed-in users with a **library** diagram open on the canvas. Signed-out use, jenkleiman.com, and not-yet-saved diagrams keep the old local behavior (browser autosave plus file save).
- Everyone with the diagram open sees each other's edits within a fraction of a second.
- Work autosaves continuously. There is no "unsaved changes" state while connected.
- The canvas header shows who else is here. Each teammate's selection is outlined in their color, with their name. Outlines never appear in PNG, PDF, SVG, or thumbnails.

## Design

**Transport.** Server-Sent Events carry server→client events. Edits go client→server as plain POSTs. Both are ordinary HTTP on the existing port, so the campus 5900 bridge and any future proxy work unchanged. No new dependency. The stream is read with fetch because EventSource cannot send the Authorization header.

**Model.** The live document has the save-file shape. Edits are operations:
put (create/replace an item), patch (change some fields), del, order (stacking order), and set (name, styleConfig, transcript, version).
Merging is last-writer-wins per field of an element, connection, or note. One person moving a box while another edits its text keeps both changes. Two people typing in the same box: the edit the server receives last wins. A patch to an item someone deleted is ignored, so deletes never half-resurrect.

**Ordering.** The server applies batches in arrival order and echoes every batch to everyone. Each client sends one batch at a time. On an incoming teammate batch the client rebuilds its document as server state + its own unconfirmed batches + unsent edits, which is the order the server will apply them in (src/live/syncEngine.ts).

**Undo.** Teammates' edits are kept out of undo history, and existing undo snapshots are rebased onto them, so undo only reverts your own edits.

**Integrity.** After each batch the server deletes arrows whose ends no longer exist and broadcasts that as its own batch.

**Autosave and history.** The server writes the live document 2 s after edits stop, and at most 10 s after the first unsaved edit. Within a 10-minute window autosaves update one version row ("Autosaved" in History), so history stays readable. Save (⌘S) writes a new version immediately. The last person leaving and a server shutdown (SIGTERM) both save.

**Offline.** If the stream drops, the existing offline banner shows. The client reconnects with backoff (1, 2, 5, 10 s), receives the current document, and resends anything not confirmed.

**Version history.** Previewing a past version still works. Teammates' edits keep arriving in the background. "Back to current" returns to the live document. "Restore" makes the previewed content everyone's document and writes a version.

**Older open tabs.** A tab still running the pre-collaboration bundle saves with a full snapshot PUT. While a session is open, such a save gets the existing conflict dialog. A forced save replaces the live document for everyone.

## Schema

diagram_versions gains `auto` (1 for autosaves) and `saved_at` (last write). Additive migration in openDb. The versions API returns `auto` and reports `createdAt` as the last write time.

## Known limits

- Concurrent typing in the same text field is last-writer-wins, not character merging.
- Auto-generated labels such as "Info N" are numbered per tab, so two people adding info boxes at once can get the same number.
- The transcript syncs as one unit; two people changing transcript state at the same moment keep only the later change.
- One server process holds the rooms. That matches the single COMS Mac deployment.

## Verification (2026-10-12)

- Unit tests: ops, sync engine (concurrent edits, delete races, reconnect), SSE parser, undo rebasing. Server: op validation, dangling-arrow cleanup, and end-to-end stream tests (ordering, autosave coalescing, Save, presence, stale PUT, trash, last-leaver save).
- Browser, two users in two tabs against a local scratch server: a teammate's new box appeared live; presence avatars and selection outline showed; undo did not remove a teammate's box; Save wrote a new version; stopping the server showed the offline banner, and an edit made while down reached the other tab after restart.
