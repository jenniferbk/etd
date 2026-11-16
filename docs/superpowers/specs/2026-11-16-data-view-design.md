# Data View, Export All / Import, and the Shared Codebook: Design

**Date:** 2026-11-16
**Status:** Design, pending Jennifer's approval. My calls (not discussed with Jennifer) are marked ⚑.
**Reference files (same folder):** `2026-11-16-data-view/sample-3-episodes.xlsx` is the layout Jennifer approved, generated from three real diagrams. `2026-11-16-data-view/sample_generator.py` is the throwaway Python script that produced it, kept as an executable statement of the row and column rules. It is not production code.

## 1. Why

The research group has finished diagramming 17 argumentation episodes in ETD. Next they code every responsive move: first its type (Question or Other), then its kind, which determines its category. They also want ETD to work as a data library: one place to see, fix, sort, export, and re-import everything in the diagrams, with the diagrams as the only true copy.

Their previous dataset (`Teacher Support Analysis Combined.xlsx`, 2,487 rows) used Anna Conner's layout. Each argument component sits on a row with its responsive moves beside it, and when a component has several moves it gets a compact stack of rows. Anna likes that layout because it keeps a component and its moves together. Its problem was fragility: sorting broke it, and it had no link back to the source. This design keeps the layout and fixes the fragility.

**Terminology:** the group now says **"responsive moves"** instead of "support moves." Use "responsive move" in every UI label, export header, and message. The internal data model keeps `type: 'support'` / `SupportElement` so no saved diagram breaks. ⚑

## 2. Goals, non-goals, anti-goals

**Goals**
1. A **Data view** inside ETD that shows one diagram or the whole library in Anna's horizontal layout, with editable cells.
2. **Export all**: one .xlsx in that layout covering every diagram in the library.
3. **Import**: read that .xlsx back and write the codes and episode fields into the diagrams, after a preview.
4. A **shared codebook** for the whole library that can be revised during coding (add, rename, merge, retire) without breaking anything already coded.

**Non-goals (this round)**
- Bringing the old 2,487-row Combined sheet into ETD.
- Charts, statistics, or other "data intelligence." The data view should make these easy to add later.
- Creating or deleting diagram elements from the data view or from a spreadsheet. Structure changes happen on the canvas.
- Double coding or inter-rater columns. ⚑ Deferred; see §9.

**Anti-goals (count as failure even if everything technically works)**
- A sheet that breaks when someone sorts or filters it.
- Two copies of the truth that drift apart: an import that silently overwrites newer diagram edits, or codes that live only in Excel.
- Losing Anna's "component with its moves beside it" reading.
- Inferring facts the team didn't enter. Example: vetted status must never be guessed from file names, because the names were set casually.

## 3. The layout (approved)

One layout, used in three places: the in-app Data view, the exported workbook, and the import format. The sample workbook is the reference. If this section and the sample disagree, the sample wins on look and layout, and this section wins on content. The sample's one content shortcut, cleaning up the Episode title, is not part of the design.

### 3.1 Columns, in order

| Col | Group | Header | Source | Editable in app | Read on import |
|---|---|---|---|---|---|
| A | | # | original row order (lets users undo a sort) | no | no |
| B | Episode | Episode | the diagram title exactly as stored, with no suffixes stripped (the sample's cleanup of "vetted"/".ifinal" was a mock-up shortcut and is not part of the design) | yes (renames the diagram) ⚑ | no |
| C | Episode | Clip | episode field (§5) | yes | yes |
| D | Episode | Status | episode field, dropdown `vetted` / `not vetted`, blank by default | yes | yes |
| E | Episode | SG/WC | episode field, dropdown `SG` / `WC` | yes | yes |
| F | Episode | Discipline | episode field, free text ⚑ | yes | yes |
| G | Component | Part | argumentType → D, C, W, B, R | yes | no |
| H | Component | Contributor | given / student / teacher / joint / implicit | yes | no |
| **I** | Component | Content of component | element content | yes | no |
| J | Component | Who | attribution speaker (any "Student-" prefix dropped for display) | yes | no |
| K | Component | Time | attribution timestamp | yes | no |
| L | Component | Qualifier | content of qualifier(s) attached to an arrow into this component (§3.3) | no (edit on canvas) | no |
| M–Q | First pass (untyped) | Move, By, Type, Kind, Category | moves whose supportType is `action` | Move/By/Type/Kind yes | Type, Kind |
| R–U | Question | Question, By, Kind, Category | moves typed `question` | Question/By/Kind yes | Kind |
| V–Y | Other | Other, By, Kind, Category | moves typed `other` | Other/By/Kind yes | Kind |
| Z | | Links to | outgoing connections, e.g. `→ Claim 2`, `→ link Data 1→Claim 1` | no | no |
| AA | | Note | analytic notes anchored to this component, joined with ` \| ` | no (edit in Notes panel) | no |
| hidden | IDs | component_id, move_id_untyped, move_id_question, move_id_other, diagram_id, first_row_of_component, plus whatever import needs (§6) | | | |

- **Move cell text** = move content + ` (timestamp)` when a timestamp exists, as in Anna's sheet. **By** = the move's attribution speaker, falling back to its contributor (`teacher` / `student`). Student and teacher moves share the same columns. There are no separate student-move columns.
- **Category** is never stored or typed. It is looked up from Kind in the codebook. In Excel it is a formula against the Codebook tab.
- **Type** exists only in the untyped group: picking `Question` or `Other` retypes the move. In the app the move moves to its new column group right away. In Excel it moves on the next export.
- **Kind** dropdowns list only *active* codebook kinds for the move's type. In the untyped group, Kind depends on the chosen Type. In the app a move whose type is still `action` cannot get a Kind, which matches today's store rule that `action` never has a subtype.

### 3.2 Rows

- **One group per argument component.** The group has `max(#untyped, #question, #other, 1)` rows. Row *i* holds the *i*-th move of each type (each list sorted by timestamp). A component with no moves takes one row.
- **Every row is complete.** Component and episode cells repeat on every row of the group, so sorting or filtering never strands a move. On rows after the first, the repeated cells show in light gray and don't wrap, which keeps continuation rows one line tall. That is what makes the layout read as compact as Anna's.
- **Group and episode boundaries:** a thin gray rule above each component group and a dark rule above each new episode. In Excel these are conditional formats keyed on the hidden IDs, so they keep working after a sort.
- **Order within an episode:** `given` components first (by canvas y), then components by timestamp (the first time in a range like `75:07-75:58`), then by canvas y. ⚑ Episodes are ordered by title. ⚑
- **Unlinked moves** (no `associatedWith`, or pointing at a missing element) go in a final group per episode with Part `—` and Content `(not linked to a component)`, so they're easy to find and fix.
- **Info boxes** produce no rows.

### 3.3 Qualifiers

A qualifier with `attachedTo.connectionId` is not its own row. Its text goes in the Qualifier cell of the component its arrow points to (`connection.to`). That matches the old sheet's Qualifier column. Moves associated with a folded qualifier are listed with that component. A qualifier with no attachment (legacy or orphaned) gets its own row with Part `Q`.

## 4. The Data view in ETD

- **Where:** a **Diagram | Data** toggle in the canvas header shows the current diagram. The library (Workspace) gets a **Data** entry that shows every diagram in the group, with an optional folder filter. Trashed diagrams are excluded.
- **Same grid as the export** (§3), with sticky header rows, the same column groups and colors, and column widths the user can change.
- **Editing:** cells marked editable in §3.1 are edited in place. Type and Kind are dropdowns from the codebook. Edits are saved as normal diagram edits: they appear on the canvas, in live sessions, and in version history the same way canvas edits do. A user editing a diagram from the library Data view while a teammate has it open live must not cause lost edits on either side.
- **Sorting and filtering keep groups intact.** Sorting orders whole component groups, never splitting one. Filters show a whole group when any row in it matches. Built-in filters: "has an untyped move," "Kind = …," "Category = …," "Status = …," "unlinked moves." ⚑
- **Row → canvas:** clicking a row's component or move opens that diagram (if needed) and selects that element.
- **Size:** the library is about 17 diagrams × ~25–50 rows, so under ~1,000 rows. It should scroll smoothly at that size and stay usable at a few thousand.

## 5. Episode fields

New optional top-level object on the diagram, saved and versioned with it:

```ts
episode?: {
  status?: 'vetted' | 'not vetted';
  sgwc?: 'SG' | 'WC';
  discipline?: string;
  clip?: string;            // e.g. "74:09-76:12"
}
```

- Additive schema change; bump `SAVE_SCHEMA_VERSION`. Old files load with no episode fields.
- **Status is never inferred.** It starts blank.
- **Clip:** if blank, the Data view shows the bracketed time range from the diagram's info box (`[74:09-76:12]`), in gray, as a suggestion. It becomes a stored value only when someone confirms or edits it. ⚑
- The old sheet's T/CALC and Integrated columns are not included this round. They're easy to add as more episode fields later. ⚑

## 6. Export all and Import

### 6.1 Export all

- Available from the library Data view (all diagrams, or the current folder filter). The folder filter is how the team limits the dataset to the 17 episodes if the library also holds drafts or duplicate copies. No separate "include in dataset" flag is added this round. ⚑ and from a single diagram's Data view (that diagram only).
- Produces one workbook: a **Data** sheet (§3) and a **Codebook** sheet (Kind, Category, Type, Status: active/retired). It also holds whatever hidden metadata import needs: at least the export time, and for each diagram the version that was exported plus each exported cell's original value, so import can tell what the coder changed.
- Excel features required (verified in the sample): frozen header rows, autofilter, hidden ID columns, list dropdowns from defined names (`QuestionKinds`, `OtherKinds`, `CodebookTable`), a Kind dropdown that depends on Type (`INDIRECT(type&"Kinds")`), a Category formula via `VLOOKUP`, and expression-based conditional formats for the gray repeats and group/episode rules. The library must write all of these. Generating client-side or server-side is the builder's call.
- File name: `ETD data – <group name> – <YYYY-MM-DD>.xlsx`. ⚑

### 6.2 Import

- Accepts a workbook produced by Export all (identified by its hidden metadata). Anything else is rejected with a plain message.
- **Only these cells are read:** Clip, Status, SG/WC, Discipline, and each move's Type (untyped group) and Kind. Text, Who, Time, Part, and the rest are display-only in Excel. Text corrections happen in the app.
- Rows are matched by hidden IDs, not by position, so a sorted or filtered sheet imports correctly.
- **Only changed cells are written.** A cell counts as changed if it differs from the value recorded at export time.
- **Conflicts:** if the diagram changed that same field after the export, the cell is flagged and the default is to keep the diagram's value. The user can choose the sheet's value per conflict or for all conflicts.
- **Preview before writing:** for example, "31 moves recoded in 6 diagrams · 4 episode fields · 2 conflicts · 3 skipped." Skipped cells are listed with a reason: the move was deleted since export, the kind is not in the codebook, a Kind was given for a move still typed Action, the sheet has a row with no IDs (added in Excel), and so on.
- **Writing:** applied as one labeled version per affected diagram, e.g. "Import from ETD data – 2026-11-16.xlsx," so it can be reviewed and restored through History. Open live sessions see the change.
- Retyping via Type in the untyped group: Type `Question`/`Other` sets the move's supportType. If Kind is filled in on the same row, it is applied too.

## 7. Shared codebook

- **One codebook per group (library)**, stored on the server and used by every diagram in that group, the Data view, the export dropdowns, and the canvas Properties panel.
- **Shape:** kinds, each with a stable `id`, `label`, `category`, `type` (`question` / `other`), and `status` (`active` / `retired`, plus `mergedInto: id` when merged). Categories are labels attached to kinds; there is no separate category list to keep in sync.
- **Moves store the kind's id** in the existing `subtype` field, never its label. So:
  - **Rename** changes only the codebook; every coded move shows the new label.
  - **Merge A into B** marks A as `mergedInto: B`; every move coded A now reads as B everywhere. Rewriting the stored ids in diagrams is optional cleanup, not required for correctness.
  - **Retire** hides a kind from the dropdowns. Moves already coded with it keep it and show it as retired.
  - **Change a kind's category or type:** allowed. Its moves follow. A type change that leaves some moves with a kind that doesn't match their type flags them in the Data view; it doesn't silently retype them.
- **Change log:** every codebook change records who, when, and what (old → new), and can be viewed in the codebook editor. This is the paper trail for scheme revisions made partway through coding.
- **Who can edit:** any group member. ⚑
- **Which groups get which codebook:** ⚑ every group gets its own codebook, created on first use from the subtypes already in that group's diagrams (for most groups, today's six defaults). Other groups' dropdowns do not change. The 34-kind research seed is applied only to the research group, as a one-time seed step run by the developer or a site admin. A "copy codebook from another group" action is out of scope for this round.
- **Signed-out / local-file mode:** ⚑ the Data view, Export all, Import, and the codebook editor are library features. They are hidden when signed out, and local files keep using `styleConfig.subtypes` exactly as today. When a library diagram is downloaded as a JSON file, the codebook kinds it uses are written into that file's `styleConfig.subtypes` (id, label, plus category and type) so the file stays readable outside the library. A local file added to a library merges its subtypes into that group's codebook by the same rule as the first-load migration.
- **Seed:** the 34 kinds / 10 categories from the VLOOKUP tab of the old Combined sheet (see the Codebook tab of the sample workbook). Kinds whose category starts with "Requesting" are type `question`; the rest are type `other`. Existing ids already used in diagrams (`displays`, `suggests`, `summarizes`, `restates`, `highlights`, `validates`) are kept as the ids for the matching seeded kinds, so the 8 moves already coded keep their codes. ⚑
- **Relation to per-diagram `styleConfig.subtypes`:** the codebook replaces it as the source of the kind list. Per-kind visual styles (e.g. Displays drawn as an ellipse) stay in styleConfig, keyed by kind id. Diagrams whose styleConfig lists subtypes not in the codebook get those added to the codebook as active kinds with category `[uncategorized]` on first load, not dropped. ⚑ The exact migration is the builder's call within these rules.
- **Editor:** a Codebook page or panel reachable from the library and from the Data view. It lists kinds grouped by type and category, with add / rename / change category / merge / retire, and the change log.

## 8. Approaches considered

| Approach | Trade-off | Outcome |
|---|---|---|
| **A. Script only:** a script turns diagram JSON into the workbook; coding happens in Excel | Fastest; codes never return to the diagrams, so two diverging copies | Rejected |
| **B. Round trip with ETD as the true copy:** in-app Data view + Export all + Import | Most work; diagrams stay the single source, and people can code in the app or in Excel | **Chosen by Jennifer** |
| C. Live-synced Google Sheet | Extra logins and setup, two systems to keep in sync | Dropped |

Layout alternatives, settled with Jennifer:
- Separate tabs for components and moves (tidy tables). Rejected: it splits a component from its moves, which is the thing Anna's layout exists to keep together.
- Long format, one row per move. Superseded by the horizontal layout with complete gray-repeat rows, which reads like Anna's and still sorts safely.
- Separate student-move columns. Rejected: each move has its own By column, so student and teacher moves share columns.

## 9. Left to the builder, and deferred

**Builder's call:** grid component and library; xlsx library (it must support the features in §6.1); where export/import runs; how Data view edits reach open live sessions (must not lose edits); server storage for the codebook and its log; migration details within §7; UI placement details within §4.

**Deferred (not this round):** double coding / inter-rater columns; charts and summary statistics; T/CALC and Integrated episode fields; importing the old Combined sheet; creating elements from the data view.
