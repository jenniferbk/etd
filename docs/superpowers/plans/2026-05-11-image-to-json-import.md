# Image-to-JSON Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app "Import image" feature that takes a photo of a hand-drawn ETD diagram and loads it into the editor as structured JSON, via a Netlify Function that calls Gemini.

**Architecture:** Two-repo split. The ETD app (`jenniferbk/etd`) gets a Toolbar button, a modal with disclosure/picker/loading/error states, a Zod-validated client helper, and unit tests. The hosting site (`jenniferbk/jenkleiman.com`) gets a new Netlify Function that rate-limits by hashed-IP (via Netlify Blobs), forwards the image to Gemini with a structured-output `responseSchema`, validates the result server-side with Zod, and returns ETD JSON. Defense-in-depth schema validation runs on both sides.

**Tech Stack:** React 18 + TypeScript + Vite + Konva (ETD); Astro + Netlify Functions (`@google/generative-ai`, `@netlify/blobs`) (jenkleiman.com); Zod for runtime schema validation in both repos; Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-05-11-image-to-json-import-design.md`

---

## Repo locations

Most tasks specify `Work from: <path>`. Two repos:

- **ETD:** `/Users/jenniferkleiman/Documents/GitHub/etd`
- **jenkleiman.com:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

---

## Phase A — Netlify Function (jenkleiman.com)

### Task 1: Bootstrap Netlify Functions directory + config

**Files:**
- Modify: `netlify.toml`
- Create: `netlify/functions/.gitkeep`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Read the current `netlify.toml`**

Run: `cat netlify.toml`
Expected: existing build config only.

- [ ] **Step 2: Add the functions directory declaration**

Edit `netlify.toml` and append:

```toml

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

(Two-space indentation inside the section; blank line separator from prior block.)

- [ ] **Step 3: Create the functions directory placeholder**

```bash
mkdir -p netlify/functions
touch netlify/functions/.gitkeep
```

- [ ] **Step 4: Verify the Netlify CLI sees it (optional, only if `netlify` CLI is installed)**

Run: `netlify dev --help >/dev/null && echo "cli ok" || echo "no cli — will deploy via push"`
Expected: either output is fine.

- [ ] **Step 5: Commit**

```bash
git add netlify.toml netlify/functions/.gitkeep
git commit -m "feat(netlify): scaffold functions directory"
```

---

### Task 2: Install dependencies (`@netlify/blobs`, `zod`)

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Install `@netlify/blobs` and `zod`**

```bash
npm install @netlify/blobs zod
```

Expected: both packages added to `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Confirm versions land**

```bash
grep -E '"@netlify/blobs"|"zod"' package.json
```

Expected: both listed.

- [ ] **Step 3: Run existing tests to make sure nothing broke**

```bash
npm test
```

Expected: all existing tests still pass (no behavior change yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @netlify/blobs + zod for ETD image-import function"
```

---

### Task 3: Define the ETD response schema (server-side Zod)

**Files:**
- Create: `netlify/functions/_lib/etdSchema.ts`
- Create: `netlify/functions/_lib/etdSchema.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

The `_lib/` prefix tells Netlify not to deploy this file as a function; it's a shared helper.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/_lib/etdSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { etdDiagramSchema } from './etdSchema';

const validDiagram = {
  version: '1.4',
  name: 'IMG_3630',
  elements: [
    {
      id: 'import-1',
      type: 'argument',
      argumentType: 'data',
      contributor: 'given',
      label: 'Data 1',
      content: 'We are looking at codes',
      position: { x: 80, y: 140 },
      size: { width: 220, height: 130 },
    },
    {
      id: 'import-2',
      type: 'support',
      supportType: 'question',
      contributor: 'teacher',
      content: 'What shape is this?',
      attribution: { speaker: 'T', timestamp: '54:04' },
      position: { x: 380, y: 100 },
      size: { width: 220, height: 80 },
    },
  ],
  connections: [
    { id: 'conn-1', from: 'import-1', to: 'import-2', type: 'support' },
  ],
};

describe('etdDiagramSchema', () => {
  it('parses a valid diagram', () => {
    const result = etdDiagramSchema.parse(validDiagram);
    expect(result.elements).toHaveLength(2);
    expect(result.connections).toHaveLength(1);
  });

  it('rejects unknown argumentType', () => {
    const bad = structuredClone(validDiagram);
    (bad.elements[0] as any).argumentType = 'nonsense';
    expect(() => etdDiagramSchema.parse(bad)).toThrow();
  });

  it('rejects missing position', () => {
    const bad = structuredClone(validDiagram);
    delete (bad.elements[0] as any).position;
    expect(() => etdDiagramSchema.parse(bad)).toThrow();
  });

  it('allows empty connections array', () => {
    const noConn = { ...validDiagram, connections: [] };
    expect(() => etdDiagramSchema.parse(noConn)).not.toThrow();
  });

  it('rejects support with argumentType field (mismatched discriminator)', () => {
    const bad = structuredClone(validDiagram);
    (bad.elements[1] as any).argumentType = 'claim';
    delete (bad.elements[1] as any).supportType;
    expect(() => etdDiagramSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/_lib/etdSchema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

Create `netlify/functions/_lib/etdSchema.ts`:

```ts
import { z } from 'zod';

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const sizeSchema = z.object({
  width: z.number(),
  height: z.number(),
});

const attributionSchema = z.object({
  speaker: z.string().optional(),
  timestamp: z.string().optional(),
}).optional();

const argumentElementSchema = z.object({
  id: z.string(),
  type: z.literal('argument'),
  argumentType: z.enum(['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal']),
  contributor: z.enum(['given', 'teacher', 'student', 'joint', 'implicit']),
  label: z.string(),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const supportElementSchema = z.object({
  id: z.string(),
  type: z.literal('support'),
  supportType: z.enum(['action', 'question', 'other']),
  contributor: z.enum(['teacher', 'student']),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const infoBoxElementSchema = z.object({
  id: z.string(),
  type: z.literal('infoBox'),
  label: z.string(),
  content: z.string(),
  position: positionSchema,
  size: sizeSchema,
});

const elementSchema = z.discriminatedUnion('type', [
  argumentElementSchema,
  supportElementSchema,
  infoBoxElementSchema,
]);

const connectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.literal('support'),
});

export const etdDiagramSchema = z.object({
  version: z.string(),
  name: z.string(),
  elements: z.array(elementSchema),
  connections: z.array(connectionSchema),
});

export type EtdDiagram = z.infer<typeof etdDiagramSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/_lib/etdSchema.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/etdSchema.ts netlify/functions/_lib/etdSchema.test.ts
git commit -m "feat(etd-import): Zod schema for image-import response"
```

---

### Task 4: Rate-limit module (Netlify Blobs)

**Files:**
- Create: `netlify/functions/_lib/rateLimit.ts`
- Create: `netlify/functions/_lib/rateLimit.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/_lib/rateLimit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { checkAndIncrement, RATE_LIMIT_MAX, WINDOW_MS } from './rateLimit';

function inMemoryStore() {
  const map = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    setJSON: vi.fn(async (key: string, value: unknown) => {
      map.set(key, JSON.stringify(value));
    }),
  };
}

describe('checkAndIncrement', () => {
  it('allows first request and persists count=1', async () => {
    const store = inMemoryStore();
    const result = await checkAndIncrement(store as any, '1.2.3.4', () => 1_000_000);
    expect(result.allowed).toBe(true);
    expect(store.setJSON).toHaveBeenCalledWith(
      expect.any(String),
      { count: 1, windowStart: 1_000_000 },
    );
  });

  it('allows requests up to RATE_LIMIT_MAX', async () => {
    const store = inMemoryStore();
    let now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const r = await checkAndIncrement(store as any, '1.2.3.4', () => now);
      expect(r.allowed).toBe(true);
    }
  });

  it('rejects request RATE_LIMIT_MAX+1 within window', async () => {
    const store = inMemoryStore();
    let now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await checkAndIncrement(store as any, '1.2.3.4', () => now);
    }
    const r = await checkAndIncrement(store as any, '1.2.3.4', () => now);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(WINDOW_MS / 1000);
  });

  it('resets window after 24h', async () => {
    const store = inMemoryStore();
    let now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await checkAndIncrement(store as any, '1.2.3.4', () => now);
    }
    now += WINDOW_MS + 1;
    const r = await checkAndIncrement(store as any, '1.2.3.4', () => now);
    expect(r.allowed).toBe(true);
  });

  it('hashes IPs so they are not stored raw', async () => {
    const store = inMemoryStore();
    await checkAndIncrement(store as any, '1.2.3.4', () => 1_000_000);
    const key = (store.setJSON.mock.calls[0]?.[0] as string) || '';
    expect(key).not.toContain('1.2.3.4');
    expect(key).toMatch(/^[a-f0-9]{64}$/);  // sha256 hex
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/_lib/rateLimit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `netlify/functions/_lib/rateLimit.ts`:

```ts
import { createHash } from 'node:crypto';

export const RATE_LIMIT_MAX = 20;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;  // seconds until reset, if denied
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export async function checkAndIncrement(
  store: RateLimitStore,
  ip: string,
  nowMs: () => number = () => Date.now(),
): Promise<RateLimitResult> {
  const key = hashIp(ip);
  const now = nowMs();
  const raw = await store.get(key);
  let count = 0;
  let windowStart = now;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { count: number; windowStart: number };
      if (now - parsed.windowStart > WINDOW_MS) {
        // Window expired — reset.
        count = 0;
        windowStart = now;
      } else {
        count = parsed.count;
        windowStart = parsed.windowStart;
      }
    } catch {
      // Corrupt value — treat as fresh.
      count = 0;
      windowStart = now;
    }
  }
  if (count >= RATE_LIMIT_MAX) {
    const elapsed = now - windowStart;
    return { allowed: false, retryAfter: Math.ceil((WINDOW_MS - elapsed) / 1000) };
  }
  const next = { count: count + 1, windowStart };
  await store.setJSON(key, next);
  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/_lib/rateLimit.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/rateLimit.ts netlify/functions/_lib/rateLimit.test.ts
git commit -m "feat(etd-import): hashed-IP rate limit module"
```

---

### Task 5: Gemini extraction module

**Files:**
- Create: `netlify/functions/_lib/geminiExtract.ts`
- Create: `netlify/functions/_lib/geminiExtract.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/_lib/geminiExtract.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { extractDiagramFromImage } from './geminiExtract';

const validResponse = {
  version: '1.4',
  name: 'IMG',
  elements: [
    {
      id: 'import-1',
      type: 'argument',
      argumentType: 'claim',
      contributor: 'student',
      label: 'Claim 1',
      content: 'A square.',
      position: { x: 100, y: 100 },
      size: { width: 180, height: 90 },
    },
  ],
  connections: [],
};

describe('extractDiagramFromImage', () => {
  it('returns parsed ETD diagram when Gemini returns valid JSON', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => JSON.stringify(validResponse) },
      })),
    };
    const result = await extractDiagramFromImage(mockModel as any, Buffer.from([0xff]), 'image/jpeg', 'IMG');
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].id).toBe('import-1');
  });

  it('throws when Gemini returns malformed JSON', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => '{not valid json' },
      })),
    };
    await expect(
      extractDiagramFromImage(mockModel as any, Buffer.from([0xff]), 'image/jpeg', 'IMG'),
    ).rejects.toThrow(/model_output_invalid/);
  });

  it('throws when Gemini returns JSON that fails schema', async () => {
    const bad = { ...validResponse, elements: [{ ...validResponse.elements[0], argumentType: 'nonsense' }] };
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => JSON.stringify(bad) },
      })),
    };
    await expect(
      extractDiagramFromImage(mockModel as any, Buffer.from([0xff]), 'image/jpeg', 'IMG'),
    ).rejects.toThrow(/model_output_invalid/);
  });

  it('passes the name parameter through to the returned diagram', async () => {
    const responseWithDifferentName = { ...validResponse, name: 'something-else' };
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => JSON.stringify(responseWithDifferentName) },
      })),
    };
    const result = await extractDiagramFromImage(mockModel as any, Buffer.from([0xff]), 'image/jpeg', 'MY-NAME');
    expect(result.name).toBe('MY-NAME');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/_lib/geminiExtract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `netlify/functions/_lib/geminiExtract.ts`:

```ts
import { etdDiagramSchema, type EtdDiagram } from './etdSchema';

export const SYSTEM_PROMPT = `You are extracting an Extended Toulmin Diagram (ETD) from a photo of a hand-drawn diagram used in math-education research.

ETD elements have these types:
  - argument (with argumentType: claim | data | warrant | backing | qualifier | rebuttal)
  - support (with supportType: action | question | other)
  - infoBox (header text — episode/timestamp metadata)

Argument contributors: given | teacher | student | joint | implicit
Support contributors: teacher | student

For each visible element, return:
  - type and subtype (argumentType or supportType)
  - contributor (infer from role and content; if unsure use "student" for arguments and "teacher" for supports)
  - label (e.g., "Claim 1", "Data 2" — number them in left-to-right, top-to-bottom reading order within their type; infoBox elements need a label too, e.g., "Episode")
  - content (the transcribed text inside the shape)
  - attribution.speaker and attribution.timestamp if visible
  - position {x, y} and size {width, height} — approximate the layout based on relative positions in the image, scaled to a 1200x800 canvas

For each visible arrow/line connecting two shapes, return a connection:
  { id: "conn-<n>", from: <source element id>, to: <target element id>, type: "support" }

Generate stable element ids of the form "import-<n>" where n is a sequence number.
Generate stable connection ids of the form "conn-<n>".
Always set version to "1.4".

CRITICAL: If text is illegible, write "[illegible]". If a speaker or timestamp can't be determined, omit those fields entirely. NEVER invent text, speaker names, or timestamps that aren't clearly visible. If you're not certain a shape is an ETD element, omit it.

Return a single JSON object: { version, name, elements, connections }.`;

// Minimal model type — matches @google/generative-ai GenerativeModel surface we use.
export interface ModelLike {
  generateContent(args: unknown): Promise<{ response: { text(): string } }>;
}

export async function extractDiagramFromImage(
  model: ModelLike,
  imageBytes: Buffer,
  mimeType: string,
  name: string,
): Promise<EtdDiagram> {
  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    {
      inlineData: {
        data: imageBytes.toString('base64'),
        mimeType,
      },
    },
  ]);

  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error('model_output_invalid: not JSON');
    (err as any).code = 'model_output_invalid';
    throw err;
  }

  const validation = etdDiagramSchema.safeParse(parsed);
  if (!validation.success) {
    const err = new Error('model_output_invalid: schema mismatch');
    (err as any).code = 'model_output_invalid';
    (err as any).zodIssues = validation.error.issues;
    throw err;
  }

  return { ...validation.data, name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/_lib/geminiExtract.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/geminiExtract.ts netlify/functions/_lib/geminiExtract.test.ts
git commit -m "feat(etd-import): Gemini extraction module with prompt + Zod validation"
```

---

### Task 6: The Function handler

**Files:**
- Create: `netlify/functions/etd-image-import.ts`
- Create: `netlify/functions/etd-image-import.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/etd-image-import.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildHandler } from './etd-image-import';

const validDiagram = {
  version: '1.4',
  name: 'IMG',
  elements: [{
    id: 'import-1', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim 1', content: 'A square.',
    position: { x: 0, y: 0 }, size: { width: 180, height: 90 },
  }],
  connections: [],
};

function inMemoryStore() {
  const map = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    setJSON: vi.fn(async (k: string, v: unknown) => { map.set(k, JSON.stringify(v)); }),
  };
}

function imageFormData(bytes: Buffer, mimeType = 'image/jpeg', name = 'IMG_3630.jpg'): FormData {
  const fd = new FormData();
  fd.append('image', new Blob([bytes], { type: mimeType }), name);
  return fd;
}

function makeRequest(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('https://x/.netlify/functions/etd-image-import', {
    method: 'POST',
    body,
    headers,
  });
}

describe('etd-image-import handler', () => {
  it('returns 200 with parsed diagram on happy path', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => JSON.stringify(validDiagram) },
      })),
    };
    const handler = buildHandler({ store: inMemoryStore(), getModel: () => mockModel as any });
    const req = makeRequest(imageFormData(Buffer.from([0xff, 0xd8])), { 'x-nf-client-connection-ip': '1.2.3.4' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.elements).toHaveLength(1);
    expect(body.name).toBe('IMG_3630');  // .jpg stripped
  });

  it('returns 413 when body exceeds 8 MB', async () => {
    const big = Buffer.alloc(9 * 1024 * 1024, 0xff);
    const handler = buildHandler({ store: inMemoryStore(), getModel: () => ({} as any) });
    const req = makeRequest(imageFormData(big), { 'x-nf-client-connection-ip': '1.2.3.4' });
    const res = await handler(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('image_too_large');
  });

  it('returns 400 when image field is missing', async () => {
    const fd = new FormData();
    fd.append('not-image', new Blob([Buffer.from([0xff])]));
    const handler = buildHandler({ store: inMemoryStore(), getModel: () => ({} as any) });
    const req = makeRequest(fd, { 'x-nf-client-connection-ip': '1.2.3.4' });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 429 after 20 successful calls from the same IP', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => JSON.stringify(validDiagram) },
      })),
    };
    const store = inMemoryStore();
    const handler = buildHandler({ store, getModel: () => mockModel as any });
    for (let i = 0; i < 20; i++) {
      const req = makeRequest(imageFormData(Buffer.from([0xff])), { 'x-nf-client-connection-ip': '1.2.3.4' });
      const res = await handler(req);
      expect(res.status).toBe(200);
    }
    const req21 = makeRequest(imageFormData(Buffer.from([0xff])), { 'x-nf-client-connection-ip': '1.2.3.4' });
    const res21 = await handler(req21);
    expect(res21.status).toBe(429);
    const body = await res21.json();
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('returns 502 when Gemini returns malformed output', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => '{garbage' },
      })),
    };
    const handler = buildHandler({ store: inMemoryStore(), getModel: () => mockModel as any });
    const req = makeRequest(imageFormData(Buffer.from([0xff])), { 'x-nf-client-connection-ip': '1.2.3.4' });
    const res = await handler(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('model_output_invalid');
  });

  it('does NOT increment rate limit when Gemini throws', async () => {
    const mockModel = {
      generateContent: vi.fn(async () => ({
        response: { text: () => '{garbage' },
      })),
    };
    const store = inMemoryStore();
    const handler = buildHandler({ store, getModel: () => mockModel as any });
    const req = makeRequest(imageFormData(Buffer.from([0xff])), { 'x-nf-client-connection-ip': '1.2.3.4' });
    await handler(req);
    expect(store.setJSON).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/etd-image-import.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `netlify/functions/etd-image-import.ts`:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getStore } from '@netlify/blobs';
import { extractDiagramFromImage, type ModelLike } from './_lib/geminiExtract';
import { checkAndIncrement, type RateLimitStore } from './_lib/rateLimit';

const MAX_BYTES = 8 * 1024 * 1024;
const MODEL_NAME = 'gemini-2.5-pro';

interface HandlerDeps {
  store: RateLimitStore;
  getModel: () => ModelLike;
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ error: code, message, ...extra }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

function stripExtension(filename: string): string {
  const m = filename.match(/^(.+)\.[^.]+$/);
  return m ? m[1] : filename;
}

export function buildHandler(deps: HandlerDeps) {
  return async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST');
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return errorResponse(400, 'bad_content_type', 'Body must be multipart/form-data');
    }

    const file = formData.get('image');
    if (!file || !(file instanceof Blob)) {
      return errorResponse(400, 'bad_content_type', 'Missing "image" field');
    }
    if (file.size > MAX_BYTES) {
      return errorResponse(413, 'image_too_large', 'Image exceeds 8 MB');
    }
    if (file.size === 0) {
      return errorResponse(400, 'bad_content_type', 'Empty image');
    }

    const mimeType = file.type || 'application/octet-stream';
    const filename = (file as any).name as string | undefined;
    const diagramName = filename ? stripExtension(filename) : 'Imported diagram';

    const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown';

    // Pre-check rate limit WITHOUT incrementing, so we don't burn quota on upstream failures.
    // Increment happens only after successful Gemini call.
    // (Simpler: just check by reading; we'll do the real check+increment after extraction.)
    // Read-only peek:
    const peekResult = await checkAndIncrement(
      { get: deps.store.get.bind(deps.store), setJSON: async () => {} },
      ip,
    );
    if (!peekResult.allowed) {
      return errorResponse(429, 'rate_limited', 'Daily import limit reached', { retryAfter: peekResult.retryAfter });
    }

    const imageBytes = Buffer.from(await file.arrayBuffer());
    let diagram;
    try {
      diagram = await extractDiagramFromImage(deps.getModel(), imageBytes, mimeType, diagramName);
    } catch (e: unknown) {
      const code = (e as any)?.code;
      if (code === 'model_output_invalid') {
        return errorResponse(502, 'model_output_invalid', "The model couldn't read this image clearly. Try a clearer photo.");
      }
      console.error('etd-image-import: gemini error', { ipHash: ip.length, message: (e as Error).message });
      return errorResponse(500, 'internal_error', 'Something went wrong. Try again.');
    }

    // Success — now increment the rate-limit counter.
    await checkAndIncrement(deps.store, ip);

    return new Response(JSON.stringify(diagram), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

// The Netlify entry point.
export default async (req: Request): Promise<Response> => {
  const store = getStore('etd-rate-limit') as unknown as RateLimitStore;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'internal_error', message: 'Server not configured' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const handler = buildHandler({
    store,
    getModel: () => genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { responseMimeType: 'application/json' },
    }) as unknown as ModelLike,
  });
  return handler(req);
};

export const config = {
  path: '/.netlify/functions/etd-image-import',
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run netlify/functions/etd-image-import.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: all tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/etd-image-import.ts netlify/functions/etd-image-import.test.ts
git commit -m "feat(etd-import): Netlify Function handler with rate limit + Gemini call"
```

---

### Task 7: Push Function changes to enable Netlify preview deploy

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/jenkleiman.com`

- [ ] **Step 1: Confirm branch + push**

```bash
git status
git push
```

Expected: pushes to `main`, Netlify auto-deploys.

- [ ] **Step 2: Wait for deploy + smoke test the Function (without API key set yet)**

After Netlify finishes the deploy (check dashboard), call:

```bash
curl -X POST https://jenkleiman.com/.netlify/functions/etd-image-import \
  -F "image=@/Users/jenniferkleiman/Documents/GitHub/etd/IMG_3630.HEIC"
```

Expected (with no API key set yet): `{"error":"internal_error","message":"Server not configured"}` (500).

This confirms the Function is reachable; the next task sets the API key.

- [ ] **Step 3 (manual, no commit): Set `GEMINI_API_KEY` env var in Netlify dashboard**

In Netlify dashboard → site → Project configuration → Environment variables → Add a variable:
- Key: `GEMINI_API_KEY`
- Value: (paste your Gemini API key)
- Scope: production + previews

Trigger a redeploy (Deploys → Trigger deploy → Deploy site) so the new env var is picked up.

- [ ] **Step 4: Verify the live Function end-to-end**

```bash
curl -X POST https://jenkleiman.com/.netlify/functions/etd-image-import \
  -F "image=@/Users/jenniferkleiman/Documents/GitHub/etd/IMG_3630.HEIC" \
  -o /tmp/etd-import-test.json
cat /tmp/etd-import-test.json | python3 -m json.tool | head -40
```

Expected: 200 response with a `version: "1.4"` ETD diagram JSON containing elements and connections. Some content may be `[illegible]` — that's fine.

If it fails, debug in Netlify Function logs (dashboard → Functions → etd-image-import → Logs).

---

## Phase B — Frontend (ETD repo)

### Task 8: Install Zod in ETD repo

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/etd`

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

- [ ] **Step 2: Verify**

```bash
grep '"zod"' package.json
```

- [ ] **Step 3: Run tests + build to confirm clean**

```bash
npm test
npm run build
```

Expected: 74/74 tests still pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add zod for image-import response validation"
```

---

### Task 9: Client-side schema + post-validation

**Files:**
- Create: `src/utils/importedDiagramSchema.ts`
- Create: `src/utils/importedDiagramSchema.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/etd`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/importedDiagramSchema.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseImportedDiagram } from './importedDiagramSchema';

const validResponse = {
  version: '1.4',
  name: 'IMG_3630',
  elements: [
    {
      id: 'import-1', type: 'argument', argumentType: 'data', contributor: 'given',
      label: 'Data 1', content: 'foo',
      position: { x: 0, y: 0 }, size: { width: 100, height: 60 },
    },
    {
      id: 'import-2', type: 'argument', argumentType: 'claim', contributor: 'student',
      label: 'Claim 1', content: 'bar',
      position: { x: 200, y: 0 }, size: { width: 100, height: 60 },
    },
  ],
  connections: [
    { id: 'conn-1', from: 'import-1', to: 'import-2', type: 'support' },
  ],
};

describe('parseImportedDiagram', () => {
  it('returns success for a valid response', () => {
    const result = parseImportedDiagram(validResponse);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(2);
      expect(result.diagram.connections).toHaveLength(1);
    }
  });

  it('returns empty_diagram error when elements array is empty', () => {
    const empty = { ...validResponse, elements: [] };
    const result = parseImportedDiagram(empty);
    expect(result.kind).toBe('empty_diagram');
  });

  it('returns schema_invalid error when response is malformed', () => {
    const result = parseImportedDiagram({ not: 'a diagram' });
    expect(result.kind).toBe('schema_invalid');
  });

  it('drops connections whose endpoints do not exist in elements', () => {
    const withDangling = {
      ...validResponse,
      connections: [
        ...validResponse.connections,
        { id: 'conn-2', from: 'import-1', to: 'no-such-element', type: 'support' },
      ],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseImportedDiagram(withDangling);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.connections).toHaveLength(1);
      expect(result.diagram.connections[0].id).toBe('conn-1');
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops elements with duplicate ids, keeping the first', () => {
    const withDupes = {
      ...validResponse,
      elements: [
        ...validResponse.elements,
        { ...validResponse.elements[0] },
      ],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseImportedDiagram(withDupes);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(2);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- importedDiagramSchema`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/importedDiagramSchema.ts`:

```ts
import { z } from 'zod';

const positionSchema = z.object({ x: z.number(), y: z.number() });
const sizeSchema = z.object({ width: z.number(), height: z.number() });
const attributionSchema = z.object({
  speaker: z.string().optional(),
  timestamp: z.string().optional(),
}).optional();

const argumentElementSchema = z.object({
  id: z.string(),
  type: z.literal('argument'),
  argumentType: z.enum(['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal']),
  contributor: z.enum(['given', 'teacher', 'student', 'joint', 'implicit']),
  label: z.string(),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const supportElementSchema = z.object({
  id: z.string(),
  type: z.literal('support'),
  supportType: z.enum(['action', 'question', 'other']),
  contributor: z.enum(['teacher', 'student']),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const infoBoxElementSchema = z.object({
  id: z.string(),
  type: z.literal('infoBox'),
  label: z.string(),
  content: z.string(),
  position: positionSchema,
  size: sizeSchema,
});

const elementSchema = z.discriminatedUnion('type', [
  argumentElementSchema,
  supportElementSchema,
  infoBoxElementSchema,
]);

const connectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.literal('support'),
});

const importedDiagramSchema = z.object({
  version: z.string(),
  name: z.string(),
  elements: z.array(elementSchema),
  connections: z.array(connectionSchema),
});

export type ImportedDiagram = z.infer<typeof importedDiagramSchema>;

export type ParseResult =
  | { kind: 'ok'; diagram: ImportedDiagram }
  | { kind: 'empty_diagram' }
  | { kind: 'schema_invalid'; issues: unknown[] };

export function parseImportedDiagram(input: unknown): ParseResult {
  const parsed = importedDiagramSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: 'schema_invalid', issues: parsed.error.issues };
  }

  const { elements, connections } = parsed.data;

  // Drop elements with duplicate ids (keep first).
  const seen = new Set<string>();
  const dedupedElements: typeof elements = [];
  for (const el of elements) {
    if (seen.has(el.id)) {
      console.warn(`parseImportedDiagram: dropping element with duplicate id "${el.id}"`);
      continue;
    }
    seen.add(el.id);
    dedupedElements.push(el);
  }

  if (dedupedElements.length === 0) {
    return { kind: 'empty_diagram' };
  }

  // Drop connections whose endpoints are missing.
  const elementIds = new Set(dedupedElements.map((e) => e.id));
  const validConnections = connections.filter((c) => {
    if (!elementIds.has(c.from) || !elementIds.has(c.to)) {
      console.warn(`parseImportedDiagram: dropping connection "${c.id}" with missing endpoint (${c.from} → ${c.to})`);
      return false;
    }
    return true;
  });

  return {
    kind: 'ok',
    diagram: { ...parsed.data, elements: dedupedElements, connections: validConnections },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- importedDiagramSchema`
Expected: all 5 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: 79/79 (74 previous + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/utils/importedDiagramSchema.ts src/utils/importedDiagramSchema.test.ts
git commit -m "feat(import): Zod schema + post-validation for imported ETD JSON"
```

---

### Task 10: Image-import client helper

**Files:**
- Create: `src/utils/imageImport.ts`
- Create: `src/utils/imageImport.test.ts`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/etd`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/imageImport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importImage, IMPORT_ENDPOINT } from './imageImport';

const validResponse = {
  version: '1.4',
  name: 'IMG_3630',
  elements: [{
    id: 'import-1', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim 1', content: 'A square.',
    position: { x: 0, y: 0 }, size: { width: 180, height: 90 },
  }],
  connections: [],
};

function mockFetchOnce(status: number, body: unknown): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  ) as typeof fetch;
}

describe('importImage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns ok result on successful import', async () => {
    mockFetchOnce(200, validResponse);
    const file = new File([new Uint8Array([0xff, 0xd8])], 'IMG_3630.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(1);
    }
  });

  it('returns image_too_large for files over 8 MB before fetch', async () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    global.fetch = vi.fn() as typeof fetch;
    const result = await importImage(big);
    expect(result.kind).toBe('image_too_large');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns rate_limited on 429', async () => {
    mockFetchOnce(429, { error: 'rate_limited', message: 'limit', retryAfter: 3600 });
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSeconds).toBe(3600);
    }
  });

  it('returns model_output_invalid on 502', async () => {
    mockFetchOnce(502, { error: 'model_output_invalid', message: '...' });
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('model_output_invalid');
  });

  it('returns network_error when fetch rejects', async () => {
    global.fetch = vi.fn(async () => { throw new Error('boom'); }) as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('network_error');
  });

  it('returns cancelled when AbortController is fired', async () => {
    const controller = new AbortController();
    global.fetch = vi.fn(async (_url: any, init: any) => {
      // Simulate that the fetch sees the abort signal.
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      return new Response();
    }) as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const promise = importImage(file, { signal: controller.signal });
    controller.abort();
    const result = await promise;
    expect(result.kind).toBe('cancelled');
  });

  it('posts to the expected endpoint with multipart body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    global.fetch = fetchMock as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    await importImage(file);
    expect(fetchMock).toHaveBeenCalledWith(
      IMPORT_ENDPOINT,
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- imageImport`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/imageImport.ts`:

```ts
import { parseImportedDiagram, type ImportedDiagram } from './importedDiagramSchema';

export const IMPORT_ENDPOINT = 'https://jenkleiman.com/.netlify/functions/etd-image-import';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImportResult =
  | { kind: 'ok'; diagram: ImportedDiagram }
  | { kind: 'image_too_large' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'model_output_invalid' }
  | { kind: 'upstream_timeout' }
  | { kind: 'bad_content_type' }
  | { kind: 'network_error' }
  | { kind: 'cancelled' }
  | { kind: 'empty_diagram' }
  | { kind: 'unknown_error' };

export interface ImportOptions {
  signal?: AbortSignal;
}

export async function importImage(file: File, options: ImportOptions = {}): Promise<ImportResult> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { kind: 'image_too_large' };
  }

  const formData = new FormData();
  formData.append('image', file);

  let response: Response;
  try {
    response = await fetch(IMPORT_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: options.signal,
    });
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    return { kind: 'network_error' };
  }

  if (!response.ok) {
    let body: { error?: string; retryAfter?: number } = {};
    try {
      body = await response.json();
    } catch {
      // ignore — fall through with empty body
    }
    switch (response.status) {
      case 413: return { kind: 'image_too_large' };
      case 429: return { kind: 'rate_limited', retryAfterSeconds: body.retryAfter };
      case 502: return { kind: 'model_output_invalid' };
      case 504: return { kind: 'upstream_timeout' };
      case 400: return { kind: 'bad_content_type' };
      default: return { kind: 'unknown_error' };
    }
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: 'model_output_invalid' };
  }

  const parsed = parseImportedDiagram(json);
  if (parsed.kind === 'ok') {
    return { kind: 'ok', diagram: parsed.diagram };
  }
  if (parsed.kind === 'empty_diagram') {
    return { kind: 'empty_diagram' };
  }
  return { kind: 'model_output_invalid' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- imageImport`
Expected: all 7 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: 86/86 (79 previous + 7 new).

- [ ] **Step 6: Commit**

```bash
git add src/utils/imageImport.ts src/utils/imageImport.test.ts
git commit -m "feat(import): client helper for image-import endpoint"
```

---

### Task 11: ImageImportModal component

**Files:**
- Create: `src/components/Toolbar/ImageImportModal.tsx`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/etd`

No unit tests for this UI component — covered by manual smoke in Task 13.

- [ ] **Step 1: Create the modal**

Create `src/components/Toolbar/ImageImportModal.tsx`:

```tsx
import { useRef, useState, useCallback, useEffect } from 'react';
import { useDiagramStore } from '../../store';
import { importImage, MAX_IMAGE_BYTES, type ImportResult } from '../../utils/imageImport';

const DISCLOSURE_ACK_KEY = 'etd-image-import-disclosure-acked-v1';

type ModalState =
  | { kind: 'disclosure' }
  | { kind: 'picker' }
  | { kind: 'loading'; abort: AbortController }
  | { kind: 'error'; result: ImportResult };

interface Props {
  open: boolean;
  onClose: () => void;
}

function errorMessage(result: ImportResult): string {
  switch (result.kind) {
    case 'image_too_large':
      return 'Image is too large (max 8 MB).';
    case 'rate_limited': {
      const hours = result.retryAfterSeconds ? Math.ceil(result.retryAfterSeconds / 3600) : null;
      return hours
        ? `Daily import limit reached. Resets in ~${hours} hour${hours === 1 ? '' : 's'}.`
        : 'Daily import limit reached. Try again later.';
    }
    case 'model_output_invalid':
      return "The model couldn't read this image clearly. Try a clearer photo or one with less glare.";
    case 'upstream_timeout':
      return 'Extraction timed out. Try a smaller image.';
    case 'bad_content_type':
      return 'Unsupported image format.';
    case 'network_error':
      return "Couldn't reach the import service. Check your connection and try again.";
    case 'empty_diagram':
      return 'No elements detected. Try a clearer photo.';
    case 'cancelled':
      return 'Cancelled.';
    case 'unknown_error':
    default:
      return 'Something went wrong. Try again.';
  }
}

export function ImageImportModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadDiagram = useDiagramStore((s) => s.loadDiagram);

  const [state, setState] = useState<ModalState>(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(DISCLOSURE_ACK_KEY)) {
      return { kind: 'picker' };
    }
    return { kind: 'disclosure' };
  });

  // Reset state when the modal is re-opened.
  useEffect(() => {
    if (open) {
      const acked = window.localStorage.getItem(DISCLOSURE_ACK_KEY);
      setState(acked ? { kind: 'picker' } : { kind: 'disclosure' });
    }
  }, [open]);

  const handleAck = useCallback(() => {
    window.localStorage.setItem(DISCLOSURE_ACK_KEY, '1');
    setState({ kind: 'picker' });
  }, []);

  const handleCancel = useCallback(() => {
    if (state.kind === 'loading') {
      state.abort.abort();
    }
    onClose();
  }, [state, onClose]);

  const handleFile = useCallback(async (file: File) => {
    const abort = new AbortController();
    setState({ kind: 'loading', abort });
    const result = await importImage(file, { signal: abort.signal });
    if (result.kind === 'ok') {
      loadDiagram(result.diagram.elements, result.diagram.connections, result.diagram.name, null);
      onClose();
    } else if (result.kind === 'cancelled') {
      // User clicked Cancel — modal is already closing or returning to picker.
      setState({ kind: 'picker' });
    } else {
      setState({ kind: 'error', result });
    }
  }, [loadDiagram, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {state.kind === 'disclosure' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import diagram from image</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              This sends the image to Google Gemini for extraction. Don't import images that
              contain student PII you can't share with a third-party API.
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Extraction takes 10–30 seconds. The result loads into the editor and
              replaces any unsaved diagram — save first if you want to keep it.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
              <button onClick={handleAck} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">
                Continue →
              </button>
            </div>
          </>
        )}

        {state.kind === 'picker' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import diagram from image</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose a photo of a hand-drawn ETD diagram. Max 8 MB.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".heic,.jpg,.jpeg,.png,.webp"
              className="block w-full text-sm mb-4"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
            </div>
          </>
        )}

        {state.kind === 'loading' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Extracting diagram from image…</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">This usually takes 10–30 seconds.</p>
            <div className="mb-4">
              <div className="h-1 w-full bg-gray-200 rounded overflow-hidden">
                <div className="h-full bg-blue-500 animate-pulse w-1/2" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleCancel} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import failed</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">{errorMessage(state.result)}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
              <button
                onClick={() => setState({ kind: 'picker' })}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck / build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/ImageImportModal.tsx
git commit -m "feat(import): ImageImportModal with disclosure, picker, loading, error states"
```

---

### Task 12: Wire the button into Toolbar

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`

**Work from:** `/Users/jenniferkleiman/Documents/GitHub/etd`

- [ ] **Step 1: Find the existing "Load diagram" button to position the new one beside it**

```bash
grep -n "handleLoad\|Load diagram" src/components/Toolbar/Toolbar.tsx
```

Note the line number for `onClick={handleLoad}`. The "Import image" button should be rendered next to it in the JSX.

- [ ] **Step 2: Add state + handler at the top of the `Toolbar` component**

Inside `Toolbar` function body, after the existing `useState` calls, add:

```tsx
const [importModalOpen, setImportModalOpen] = useState(false);
```

- [ ] **Step 3: Render the modal somewhere stable in the JSX**

At the bottom of the `Toolbar` component's `return`, just before the closing tag, add:

```tsx
<ImageImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
```

- [ ] **Step 4: Add the "Import image" button next to the existing "Load diagram" button**

Find the JSX block that renders `Load diagram` (with `onClick={handleLoad}`). Add a sibling button directly after it:

```tsx
<button
  onClick={() => setImportModalOpen(true)}
  className="..."  /* match the Load diagram button's className exactly */
  title="Import diagram from image"
>
  <ImagePlus size={16} />
  Import image
</button>
```

Use whatever className the neighboring `Load diagram` button uses for consistency. `ImagePlus` is from `lucide-react`; add it to the existing imports if missing:

```tsx
import { ImagePlus, /* existing icons */ } from 'lucide-react';
```

Add the modal import at the top of the file:

```tsx
import { ImageImportModal } from './ImageImportModal';
```

- [ ] **Step 5: Typecheck + lint + tests**

```bash
npm run build
npm run lint
npm test
```

Expected: build clean, no new lint errors in Toolbar.tsx, all 86 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "feat(toolbar): wire ImageImportModal to a new Import image button"
```

---

## Phase C — Deploy + end-to-end smoke

### Task 13: Deploy to jenkleiman.com + manual verification

This task is manual. No code changes, no commits beyond the deploy commit.

- [ ] **Step 1: Build ETD**

Run from `/Users/jenniferkleiman/Documents/GitHub/etd`:

```bash
npm run build
```

- [ ] **Step 2: Copy dist to jenkleiman.com**

```bash
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
```

- [ ] **Step 3: Commit + push jenkleiman.com**

```bash
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: image-to-JSON import"
git push
```

Wait for Netlify deploy.

- [ ] **Step 4: Manual smoke test in production**

Open https://jenkleiman.com/tools/etd/ in a fresh browser tab (or clear localStorage for the existing one).

Verify each:

1. Click "Import image" — disclosure modal appears.
2. Click "Cancel" — modal closes. Click "Import image" again — disclosure reappears.
3. Click "Continue" → file picker. Refresh, click "Import image" → no disclosure (acked).
4. Pick `~/Downloads/IMG_3630.HEIC` (or `~/Documents/GitHub/etd/IMG_3630.HEIC`) — loading state shows. After ~10–30s, modal closes and a diagram appears.
5. Compare loaded diagram against `~/Documents/GitHub/etd/IMG_3630.json` — same approximate structure (≥ 15 elements, some connections).
6. Reload page, pick `IMG_3632.HEIC` — also works.
7. Pick a random non-ETD photo from `~/Downloads` — error modal appears with "model couldn't read this image" or similar; no editor crash.
8. Open dev tools → Network tab → trigger an import → confirm the request hits `https://jenkleiman.com/.netlify/functions/etd-image-import`.
9. While extraction is in progress, click Cancel — modal returns to picker, no diagram change.
10. Try a > 8 MB image (e.g., copy + duplicate any photo until it exceeds 8 MB) — error modal says "Image is too large" without ever calling the Function (check Network tab).

- [ ] **Step 5: (Optional) Rate-limit check**

In the Netlify dashboard, open Blobs → `etd-rate-limit` and inspect the stored value for your hashed IP. Manually set count to 20 to test the 429 branch. After verifying, delete the blob to reset.

- [ ] **Step 6: Mark complete**

If all 10 manual checks pass, this task is done. If any fail, fix and re-deploy.

---

## Notes for the implementer

- **Test discipline.** Each leaf module (schema, rateLimit, gemini, client helper) is fully unit-tested with TDD. The handler is integration-tested via injected dependencies. UI components are smoke-tested manually — fine for v1 given the modal's simplicity.
- **No `any` types** outside the explicit places noted (the dependency-injection seams in the handler accept opaque mock types).
- **Don't touch existing schema files** in `src/types/`. The Zod schema in `importedDiagramSchema.ts` mirrors them but lives separately so future changes to either side don't cascade.
- **Backend test runner.** jenkleiman.com uses vitest. Run `npx vitest run <path>` for a single file or `npm test` for the suite.
- **The Function is reachable at the same domain as the deployed app.** Same-origin during local dev requires `netlify dev`; for v1 we test against the deployed Function rather than running it locally.
- **GEMINI_API_KEY is set in Netlify dashboard manually** — Task 7 step 3. It's not in any repo file.
- **HEIC handling.** Gemini's API accepts HEIC natively. We pass the bytes through with the correct MIME. No `heic-convert` needed for v1 even though jenkleiman.com has the dep.
- **Don't bump `SAVE_SCHEMA_VERSION`** in `src/utils/schema.ts`. The Function returns version `"1.4"` — same as current; no breaking change.
