# Counterclaim Connector + Analytic Notes — Design

**Date:** 2026-09-21
**Status:** Design, pending Jennifer's approval. Autonomous decisions flagged ⚑ for review.
**Context:** Two team requests relayed by Jennifer on 2026-09-21. Counterclaim is a bounded change to the existing connection pipeline. Analytic notes replaces the groupware spec's "Phase 3: comments" (a server-side discussion thread) with notes that live inside the diagram file — chosen in conversation on 2026-09-21 so notes work offline, travel with local `.json` files, and are versioned with every library save.

## 1. What a researcher can do after this ships

1. **Mark a link as a counterclaim.** Connect two claims as usual, then flip the connection to *Counterclaim*. It renders as a plain line with a slash (`/`) at its midpoint and no arrowhead, on canvas and in every export. The legend explains the mark.
2. **Write analytic notes.** Open the Notes panel (toolbar button or `N`), write a note about the diagram as a whole or about the selected element or connection. Notes save with the diagram (local file, autosave, library versions) and never appear in exported figures. Items with notes carry a small badge on canvas.

## 2. Counterclaim connector

### 2.1 Schema

- `ConnectionType` becomes `'support' | 'counterclaim'`. Every existing connection is `'support'`; no migration.
- `SAVE_SCHEMA_VERSION` → `1.7` (additive; bumped for observability, shared with notes below).

### 2.2 Creation

- ⚑ **No new palette mode.** Draw the connection with Connect Mode exactly as today, then flip its type:
  - **Properties panel:** when a connection is selected, a *Support | Counterclaim* segmented toggle sits beside the existing routing status/reset control.
  - **Context menu:** right-click a line → *Mark as counterclaim* / *Mark as support*.
- New store action `setConnectionType(id, type)`. Connections are already in the undo history, so the flip is undoable.
- ⚑ **Not restricted to claim↔claim.** The editor enforces no connection rules anywhere today (REQUIREMENTS §3.2 is guidance, not validation); a counterclaim against a Dataclaim or a rebuttal is plausible in analysis. Rendering is identical regardless of endpoints.

### 2.3 Rendering

- **Canvas** (`Arrow.tsx`): routing, waypoints, edge anchors, drag handles and snapping are unchanged. Differences for `counterclaim`:
  - No arrowhead.
  - A **slash**: a 16 px line centred on the polyline midpoint (`t = 0.5`), rotated 60° from the segment it sits on — reads as `/` on a horizontal run and as a leaning tick on a vertical run. Stroke colour and width follow the line (black; blue when selected; coral on hover).
- Slash geometry lives in one pure helper, `counterclaimSlash(points): [x1,y1,x2,y2]` in `utils/connectionPath.ts`, used by canvas and SVG export so both agree.
- ⚑ **Counterclaim targeting a connection** (arrow attachment) is allowed: renders as today's attachment (vertical line, no arrowhead) plus the slash.
- **SVG export:** `<polyline>` without `marker-end`, plus one `<line>` for the slash.
- **PNG / PDF:** automatic (stage snapshot).
- ⚑ **DiagramMix `.diagramx`:** exported as a connector without an end arrowhead; the slash has no equivalent and is dropped with a warning toast, matching the existing image/qualifier warnings.
- **Legend:** when at least one counterclaim exists, a new row *Counterclaim* with a line-and-slash swatch. (The legend is canvas/PNG only today; SVG export has no legend — unchanged.)

### 2.4 Semantics

- `claimRoleDerivation` **ignores counterclaim connections**: `Claim 1 –/– Claim 2` does not relabel Claim 1 as *Dataclaim 1*.
- Image-to-JSON import (`importedDiagramSchema`) accepts both types.
- ⚑ Qualifiers may be dropped onto a counterclaim line (no special handling; nothing prevents it today for any line).

## 3. Analytic notes

### 3.1 Data model (inside the diagram file)

```ts
export interface AnalyticNote {
  id: string;
  text: string;
  author?: string;      // signed-in display name at creation; omitted when signed out
  createdAt: string;    // ISO 8601
  updatedAt?: string;   // set on edit
  anchor?: { kind: 'element' | 'connection'; id: string };  // absent → general note
}
```

- `notes: AnalyticNote[]` in `diagramStore`. Written as a `notes` field by `buildDiagramFile` (local `.json`), by autosave, and therefore inside every cloud version snapshot. Files without `notes` load as `[]`.
- `SavedDiagramFile.notes?: unknown[]` on the API types so cloud open/preview pass it through.
- **Server: no changes.** Notes ride inside snapshots. ⚑ The unused `comments` table is left in place (harmless; a future discussion-thread feature could still use it).

### 3.2 Lifecycle

- **Deleting an anchored item does not delete its notes.** Anchors are resolved at render time; a note whose target is gone shows *Detached — item deleted* and stays editable/deletable. Undoing the element delete re-attaches it automatically. ⚑ Cascade-delete would destroy analytic work silently.
- Duplicating elements does **not** copy notes. *Clear diagram* clears notes. Loading a file or version replaces notes.
- ⚑ Notes are **not** in undo/redo (same as transcript). Deleting a note asks for confirmation (`confirmAsync`).
- Any note change marks the diagram **dirty** (library status + leave guard), like element edits (`dirtyTracking` gains `notes`).
- **Version preview:** the panel is rendered inside the existing inert wrapper, so it is read-only while viewing a past version and shows that version's notes.

### 3.3 UI

- **Notes panel:** right-side panel (`w-72`, same conventions as History/Transcript), placed between the canvas and the transcript panel/strip. Toggled by a *Notes* button in the toolbar **View** group (`StickyNote` icon, active state while open), by the `N` key (free today), and by clicking a canvas badge. Open/closed state lives in `diagramStore` as UI state (`notesPanelOpen`), alongside `zoom`, `selectedIds`, `legendConfig`.
- **Composer** (top of panel): textarea (*Add an analytic note…*); an anchor row that reads *Attach to Claim 2* (on by default, click to switch to *General*) when exactly one element or connection is selected, otherwise *General note*; an *Add note* button (also `⌘/Ctrl+Enter`).
- **List:** when the selection has notes, a section *On Claim 2* comes first; then *All notes*, newest first. Each row: anchor chip (click → selects that item on canvas), author, relative time (+ *edited*), body with preserved line breaks; hover reveals *Edit* (inline textarea; Save / Cancel / `Esc`) and *Delete*.
- **Anchor labels** (`utils/noteAnchors.ts`): argument → its label with the live role derivation ("Dataclaim 1"); support → type + first ~24 characters of content; info box → its label; connection → `Data 1 → Claim 2` (`–/–` for counterclaim, `→ line` for attachments).
- **Canvas badge:** items with ≥1 note show a 12 px note glyph (count shown when >1) at the element's top-right corner, rendered inside the shape's Konva `Group` so it follows drags; connections show it just above the midpoint. Badges carry the Konva name `note-badge`. ⚑ PNG and PDF export hide them around the stage snapshot (`stage.find('.note-badge')` → hide → export → restore); SVG export never emits them.
- **Empty state:** *No notes yet. Notes save with the diagram and never appear in exports.*
- ⚑ **Author:** `useAuthStore.user.displayName` when signed in; otherwise omitted (row shows only the time). No free-text author field.

### 3.4 Out of scope

Search/filter inside the panel, exporting notes to text/Markdown, re-anchoring a detached note, threaded replies, server-side comment routes, notes on legend or transcript lines.

## 4. Files touched

**Counterclaim:** `types/connections.ts` · `store/diagramStore.ts` (`setConnectionType`) · `utils/connectionPath.ts` (`counterclaimSlash`) · `Canvas/shapes/Arrow.tsx` · `utils/svgExport.ts` · `utils/diagramxExport.ts` + `Toolbar.tsx` warning · `utils/claimRoleDerivation.ts` · `utils/importedDiagramSchema.ts` · `Properties/PropertiesPanel.tsx` · `Canvas/ContextMenu.tsx` + `Canvas.tsx` wiring · `Canvas/shapes/Legend.tsx` · `utils/schema.ts` (1.7).

**Notes:** new `types/notes.ts` (+ `types/index.ts`) · `store/diagramStore.ts` (notes state/actions, `loadDiagram` 6th arg, `clearDiagram`, `notesPanelOpen`) · `utils/saveDiagram.ts` · `api/types.ts` · `hooks/useAutoSave.ts` · `hooks/dirtyTracking.ts` · `App.tsx` (recovery + file load pass notes; mount panel; `N` shortcut) · `Toolbar.tsx` (Notes toggle; hide badges for PNG) · `utils/pdfExport.ts` (hide badges) · `Workspace.tsx` + `HistoryPanel.tsx` (pass `snap.notes`) · new `components/Notes/{NotesPanel,NoteComposer,NoteRow}.tsx` · new `utils/noteAnchors.ts` · `Canvas.tsx` + shapes (`ArgumentShape`, `SupportShape`, `TeacherSupportShape`, `InfoBoxShape`, `Arrow`) for badges.

## 5. Testing

- **Unit (vitest, Node):** `setConnectionType`; `claimRoleDerivation` ignores counterclaim; `counterclaimSlash` geometry on horizontal and vertical runs; new `svgExport.test.ts` — counterclaim emits a slash `<line>` and no `marker-end`, support unchanged; `importedDiagramSchema` accepts both types; notes store actions (add / update / remove / clear / load default `[]`); `buildDiagramFile` includes `notes`; `dirtyTracking` flips on a notes change; autosave round-trips notes; `noteAnchors` resolve / describe / detached.
- **Browser walkthrough (Playwright):** flip a connection via panel and context menu, undo/redo; PNG and SVG show the slash; legend row appears/disappears; add a general and an attached note; badge appears and is absent in the PNG; note detaches on element delete and re-attaches on undo; notes survive local save → reload and library save → reopen; panel inert during version preview.

## 6. Acceptance criteria

1. A support connection can be switched to counterclaim and back from the properties panel and the context menu; the change is undoable and persists through save/load.
2. A counterclaim renders with no arrowhead and a midpoint slash on canvas, in SVG, PNG and PDF; the legend shows a *Counterclaim* row when one exists.
3. A claim linked to another claim by a counterclaim keeps its plain *Claim N* label.
4. Notes can be added, edited and deleted; anchored notes select their item on click; deleting the item detaches (not deletes) the note.
5. Notes persist through local save/load, autosave recovery, and library save/reopen; exported PNG/SVG/PDF contain no notes or badges.
6. Verification recipe passes: `npm run lint` (no new problems vs. baseline), `npx tsc -b`, `npm test`, `npm run build`.
