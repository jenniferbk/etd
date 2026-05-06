# Text-friendly implicit cloud shape — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ellipse-based implicit-element cloud renderer with an adaptive scalloped rectangle, driven by one path-string generator that powers both the Konva canvas and the SVG export.

**Architecture:** A new pure module `src/utils/cloudPath.ts` exports `generateCloudPath(width, height): string` returning an SVG path-data string of arcs. Konva's `<Path>` consumes it directly; `svgExport.ts` embeds it in a `<path>` element. Geometry uses simultaneous-equation solution so each bump's apex lies on the bbox edge and adjacent sides' chords meet flush at corners (no corner connectors needed).

**Tech Stack:** TypeScript, React 19, react-konva, Vite. Vitest is added in Task 1 for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-06-implicit-cloud-text-friendly-design.md`

---

## Task 1: Add Vitest test framework

The codebase has no test framework today. Spec calls for unit tests on `cloudPath.ts`, so we add Vitest as a one-time infrastructure step. Vitest is the standard choice for Vite projects and reuses `vite.config.ts` automatically.

**Files:**
- Modify: `package.json` (add devDeps + scripts)
- Modify: `package-lock.json` (auto-updated by npm)

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest@^2.1.0
```

Expected: package.json gains `"vitest"` under `devDependencies`. No other dependencies should change. (Note: `package-lock.json` may already have a tiny pending change from a prior npm op — that's fine, it gets rolled in.)

- [ ] **Step 2: Add test scripts**

Edit `package.json` so the `"scripts"` block reads:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create a smoke test to confirm Vitest works**

Create `src/utils/cloudPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('cloudPath smoke', () => {
  it('test runner is alive', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `npm test`
Expected output: `1 passed`. The test runner picks up `src/utils/cloudPath.test.ts` and executes the smoke test successfully.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/cloudPath.test.ts
git commit -m "chore(test): add vitest with smoke test for cloudPath"
```

---

## Task 2: Write failing tests for `generateCloudPath`

TDD red phase: encode the spec's testing requirements as Vitest assertions before any implementation exists.

**Files:**
- Modify: `src/utils/cloudPath.test.ts`

- [ ] **Step 1: Replace the smoke test with the real test suite**

Overwrite `src/utils/cloudPath.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { generateCloudPath, computeCloudGeometry } from './cloudPath';

function countCommand(path: string, cmd: string): number {
  return (path.match(new RegExp(`\\b${cmd}\\b`, 'g')) ?? []).length;
}

describe('generateCloudPath', () => {
  it('returns a non-empty string starting with M and ending with Z', () => {
    const path = generateCloudPath(140, 60);
    expect(path.length).toBeGreaterThan(0);
    expect(path.trim().startsWith('M')).toBe(true);
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('emits 2 * (longBumps + shortBumps) arc commands at default 140x60', () => {
    const geom = computeCloudGeometry(140, 60);
    const path = generateCloudPath(140, 60);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('emits the right arc count for square 80x80', () => {
    const geom = computeCloudGeometry(80, 80);
    const path = generateCloudPath(80, 80);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('emits the right arc count for tall 60x140', () => {
    const geom = computeCloudGeometry(60, 140);
    const path = generateCloudPath(60, 140);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('produces structurally equivalent paths for 140x60 and 60x140 (rotational symmetry)', () => {
    const wide = computeCloudGeometry(140, 60);
    const tall = computeCloudGeometry(60, 140);
    expect(wide.longBumps).toBe(tall.longBumps);
    expect(wide.shortBumps).toBe(tall.shortBumps);
    expect(wide.longRadius).toBeCloseTo(tall.longRadius, 6);
    expect(wide.shortRadius).toBeCloseTo(tall.shortRadius, 6);
    expect(wide.isWide).toBe(true);
    expect(tall.isWide).toBe(false);
  });

  it('clamps long-side bump count at floor (4) for small sizes', () => {
    const geom = computeCloudGeometry(60, 30);
    expect(geom.longBumps).toBe(4);
    expect(geom.shortBumps).toBe(1);
  });

  it('clamps long-side bump count at ceiling (12) for very wide sizes', () => {
    const geom = computeCloudGeometry(400, 100);
    expect(geom.longBumps).toBe(12);
  });

  it('clamps short-side bump count at ceiling (4) for tall+wide sizes', () => {
    const geom = computeCloudGeometry(400, 200);
    expect(geom.shortBumps).toBe(4);
  });

  it('keeps every arc apex within the bbox plus 3px tolerance', () => {
    // Walk the path and check that arc apex points (computed from each arc command)
    // stay within [-3, width+3] x [-3, height+3].
    const w = 140, h = 60;
    const path = generateCloudPath(w, h);
    const tokens = path.split(/\s+/);
    let i = 0, x = 0, y = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === 'M') {
        x = parseFloat(tokens[i + 1]);
        y = parseFloat(tokens[i + 2]);
        i += 3;
      } else if (t === 'A') {
        // A rx ry xrot lf sf x y
        const ex = parseFloat(tokens[i + 6]);
        const ey = parseFloat(tokens[i + 7]);
        // Endpoints must lie within bbox + tolerance
        expect(ex).toBeGreaterThanOrEqual(-3);
        expect(ex).toBeLessThanOrEqual(w + 3);
        expect(ey).toBeGreaterThanOrEqual(-3);
        expect(ey).toBeLessThanOrEqual(h + 3);
        x = ex;
        y = ey;
        i += 8;
      } else if (t === 'Z' || t === '') {
        i += 1;
      } else {
        i += 1;
      }
    }
  });
});
```

- [ ] **Step 2: Run tests, verify they all fail**

Run: `npm test`
Expected: all 9 tests fail with import errors — `generateCloudPath` and `computeCloudGeometry` are not yet exported from `./cloudPath`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/utils/cloudPath.test.ts
git commit -m "test(cloudPath): add failing tests for generateCloudPath geometry"
```

---

## Task 3: Implement `generateCloudPath`

Build the geometry generator. Solve simultaneous equations so each bump's apex lies on the bbox edge and adjacent sides' chord endpoints meet at the inset rectangle corners (no corner connectors needed).

**Files:**
- Create: `src/utils/cloudPath.ts`
- Test: `src/utils/cloudPath.test.ts` (no edit; existing tests drive this task)

- [ ] **Step 1: Create the module with the geometry algorithm**

Create `src/utils/cloudPath.ts`:

```ts
// Adaptive scalloped-rectangle path generator for implicit-element clouds.
// Used by both the Konva canvas (ArgumentShape.CloudShape) and SVG export.

export const TARGET_ARC = 20;          // ~ pixels of side per bump
export const MIN_LONG = 4;
export const MAX_LONG = 12;
export const MIN_SHORT = 1;
export const MAX_SHORT = 4;
export const SHORT_BUMP_FACTOR = 0.5;  // short side gets fewer bumps than long side
export const MIN_BUMP_RADIUS = 2;      // safety floor for extreme aspect ratios

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface CloudGeometry {
  longBumps: number;
  shortBumps: number;
  longRadius: number;
  shortRadius: number;
  isWide: boolean;
}

export function computeCloudGeometry(width: number, height: number): CloudGeometry {
  const isWide = width >= height;
  const longLen = Math.max(width, height);
  const shortLen = Math.min(width, height);

  const longBumps = clamp(
    Math.round(longLen / TARGET_ARC),
    MIN_LONG,
    MAX_LONG,
  );
  const shortBumps = clamp(
    Math.round((shortLen / TARGET_ARC) * SHORT_BUMP_FACTOR),
    MIN_SHORT,
    MAX_SHORT,
  );

  // Solve so each bump's apex lies on the bbox edge and adjacent sides' chord
  // endpoints meet exactly at the inset rectangle corners.
  //   2 * longBumps  * longRadius  + 2 * shortRadius = longLen
  //   2 * longRadius + 2 * shortBumps * shortRadius  = shortLen
  const denom = 2 * (longBumps * shortBumps - 1);
  let longRadius = (shortBumps * longLen - shortLen) / denom;
  let shortRadius = (longBumps * shortLen - longLen) / denom;

  // Floor for extreme aspect ratios where shortRadius would otherwise go
  // negative (longLen / shortLen > ~longBumps in the worst case).
  longRadius = Math.max(longRadius, MIN_BUMP_RADIUS);
  shortRadius = Math.max(shortRadius, MIN_BUMP_RADIUS);

  return { longBumps, shortBumps, longRadius, shortRadius, isWide };
}

export function generateCloudPath(width: number, height: number): string {
  const { longBumps, shortBumps, longRadius, shortRadius, isWide } =
    computeCloudGeometry(width, height);

  // Map orientation onto the four sides.
  // Wide: top/bottom = long, left/right = short.
  // Tall: top/bottom = short, left/right = long.
  const topBumps   = isWide ? longBumps  : shortBumps;
  const topRadius  = isWide ? longRadius : shortRadius;
  const sideBumps  = isWide ? shortBumps : longBumps;
  const sideRadius = isWide ? shortRadius : longRadius;

  // Inset rectangle: corners are where adjacent sides' chord-levels meet.
  const left   = sideRadius;
  const right  = width - sideRadius;
  const top    = topRadius;
  const bottom = height - topRadius;

  const fmt = (n: number) => Number(n.toFixed(3));
  const parts: string[] = [];
  parts.push(`M ${fmt(left)} ${fmt(top)}`);

  // Top edge: arcs going right.
  for (let i = 0; i < topBumps; i++) {
    const x = left + (i + 1) * 2 * topRadius;
    parts.push(`A ${fmt(topRadius)} ${fmt(topRadius)} 0 0 1 ${fmt(x)} ${fmt(top)}`);
  }
  // Right edge: arcs going down.
  for (let i = 0; i < sideBumps; i++) {
    const y = top + (i + 1) * 2 * sideRadius;
    parts.push(`A ${fmt(sideRadius)} ${fmt(sideRadius)} 0 0 1 ${fmt(right)} ${fmt(y)}`);
  }
  // Bottom edge: arcs going left.
  for (let i = 0; i < topBumps; i++) {
    const x = right - (i + 1) * 2 * topRadius;
    parts.push(`A ${fmt(topRadius)} ${fmt(topRadius)} 0 0 1 ${fmt(x)} ${fmt(bottom)}`);
  }
  // Left edge: arcs going up.
  for (let i = 0; i < sideBumps; i++) {
    const y = bottom - (i + 1) * 2 * sideRadius;
    parts.push(`A ${fmt(sideRadius)} ${fmt(sideRadius)} 0 0 1 ${fmt(left)} ${fmt(y)}`);
  }

  parts.push('Z');
  return parts.join(' ');
}
```

- [ ] **Step 2: Run tests, verify all pass**

Run: `npm test`
Expected: all 9 tests pass. If a clamp test fails, double-check `TARGET_ARC`, `SHORT_BUMP_FACTOR`, and the `Math.round` call — at 60×30, `30/20 * 0.5 = 0.75`, `round(0.75) = 1`, then clamped to MIN_SHORT=1. At 400×100, `400/20 = 20`, clamped to MAX_LONG=12.

- [ ] **Step 3: Run the typecheck to confirm no TS errors**

Run: `npm run build`
Expected: build succeeds (this runs `tsc -b && vite build`). If TS errors appear, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/utils/cloudPath.ts
git commit -m "feat(cloud): add generateCloudPath geometry generator"
```

---

## Task 4: Replace Konva CloudShape implementation

Switch the canvas render from `<Line>` with sampled points to `<Path>` driven by `generateCloudPath`. Update the selection outline to use a Konva scale transform on the same path (preserves bump pattern). Reduce text padding from 18 to 12.

**Files:**
- Modify: `src/components/Canvas/shapes/ArgumentShape.tsx`

- [ ] **Step 1: Update imports**

In `src/components/Canvas/shapes/ArgumentShape.tsx`, change line 1 from:

```ts
import { Group, Rect, Ellipse, Text, Line } from 'react-konva';
```

to:

```ts
import { Group, Rect, Ellipse, Text, Line, Path } from 'react-konva';
import { generateCloudPath } from '../../../utils/cloudPath';
```

(Keep `Line` — other code in the file may still use it. We'll trim unused imports at the end of this task.)

- [ ] **Step 2: Reduce cloud padding**

Find the line that reads (around `ArgumentShape.tsx:48`):

```ts
const padding = isCloud ? 18 : 10;
```

Replace with:

```ts
const padding = isCloud ? 12 : 10;
```

- [ ] **Step 3: Replace `CloudShape` body and remove `generateThoughtBubblePath`**

Find the block starting at the comment `// Generate thought bubble path using absolute cosine modulation` (around line 265) through the end of the `CloudShape` function (around line 366). That block contains: `generateThoughtBubblePath`, the `CloudShapeProps` interface, and the `CloudShape` function.

Replace the entire block with:

```tsx
interface CloudShapeProps {
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  isSelected: boolean;
}

const SELECTION_INFLATE = 0.08;

function CloudShape({
  width,
  height,
  stroke,
  strokeWidth,
  fill,
  isSelected,
}: CloudShapeProps) {
  const cloudPath = generateCloudPath(width, height);

  return (
    <>
      <Path
        data={cloudPath}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {isSelected && (
        <Path
          data={cloudPath}
          scaleX={1 + SELECTION_INFLATE}
          scaleY={1 + SELECTION_INFLATE}
          x={-(width * SELECTION_INFLATE) / 2}
          y={-(height * SELECTION_INFLATE) / 2}
          stroke="#4A90D9"
          strokeWidth={2}
          dash={[5, 3]}
          fill=""
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Check for unused imports**

Search the file for any remaining usage of `Line`. Run:

```bash
grep -n "Line" src/components/Canvas/shapes/ArgumentShape.tsx
```

Expected: matches only on the `import` line. If there are no other usages, remove `Line` from the import statement on line 1:

```ts
import { Group, Rect, Ellipse, Text, Path } from 'react-konva';
```

If `Line` is still used elsewhere in the file, keep it in the import.

- [ ] **Step 5: Build and typecheck**

Run: `npm run build`
Expected: build succeeds. Fix any TS errors before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/components/Canvas/shapes/ArgumentShape.tsx
git commit -m "feat(cloud): render implicit elements via generateCloudPath"
```

---

## Task 5: Update SVG export to emit a real cloud path

Replace the rounded-rect stand-in with a `<path>` element using the same generator.

**Files:**
- Modify: `src/utils/svgExport.ts:150-154`

- [ ] **Step 1: Add import**

At the top of `src/utils/svgExport.ts`, after the existing imports, add:

```ts
import { generateCloudPath } from './cloudPath';
```

(If there's an alphabetized import block, insert it in the right spot.)

- [ ] **Step 2: Replace the cloud branch**

Find the block in `svgExport.ts:150-154`:

```ts
  if (style.borderShape === 'cloud') {
    // Cloud approximation for SVG export — the canvas renders a true cloud via
    // Konva paths but exporting that is out of scope. A thick rounded rect is
    // immediately recognizable as a cloud stand-in.
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" ry="20" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else if (style.borderShape === 'ellipse') {
```

Replace with:

```ts
  if (style.borderShape === 'cloud') {
    const cloudPath = generateCloudPath(width, height);
    shapeElement = `<path d="${cloudPath}" transform="translate(${x},${y})" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else if (style.borderShape === 'ellipse') {
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all 9 tests still pass (no regression in `cloudPath` module).

- [ ] **Step 5: Commit**

```bash
git add src/utils/svgExport.ts
git commit -m "feat(cloud): SVG export emits real cloud path, drops rounded-rect fallback"
```

---

## Task 6: Manual browser verification

Visual checks against the spec's "Manual verification" section. The implementation work is done; this task is a sign-off.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Vite server starts at `http://localhost:5173/tools/etd/`. Open it in a browser.

- [ ] **Step 2: Verify default cloud at 140×60**

In the editor, drop a new Implicit element on the canvas (or load an existing diagram with one). At default size (140×60), confirm:

- The cloud reads as a wider-than-tall scalloped rectangle (not a circle).
- ~7 bumps along the top, ~7 along the bottom, ~2 each on left/right.
- Short-side bumps are visibly larger than long-side bumps.
- Text inside the cloud has noticeably more horizontal room than before (padding dropped from 18 to 12).

- [ ] **Step 3: Resize to tall (50×120)**

Resize the implicit element so it's taller than wide. Confirm:

- Bigger bumps are now on top/bottom (the short sides), smaller bumps on left/right (the long sides).
- The shape still reads as a cloud, not visually broken.

- [ ] **Step 4: Resize to square (90×90)**

Resize to roughly square. Confirm the four sides have visually balanced bump counts and radii — no asymmetric weirdness.

- [ ] **Step 5: Resize to small (60×30)**

Confirm the floors kick in: 4 bumps per long side, 1 per short side. Pinched but still legible.

- [ ] **Step 6: Verify connector attachment unchanged**

Connect a warrant or data arrow to the implicit cloud. Confirm:

- The connector endpoint lands on the cloud's bounding-box edge as before.
- No visible regression — the new bbox-inset behavior shouldn't change connector hit-test.

- [ ] **Step 7: Verify SVG export**

Trigger SVG export from the app. Open the downloaded `.svg` file in a browser (or text editor). Confirm:

- The implicit cloud renders as a real scalloped path, not a rounded rectangle.
- Search the file for `<path d="M`. The cloud shape's path data should be present.
- The exported SVG visual matches the on-canvas rendering.

- [ ] **Step 8: Verify legend swatch unchanged**

Open the legend in the editor. Confirm the implicit (cloud) swatch looks the same as before — `Legend.tsx` was intentionally not modified.

- [ ] **Step 9: If everything looks right, commit a no-op verification marker (optional)**

Skip this step if all observations matched expectations. If you noticed any regression that needed a fix, that fix gets its own commit; loop back to the relevant earlier task.

- [ ] **Step 10: Deploy to jenkleiman.com (per CLAUDE.md)**

Per the project's CLAUDE.md deployment workflow:

```bash
npm run build
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: text-friendly implicit cloud shape"
git push
```

This step requires the user's approval to push to a separate repo — confirm with the user before running.

---

## Notes for the implementer

- The simultaneous-equation solution in `computeCloudGeometry` produces non-negative `longRadius` and `shortRadius` for any aspect ratio under ~10:1 with the default constants. Beyond that, the `MIN_BUMP_RADIUS = 2` floor kicks in and the visual gracefully degrades.
- `generateCloudPath` is a pure function — no React, no Konva imports — so unit-testing it in Vitest with no DOM works fine.
- If tests pass but the canvas render looks wrong, double-check that `Path` is imported from `react-konva` (not raw `konva`) and that `data={cloudPath}` is a string (not points/array).
- The selection outline's `SELECTION_INFLATE = 0.08` (8%) is a tunable. If it looks too tight or too generous in practice, adjust on the spot — no plan revision needed.
