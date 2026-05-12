# Image-to-JSON import (hand-drawn ETD)

**Date:** 2026-05-11
**Status:** Design approved, ready for implementation plan
**Origin:** Item 3 in `docs/superpowers/specs/2026-04-27-anna-feedback-followup.md` (and the Anna feedback memory). Anna wants to import photos of her hand-drawn ETD diagrams directly into the editor, rather than running them through Gemini manually outside the app. Jennifer's previous session converted IMG_3630 and IMG_3632 by hand and people loved the result; making it a real feature is the natural next step.

## Problem

Anna and Jennifer accumulate hand-drawn ETD diagrams during math-education research observations. Today they're digitized by hand: open a photo, transcribe shapes/text/connections into ETD JSON one element at a time. That's expensive enough to be a real bottleneck. A prior manual session showed a vision model (Gemini) can produce a serviceable first draft from a photo in seconds — but the conversion happens outside the editor, with hand-pasted prompts and hand-edited JSON. People loved the result; Anna wants it in the app.

## Goals

- One-click "Import image" in the editor that accepts a photo of a hand-drawn ETD diagram and loads it directly into the editor.
- Hand-drawn photos in formats iPhones produce by default (HEIC, JPEG, PNG, WEBP).
- Output includes both elements AND connections (matching what the manual workflow produced — `IMG_3630.json` has 18 elements + 7 connections).
- Privacy-respecting: user sees a disclosure modal before the first import explaining the third-party model call and the PII risk.
- Bounded cost: rate-limited Netlify Function so a single abuser can't exhaust the budget.
- Graceful failure: malformed model output, network errors, rate-limits, and oversized images all surface friendly messages without crashing the editor.
- Never fabricates content. Uncertain text becomes `[illegible]`; uncertain speakers/timestamps are omitted. Per global CLAUDE.md.

## Non-goals

- Screenshots of typed ETDs from other tools (DiagramMix, Lucid, etc.) — out of v1. The `convert-drawing.py` script already handles DiagramMix .drawing files.
- Whiteboard photos or scanned journal figures — out of v1.
- Review-then-commit / staging canvas / side-by-side editing mode — explicitly chosen against. Result loads straight into the editor; user edits or undoes via `Cmd+Z` (zundo).
- Background-function processing for long extractions — start synchronous (≤ 26s Netlify max); revisit only if we hit the wall.
- Visual regression testing on rendered imported diagrams. Konva canvas snapshots are brittle.
- Multi-language prompt support. Anna's diagrams are English; the prompt is English.
- BYO API key path. Backend strategy chosen: hosted Netlify Function with shared key + rate limit. Users do not configure anything.
- A "Merge with current diagram" option. v1 replaces the current diagram; the disclosure modal warns about this. Add merge later if usage shows it's needed.
- Per-model picker (Claude vs Gemini). Gemini only in v1.
- Automated end-to-end tests against a real Gemini call. Mocked at the Function boundary; manual smoke against live deployment.

## Design

### Architecture

Two repos:

**`jenniferbk/etd`** (this repo, Vite app):
- `src/components/Toolbar/Toolbar.tsx` — new "Import image" button next to the existing "Load diagram".
- `src/components/Toolbar/ImageImportModal.tsx` (NEW) — disclosure + file picker + loading + error states.
- `src/utils/imageImport.ts` (NEW) — client helper: builds the multipart POST, handles AbortController, parses + validates the response.
- `src/utils/importedDiagramSchema.ts` (NEW) — Zod schema mirroring the ETD types; validates Function responses; drops/repairs malformed pieces.
- `src/utils/importedDiagramSchema.test.ts` (NEW) — unit tests.

**`jenniferbk/jenkleiman.com`** (Netlify site):
- `netlify/functions/etd-image-import.ts` (NEW) — receives the image, rate-limits, calls Gemini with a structured-output schema, returns ETD JSON.
- `netlify/functions/etd-image-import.test.ts` (NEW) — Vitest tests with mocked Gemini + mocked Blobs.
- `netlify.toml` — declare the function path; no other config (Netlify autodiscovers `netlify/functions/`).
- `package.json` — add `@google/generative-ai`, `@netlify/blobs`, dev-dep `vitest`, and the relevant types.

**Flow:**

```
[ETD app, jenkleiman.com/tools/etd/]                  [jenkleiman.com Function]                  [Google]
Toolbar → "Import image"
  → ImageImportModal opens
  → DisclosureModal (first time only)
  → file picker (.heic .jpg .png .webp, ≤ 8 MB)
  → POST multipart /.netlify/functions/etd-image-import
                                                       → rate-limit check (Netlify Blobs)
                                                       → forward image bytes to Gemini
                                                                                                   → vision extraction
                                                       ← model JSON, schema-constrained
                                                       ← validated server-side
  ← { version, name, elements, connections }
  → Zod-validate again client-side
  → loadDiagram(elements, connections, name, null)
```

### UI flow

**Toolbar button.** Next to "Load diagram", same styling. `ImagePlus` icon (Lucide; already imported elsewhere). Label "Import image". Click opens `ImageImportModal`.

**`ImageImportModal` states (one component, state machine):**

1. **Disclosure** (only if `!localStorage["etd-image-import-disclosure-acked-v1"]`):
   - Title: "Import diagram from image"
   - Body (verbatim): "This sends the image to Google Gemini for extraction. Don't import images that contain student PII you can't share with a third-party API. Extraction takes 10–30 seconds. The result loads into the editor and replaces any unsaved diagram — save first if you want to keep it."
   - Buttons: `Cancel` (closes modal), `Continue →` (sets localStorage flag, advances to file-picker state).
   - `-v1` suffix lets us re-prompt later if disclosure text changes meaningfully.
2. **File picker:** `<input type="file" accept=".heic,.jpg,.jpeg,.png,.webp">`. On change, client-side validates size ≤ 8 MB. Oversize → error state with "Image is too large (max 8 MB)."
3. **Uploading / extracting:** spinner + "Extracting diagram from image…" + "This usually takes 10–30 seconds." + `Cancel` button (aborts the in-flight fetch via `AbortController`).
4. **Success:** modal closes; `loadDiagram(elements, connections, name, null)` fires; canvas renders the result.
5. **Error:** modal stays open with the failure reason and a `Try again` button that returns to state 2. Specific messages:
   - Network error → "Couldn't reach the import service. Check your connection and try again."
   - 413 → "Image is too large (max 8 MB)."
   - 429 → "Daily import limit reached. Try again later." (plus `retryAfter` if useful — e.g., "Resets in 18 hours.")
   - 502 (Gemini malformed output after schema enforcement) → "The model couldn't read this image clearly. Try a clearer photo or one with less glare."
   - 504 → "Extraction timed out. Try a smaller image."
   - 400 (bad content type) → "Unsupported image format."
   - 500 (anything else) → "Something went wrong. Try again."

**Replacement semantics.** `loadDiagram` replaces the current diagram. The disclosure modal warns about this. The user can `Cmd+Z` to revert (zundo). No merge option in v1.

### Netlify Function

**Path:** `netlify/functions/etd-image-import.ts` in the jenkleiman.com repo. Deployed at `https://jenkleiman.com/.netlify/functions/etd-image-import`.

**Request:** `POST multipart/form-data` with a single field `image` (binary). Server rejects bodies > 8 MB with `413`.

**Rate limiting:**
- Key: `sha256(x-nf-client-connection-ip)` to avoid storing raw IPs.
- Limit: 20 successful calls per IP per rolling 24h window.
- Storage: Netlify Blobs. Bucket `etd-rate-limit`; key = hashed IP; value = JSON `{ count: number, windowStart: number /* unix ms */ }`.
- On read: if `now - windowStart > 24h`, reset (count=1, windowStart=now). Otherwise: if `count >= 20`, return 429 with `retryAfter = 24h - (now - windowStart)`. Else increment + persist.
- Increment happens *after* a successful Gemini call so rate-limit isn't burned by upstream failures. Errors before the Gemini call don't increment either.

**Gemini call:**
- Library: `@google/generative-ai`.
- Model: `gemini-2.5-pro`.
- API key from `GEMINI_API_KEY` env var (set in Netlify dashboard, never in code).
- Request: image bytes + system instruction (see Prompt below) + `responseSchema` constraining output structure.
- `responseMimeType: 'application/json'` and `responseSchema` set — Gemini's structured-output mode rejects model output that doesn't conform to the schema.
- Function timeout: synchronous, 26s. If we hit this regularly, escalate to a background-function with polling (out of v1 scope).

**Response shape on success (`200`):**

```json
{
  "version": "1.4",
  "name": "<inferred from filename, e.g. IMG_3630>",
  "elements": [ ... ],
  "connections": [ ... ]
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | `bad_content_type` | Body missing `image` field or wrong MIME |
| 400 | `corrupt_image` | Gemini API rejects image |
| 413 | `image_too_large` | Body exceeds 8 MB |
| 429 | `rate_limited` | IP at 20/day limit; includes `retryAfter` in seconds |
| 502 | `model_output_invalid` | Gemini output fails server-side Zod validation after structured-mode |
| 504 | `upstream_timeout` | Gemini didn't respond within 26s |
| 500 | `internal_error` | Anything else, with the original message logged |

Server logs (Netlify dashboard): hashed IP + timestamp + status code. **Never** the image bytes or extracted text. PII stays out of logs.

### Prompt + schema validation

**System instruction (text sent with image):**

```
You are extracting an Extended Toulmin Diagram (ETD) from a photo of a
hand-drawn diagram used in math-education research.

ETD elements have these types:
  - argument (with argumentType: claim | data | warrant | backing | qualifier | rebuttal)
  - support (with supportType: action | question | other)
  - infoBox (header text — episode/timestamp metadata)

Argument contributors: given | teacher | student | joint | implicit
Support contributors: teacher | student

For each visible element, return:
  - type and subtype (argumentType or supportType)
  - contributor (infer from role and content; if unsure use "student" for
    arguments and "teacher" for supports)
  - label (e.g., "Claim 1", "Data 2" — number them in left-to-right,
    top-to-bottom reading order within their type)
  - content (the transcribed text inside the shape)
  - attribution.speaker and attribution.timestamp if visible
  - position {x, y} and size {width, height} — approximate the layout
    based on relative positions in the image, scaled to a 1200x800 canvas

For each visible arrow/line connecting two shapes, return a connection:
  { from: <source element id>, to: <target element id>, type: "support" }

Generate stable element ids of the form "import-<n>" where n is a
sequence number.

CRITICAL: If text is illegible, write "[illegible]". If a speaker or
timestamp can't be determined, omit those fields entirely. NEVER
invent text, speaker names, or timestamps that aren't clearly visible.
If you're not certain a shape is an ETD element, omit it.

Return a single JSON object matching the response schema.
```

**Gemini `responseSchema`** (passed to the API in the GenerationConfig) encodes the ETD shape — `version: 'string'`, `name: 'string'`, `elements: { type: array, items: { ... discriminated by `type` ... } }`, `connections: { type: array, items: { from: string, to: string, type: 'support' } }`. Element items further enumerate `argumentType`, `supportType`, `contributor` so the model can't return free-form strings. The schema lives next to the Function as a typed constant.

**Server-side validation.** After Gemini returns, the Function Zod-parses the output as defense in depth. If parse fails, return 502.

**Client-side validation** (`src/utils/importedDiagramSchema.ts`): Zod schema mirroring `ArgumentElement`, `SupportElement`, `InfoBoxElement`, `Connection` from `src/types/`. Runs on the response again before `loadDiagram`. Additional post-validation steps:

- Element ID uniqueness: if duplicates exist, keep the first occurrence and drop the rest; console.warn each drop.
- Connection endpoint references: drop any connection whose `from` or `to` doesn't reference a real element ID; console.warn each drop.
- Empty elements array: throw a typed error the UI surfaces as "No elements detected — try a clearer photo."
- Empty connections array: allow; user can wire connections in the editor.

### Privacy disclosure

Plain-language modal on first import. Acknowledged state persisted in localStorage. Versioned key (`-v1` suffix) lets future material changes re-prompt.

The disclosure doesn't claim Gemini won't retain the image — it just says it's being sent. Google's API ToS govern retention; we link to it only if Anna or other reviewers ask for it (skip in v1 to keep the modal short).

No image data is logged at the Netlify Function. Only hashed IP + status code + timestamp.

### Schema and types

No changes to `src/types/` or the saved-file schema version (`'1.4'` per `src/utils/schema.ts`). The Function returns the same schema the existing JSON load path expects.

New types:
- `ImageImportResponse` (Zod-inferred) in `src/utils/importedDiagramSchema.ts`.
- `ImportError` discriminated union in `src/utils/imageImport.ts` matching the error codes in the table above. The modal switches on this for user-facing messages.

## Testing

**Unit tests** (`src/utils/importedDiagramSchema.test.ts`):

- Valid full response (fixture based on `IMG_3630.json`) parses.
- Missing `version` → typed error.
- Unknown `argumentType` → drops element; rest parses.
- Non-numeric `position.x` → drops element.
- Connection `from` not in elements → drops connection with warning.
- Duplicate element IDs → keeps first, drops subsequent.
- Empty `elements` → typed error.
- Empty `connections` → valid (returns empty array).

**Function tests** (`jenkleiman.com/netlify/functions/etd-image-import.test.ts`):

- Mock Gemini client returning a good response → 200 with parsed body.
- Mock Gemini returning malformed JSON → 502.
- Mock Gemini throwing → 500 or 504 depending on the throw.
- Rate limit: 20 mocked successful calls; 21st returns 429.
- 8.5 MB body → 413 before Gemini is called.
- Missing `image` field → 400.
- Blobs mock: in-memory Map matching the small subset of the Netlify Blobs API used.

**Manual smoke** (against the live deployed Function — equivalent of Task 20 from the previous spec):

- Fresh browser → click "Import image" → disclosure modal appears. Continue → file picker. Refresh and repeat → no modal (acked).
- `IMG_3630.HEIC` → ≥ 15 elements load, connections render, text matches the source. Allow `[illegible]` on hard-to-read words.
- `IMG_3632.HEIC` → same.
- A non-ETD image (random photo) → clear error, no editor crash, no diagram change.
- 12 MB image → client cap rejects before upload.
- Trigger 429 (decrement counter via Netlify dashboard or send 20 calls quickly) → friendly "Daily import limit reached" message.
- Network offline (disable wifi) → friendly error, no crash.
- Hit Cancel during extraction → fetch aborts, modal returns to file picker, no partial state.

## Open questions / future work

- Whether to expose Claude as an alternative model. Probably worth re-evaluating after we see real-world Gemini quality on a dozen+ diagrams.
- Whether the disclosure should include a link to Google's API ToS for retention. Skip in v1; add if Anna or reviewers ask.
- Whether to support a "merge into current diagram" mode. Skip in v1; revisit if usage shows it's needed.
- Whether to offer a side-by-side review pane (source image + extracted diagram) in v2 for high-stakes diagrams. The "direct load" choice in v1 trades inspection for friction; reconsider if Jennifer or Anna find themselves repeatedly correcting the same kinds of errors.
- Per-element confidence scores from the model. Gemini's structured output doesn't natively expose this; could be retrofitted via a separate scoring pass.

## Files affected (summary)

ETD repo:
- New: `src/components/Toolbar/ImageImportModal.tsx`
- New: `src/utils/imageImport.ts`
- New: `src/utils/importedDiagramSchema.ts`, `src/utils/importedDiagramSchema.test.ts`
- Modified: `src/components/Toolbar/Toolbar.tsx` (new button)

jenkleiman.com repo:
- New: `netlify/functions/etd-image-import.ts`
- New: `netlify/functions/etd-image-import.test.ts`
- Modified: `package.json` (`@google/generative-ai`, `@netlify/blobs`, `vitest`, types)
- Modified: `netlify.toml` (functions directory if not autodiscovered)
- New (manually in Netlify dashboard, not in repo): `GEMINI_API_KEY` env var
