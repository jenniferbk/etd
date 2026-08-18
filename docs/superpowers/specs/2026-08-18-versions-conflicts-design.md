# Version History & Conflict Protection (Groupware sub-project C) — Design

**Date:** 2026-08-18
**Status:** Approved direction (original groupware spec Phase 2, reframed for the Workspace UX); autonomous decisions flagged ⚑ for Jennifer's review.
**Context:** Third UX sub-project (A: Workspace — merged; B: People — merged; C: this). The server has stored every save as a gzipped version row since Phase 1; this surfaces them and stops silent overwrites.

## What a researcher can do after this ships

1. **See a diagram's history:** a `History` button in the canvas header opens a right-side panel listing every saved version — who saved it, when ("2 days ago").
2. **Look at an old version safely:** click a version → the canvas shows it read-only under a banner: `Viewing the version from <date> — Restore / Back to current`. No way to accidentally edit the past.
3. **Restore:** one click makes that old version the newest save. Nothing is ever deleted — the version you replaced stays in history (restore = a new version whose content is the old one).
4. **Never silently overwrite a teammate:** if someone else saved while you were editing, your save is stopped with a clear choice — **Overwrite** (your version becomes newest; theirs stays in history), **Save as a copy** (a new diagram `<title> (copy)` in the library; the original is untouched), or **Cancel** (keep editing; nothing sent).

## Server additions (additive; existing endpoints keep passing tests)

| Change | Notes |
|---|---|
| `GET /api/diagrams/:id/versions` (member) → `[{id, author, createdAt, isCurrent}]`, newest first | `author` = display name. ⚑ nested under the diagram (original spec sketched `/versions/:id`) so the existing `getDiagramForMember` permission check is reused verbatim. |
| `GET /api/diagrams/:id/versions/:versionId` (member) → `{id, author, createdAt, snapshot}` | 404 if the version doesn't belong to that diagram. |
| `PUT /api/diagrams/:id` accepts optional `baseVersionId` | If present and ≠ `current_version_id` → **409** `{error: 'someone else saved this diagram while you were editing', currentVersionId}`. ⚑ optional (not required) so any stale client simply keeps last-write-wins instead of breaking. The updated frontend always sends it. |
| ⚑ **No version labels in v1.** | The one-click save UX has no label prompt; versions are identified by author + time. The `label` column stays in the schema for later. |

## Frontend

- **Base-version tracking:** cloudStore gains `baseVersionId: number | null`, set from `currentVersionId` on open (GET), create (POST), and every successful save (PUT response). `saveToLibrary` sends it on PUT.
- **Conflict dialog** (on PUT 409): title `Someone else saved this diagram`; body `While you were editing, a teammate saved a newer version. Your unsaved changes are still here — choose what to do.`; buttons **Overwrite** (PUT again without `baseVersionId`; then adopt the returned version id) / **Save as a copy** (POST a new diagram titled `<title> (copy)`, link the canvas to it) / **Cancel** (close; status stays `dirty`). ⚑ Deviation from the original spec's third option ("cancel and *view theirs*"): plain Cancel preserves the user's unsaved work — viewing the teammate's version is available anytime via History, and auto-loading theirs would destroy unsaved edits. Safety wins.
- **History panel:** `History` button in the canvas header (near File ▾) → right-side panel (like the transcript panel's placement conventions) listing versions: author, relative time, `Current` tag on the head. Refetch on open.
- **Version preview (read-only):** clicking a version loads its snapshot into the canvas in **preview mode**: a prominent banner `Viewing the version from <date> — Restore / Back to current`, canvas interactions blocked (⚑ implementation: `pointer-events: none` on the stage container + the existing keyboard-shortcut guard extended to preview mode — not a Konva-level read-only rewrite), palette/properties/File/save disabled. `Back to current` reloads the current server version; `Restore` PUTs the previewed snapshot as a new save (with `baseVersionId` = current, so conflicts are caught even here) and exits preview with toast `Restored — the previous version is still in history.`
- **Unsaved-work guard:** opening a preview with unsaved changes (status `dirty`/`offline`, or `notInLibrary` with content) prompts save-first, reusing the leave-confirm pattern — preview never destroys unsaved work.
- **Dirty tracking** is suspended during preview (preview loads must not mark the diagram dirty; exiting preview restores correct status).

## Also in scope (parked items from A/B finals — small cleanups bundled here)

- `saveToLibrary` success/404 handlers re-check context (same `diagramId`, user still present) before mutating status or opening dialogs (A-parked: sign-out-mid-PUT staleness).
- Leave-dialog closes itself when the 404 recovery opens the Add-to-library dialog (A-parked stacking).
- `AddToLibraryDialog` guards the no-groups edge (disabled state instead of a doomed POST with groupId 0).
- B crumbs: drop the dead `isLoading` from row-menu actions; add the missing `disabled` flag to the reset menu item; re-indent Workspace's tab ternary.

## Out of scope

Element-level diffs between versions, comments (original Phase 3), autosave-to-cloud, label UI, multi-tab session isolation.

## Testing

Server: vitest for both endpoints (membership, cross-diagram 404, ordering, isCurrent) and the 409 path (stale base → 409 with currentVersionId; no base → last-write-wins preserved; matching base → save). Frontend: cloudStore baseVersionId transitions; saveToLibrary 409 → conflict state; preview-mode status machine. Playwright walkthrough: two-account conflict (A opens, B saves, A saves → dialog; all three choices), history browse/preview/restore, unsaved-work guard. Walkthrough uses ports 8790/5180 (Jennifer may be using 8787/5173 locally).
