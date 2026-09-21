# Counterclaim Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `counterclaim` connection type that renders as a plain line with a midpoint slash (no arrowhead) on canvas and in every export, flippable from the properties panel and the connection context menu.

**Architecture:** `Connection.type` widens to `'support' | 'counterclaim'`; a pure `counterclaimSlash(points)` helper in `utils/connectionPath.ts` gives canvas (`Arrow.tsx`) and SVG export the same slash geometry; claim-role derivation skips counterclaim edges; a new store action `setConnectionType` is the only mutation. Everything else (routing, waypoints, anchors, undo) is untouched.

**Tech Stack:** React 18 + TypeScript, react-konva (Konva 10), Zustand + zundo, Zod, vitest (Node environment, `src/**/*.test.ts` only — no `.tsx` tests, no jsdom).

**Spec:** `docs/superpowers/specs/2026-09-21-counterclaim-and-analytic-notes-design.md` §2 (this plan) — §3 is implemented by `2026-09-21-analytic-notes.md`, which depends on this plan being merged first.

## Global Constraints

- Work on branch `feature/counterclaim-and-analytic-notes` (already created; spec is committed there).
- `SAVE_SCHEMA_VERSION` becomes `'1.7'` (additive; shared with the notes plan — do not bump again there).
- Verification recipe (from memory `etd-repo-quirks`): `npm run lint` must add **zero new** problems (pre-existing baseline ≈ 17 in `ImageImportModal.tsx`, `imageImport.test.ts`, `orthogonalRouting.ts`); `npx tsc -b` (there is **no** `npm run typecheck` at root); `npm test`; `npm run build`.
- Slash geometry: 16 px long, centred on the polyline midpoint (`t = 0.5`), rotated 60° from the segment it sits on so it reads as `/` on a left→right horizontal run.
- Copy, verbatim: properties toggle labels `Support` / `Counterclaim`; context-menu items `Mark as counterclaim` / `Mark as support`; legend row `Counterclaim`; DiagramMix toast `Counterclaim slashes were dropped — DiagramMix has no equivalent marker.`
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `src/types/connections.ts` | widen `ConnectionType` |
| `src/utils/schema.ts` | version `1.7` |
| `src/store/diagramStore.ts` | `setConnectionType(id, type)` |
| `src/utils/claimRoleDerivation.ts` | skip counterclaim edges |
| `src/utils/connectionPath.ts` | `counterclaimSlash(points)` (+ new test file `connectionPath.test.ts`) |
| `src/components/Canvas/shapes/Arrow.tsx` | no arrowhead + slash; `onContextMenu` prop |
| `src/utils/svgExport.ts` | no `marker-end` + slash `<line>` (+ new test file `svgExport.test.ts`) |
| `src/components/Properties/PropertiesPanel.tsx` | Support / Counterclaim toggle |
| `src/components/Canvas/ContextMenu.tsx`, `src/components/Canvas/Canvas.tsx` | right-click on a line → toggle |
| `src/components/Canvas/shapes/Legend.tsx` | `Counterclaim` row with line+slash swatch |
| `src/utils/diagramxExport.ts`, `src/utils/importedDiagramSchema.ts`, `src/components/Toolbar/Toolbar.tsx` | DiagramMix no-arrowhead + warning; import accepts both types (+ new test file `diagramxExport.test.ts`) |
| `docs/REQUIREMENTS.md` | §3.1 arrow-types table row |

---

### Task 1: Type, store action, schema bump

**Files:**
- Modify: `src/types/connections.ts:7`
- Modify: `src/utils/schema.ts:4`
- Modify: `src/store/diagramStore.ts` (imports ~line 3–8; interface ~line 118–123; implementation after `resetConnectionRouting` ~line 499–509)
- Test: `src/store/diagramStore.test.ts` (append)

**Interfaces:**
- Produces: `type ConnectionType = 'support' | 'counterclaim'` (exported from `src/types`); store action `setConnectionType: (id: string, type: ConnectionType) => void`.

- [ ] **Step 1: Write the failing test**

Append to `src/store/diagramStore.test.ts` (the file already imports `Connection` and defines `arg()`):

```ts
describe('setConnectionType', () => {
  it('flips a connection between support and counterclaim', () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b')],
      connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.getState().setConnectionType('c1', 'counterclaim');
    expect(useDiagramStore.getState().connections[0].type).toBe('counterclaim');
    useDiagramStore.getState().setConnectionType('c1', 'support');
    expect(useDiagramStore.getState().connections[0].type).toBe('support');
  });

  it('preserves routing fields and leaves other connections untouched', () => {
    const c1: Connection = {
      id: 'c1', from: 'a', to: 'b', type: 'support',
      waypoints: [{ x: 50, y: 50 }], fromAnchor: { edge: 'right', t: 0.5 },
    };
    const c2: Connection = { id: 'c2', from: 'b', to: 'a', type: 'support' };
    useDiagramStore.setState({ elements: [arg('a'), arg('b')], connections: [c1, c2] });
    useDiagramStore.getState().setConnectionType('c1', 'counterclaim');
    const [n1, n2] = useDiagramStore.getState().connections;
    expect(n1).toEqual({ ...c1, type: 'counterclaim' });
    expect(n2).toBe(c2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/store/diagramStore.test.ts -t setConnectionType`
Expected: FAIL — TypeScript/runtime error that `setConnectionType` is not a function and `'counterclaim'` is not assignable to `ConnectionType`.

- [ ] **Step 3: Widen the type and bump the schema version**

`src/types/connections.ts` line 7:

```ts
export type ConnectionType = 'support' | 'counterclaim';
```

`src/utils/schema.ts` line 4:

```ts
export const SAVE_SCHEMA_VERSION = '1.7';
```

- [ ] **Step 4: Add the store action**

In `src/store/diagramStore.ts`, add `ConnectionType` to the type import from `'../types'` (the block starting `import type {` at line 3). In the `DiagramState` interface, under `// Actions - Connections`, add after `resetConnectionRouting`:

```ts
  setConnectionType: (id: string, type: ConnectionType) => void;
```

In the implementation, directly after the `resetConnectionRouting` action (after its closing `})),`), add:

```ts
      setConnectionType: (id, type) =>
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.id === id ? { ...conn, type } : conn,
          ),
        })),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/store/diagramStore.test.ts`
Expected: PASS (all describes, including the two new tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors (nothing else references `ConnectionType` restrictively yet).

```bash
git add src/types/connections.ts src/utils/schema.ts src/store/diagramStore.ts src/store/diagramStore.test.ts
git commit -m "feat(connections): counterclaim connection type + setConnectionType; schema 1.7

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Claim-role derivation ignores counterclaim edges

**Files:**
- Modify: `src/utils/claimRoleDerivation.ts:36-47`
- Test: `src/utils/claimRoleDerivation.test.ts` (append)

**Interfaces:**
- Consumes: `ConnectionType` widened in Task 1.
- Produces: unchanged signature `getClaimRole(claim, connections, elementsById)`; behaviour: a `counterclaim` edge never contributes to `data` or `warrant` roles.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/claimRoleDerivation.test.ts` (helpers `claim`, `elementsById`, `elemConn` already exist there):

```ts
describe('getClaimRole ignores counterclaim links', () => {
  it('a claim→claim counterclaim does not make the source a data-claim', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const conns: Connection[] = [{ id: 'cc', from: '1', to: '2', type: 'counterclaim' }];
    expect(getClaimRole(c1, conns, elementsById([c1, c2]))).toBe('plain');
  });

  it('a counterclaim attached to a line does not make the source a warrant-claim', () => {
    const c1 = claim('1');
    const conns: Connection[] = [
      elemConn('base', 'd', 'x'),
      { id: 'cc', from: '1', to: { connectionId: 'base', position: 0.5 }, type: 'counterclaim' },
    ];
    expect(getClaimRole(c1, conns, elementsById([c1]))).toBe('plain');
  });

  it('a support link alongside a counterclaim still derives the role from the support link', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const c3 = claim('3');
    const conns: Connection[] = [
      { id: 'cc', from: '1', to: '2', type: 'counterclaim' },
      elemConn('s', '1', '3'),
    ];
    expect(getClaimRole(c1, conns, elementsById([c1, c2, c3]))).toBe('data');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/claimRoleDerivation.test.ts -t "ignores counterclaim"`
Expected: FAIL — first test receives `'data'`, second receives `'warrant'`.

- [ ] **Step 3: Skip counterclaim edges in the loop**

In `src/utils/claimRoleDerivation.ts`, inside `for (const c of connections)`, immediately after `if (c.from !== claim.id) continue;` add:

```ts
    // A counterclaim is a symmetric "these two claims conflict" mark, not an
    // inference — it never makes the source a data- or warrant-claim.
    if (c.type === 'counterclaim') continue;
```

Also extend the header comment block (top of file) with one line under the role list:

```ts
//   - Counterclaim connections are ignored entirely: they mark conflict, not
//     inference, so they never change a claim's derived role.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/claimRoleDerivation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/claimRoleDerivation.ts src/utils/claimRoleDerivation.test.ts
git commit -m "feat(claims): counterclaim links do not change a claim's derived role

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `counterclaimSlash` geometry helper

**Files:**
- Modify: `src/utils/connectionPath.ts` (imports at top; append helper at bottom)
- Create: `src/utils/connectionPath.test.ts`

**Interfaces:**
- Consumes: `getPointOnPolyline(points, t)` and `getSegments(points)` from `./orthogonalRouting` (both already exported).
- Produces: `export const COUNTERCLAIM_SLASH_LENGTH = 16`; `export function counterclaimSlash(points: number[]): [number, number, number, number] | null` — flat `[x1, y1, x2, y2]` in the same coordinate space as `points`, or `null` when `points.length < 4`. Used by Task 4 (canvas) and Task 5 (SVG).

- [ ] **Step 1: Write the failing tests**

Create `src/utils/connectionPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COUNTERCLAIM_SLASH_LENGTH, counterclaimSlash } from './connectionPath';

function centre(s: [number, number, number, number]) {
  return { x: (s[0] + s[2]) / 2, y: (s[1] + s[3]) / 2 };
}
function length(s: [number, number, number, number]) {
  return Math.hypot(s[2] - s[0], s[3] - s[1]);
}

describe('counterclaimSlash', () => {
  it('returns null for fewer than two points', () => {
    expect(counterclaimSlash([])).toBeNull();
    expect(counterclaimSlash([10, 10])).toBeNull();
  });

  it('draws a "/" centred on a left→right horizontal run', () => {
    const s = counterclaimSlash([0, 100, 200, 100])!;
    expect(centre(s).x).toBeCloseTo(100);
    expect(centre(s).y).toBeCloseTo(100);
    expect(length(s)).toBeCloseTo(COUNTERCLAIM_SLASH_LENGTH);
    // Screen coordinates (y grows downward): "/" runs bottom-left → top-right.
    const [x1, y1, x2, y2] = s;
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeLessThan(y1);
    // 60° from horizontal → the slash is taller than it is wide.
    expect(Math.abs(y2 - y1)).toBeGreaterThan(Math.abs(x2 - x1));
  });

  it('is the same mark on a right→left horizontal run', () => {
    const forward = counterclaimSlash([0, 100, 200, 100])!;
    const backward = counterclaimSlash([200, 100, 0, 100])!;
    // Same two endpoints, possibly swapped.
    const asSet = (s: number[]) => [[s[0], s[1]], [s[2], s[3]]].sort((a, b) => a[0] - b[0]).flat();
    expect(asSet(backward).map((v) => +v.toFixed(6))).toEqual(asSet(forward).map((v) => +v.toFixed(6)));
  });

  it('rotates with a vertical run (60° off vertical → wider than tall)', () => {
    const s = counterclaimSlash([100, 0, 100, 200])!;
    expect(centre(s).x).toBeCloseTo(100);
    expect(centre(s).y).toBeCloseTo(100);
    expect(length(s)).toBeCloseTo(COUNTERCLAIM_SLASH_LENGTH);
    expect(Math.abs(s[2] - s[0])).toBeGreaterThan(Math.abs(s[3] - s[1]));
  });

  it('sits on the segment that contains the midpoint of a Z-elbow', () => {
    // 20 right, 200 down, 20 right → total 240; midpoint (120) is on the vertical run at (20, 100).
    const s = counterclaimSlash([0, 0, 20, 0, 20, 200, 40, 200])!;
    expect(centre(s).x).toBeCloseTo(20);
    expect(centre(s).y).toBeCloseTo(100);
    expect(Math.abs(s[2] - s[0])).toBeGreaterThan(Math.abs(s[3] - s[1]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/connectionPath.test.ts`
Expected: FAIL — `counterclaimSlash` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/utils/connectionPath.ts`, change the import from `./orthogonalRouting` to:

```ts
import {
  computeConnectionPath,
  getPointOnPolyline,
  getSegments,
  getVerticalAttachmentPath,
} from './orthogonalRouting';
```

Append at the end of the file:

```ts
export const COUNTERCLAIM_SLASH_LENGTH = 16;
// Angle between the slash and the segment it crosses. 60° reads as "/" on a
// horizontal run without looking like a perpendicular tick.
const COUNTERCLAIM_SLASH_ANGLE = Math.PI / 3;

// The segment of `points` that contains the point at fraction `t` of the
// total polyline length. Mirrors getPointOnPolyline's walk so both agree.
function segmentContaining(points: number[], t: number) {
  const segs = getSegments(points);
  const lengths = segs.map((s) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const target = t * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    acc += lengths[i];
    if (lengths[i] > 0 && acc >= target) return segs[i];
  }
  return segs[segs.length - 1];
}

/**
 * Slash marker for a counterclaim connection: a COUNTERCLAIM_SLASH_LENGTH line
 * centred on the polyline midpoint, rotated 60° from the segment it sits on.
 * Returns flat [x1, y1, x2, y2] in the polyline's coordinate space, or null
 * when the polyline has fewer than two points. Shared by Arrow.tsx and
 * svgExport.ts so canvas and export draw the identical mark.
 */
export function counterclaimSlash(points: number[]): [number, number, number, number] | null {
  if (points.length < 4) return null;
  const mid = getPointOnPolyline(points, 0.5);
  const seg = segmentContaining(points, 0.5);
  const segAngle = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x);
  // Subtracting the angle leans the mark up-right on a left→right run — "/"
  // in screen coordinates, where y grows downward.
  const a = segAngle - COUNTERCLAIM_SLASH_ANGLE;
  const half = COUNTERCLAIM_SLASH_LENGTH / 2;
  const dx = Math.cos(a) * half;
  const dy = Math.sin(a) * half;
  return [mid.x - dx, mid.y - dy, mid.x + dx, mid.y + dy];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/connectionPath.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/connectionPath.ts src/utils/connectionPath.test.ts
git commit -m "feat(connections): counterclaimSlash geometry helper shared by canvas and SVG

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Canvas rendering (no arrowhead, slash) + right-click hook on lines

**Files:**
- Modify: `src/components/Canvas/shapes/Arrow.tsx` (imports lines 6 and 19; `ArrowProps` ~line 87–97; destructuring ~line 104–114; after `const segments = getSegments(pathPoints);` ~line 383; connector `<Line>`s ~line 598–636; arrowhead ~line 762–778)

**Interfaces:**
- Consumes: `counterclaimSlash` (Task 3).
- Produces: `ConnectionArrow` accepts a new optional prop `onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void` (wired by Task 7).

No unit test: Konva rendering needs a browser (vitest runs in Node). Verified by `npx tsc -b` here and the browser walkthrough in Task 10.

- [ ] **Step 1: Merge the two `connectionPath` imports and add the slash helper**

Replace line 6 `import { computePolylineFor } from '../../../utils/connectionPath';` with:

```ts
import { computePolylineFor, counterclaimSlash, getConnectionPathPoints } from '../../../utils/connectionPath';
```

Delete the later duplicate `import { getConnectionPathPoints } from '../../../utils/connectionPath';` (line 19).

- [ ] **Step 2: Add the `onContextMenu` prop**

In `interface ArrowProps` add after `onHover?`:

```ts
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
```

Add `onContextMenu,` to the destructured props of `ConnectionArrow` (after `onHover,`).

- [ ] **Step 3: Compute counterclaim state after the path is known**

Directly after `const segments = getSegments(pathPoints);` add:

```ts
  const isCounterclaim = connection.type === 'counterclaim';
  const slash = isCounterclaim ? counterclaimSlash(pathPoints) : null;
```

- [ ] **Step 4: Wire right-click onto the drawn lines**

On the attachment `<Line points={pathPoints} …>` (the `isAttachment ? (` branch) add the prop `onContextMenu={onContextMenu}` next to `onClick={handleArrowClick}`.

On the per-segment `<Line key={\`seg-${idx}\`} …>` add `onContextMenu={onContextMenu}` next to `onClick={handleArrowClick}`.

- [ ] **Step 5: Suppress the arrowhead and draw the slash**

Change the arrowhead guard from `{!isAttachment && (` to:

```tsx
      {!isAttachment && !isCounterclaim && (
```

Immediately after that arrowhead block's closing `)}`, add:

```tsx
      {/* Counterclaim marker — short slash across the polyline midpoint.
          Same geometry as svgExport via counterclaimSlash. */}
      {slash && (
        <Line
          points={slash}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineCap="round"
          listening={false}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Canvas/shapes/Arrow.tsx
git commit -m "feat(canvas): counterclaim lines render slash and no arrowhead; lines accept onContextMenu

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SVG export

**Files:**
- Modify: `src/utils/svgExport.ts` (import line 14; `renderConnectionSvg` tail ~line 428–447)
- Create: `src/utils/svgExport.test.ts`

**Interfaces:**
- Consumes: `counterclaimSlash` (Task 3); `createCurrentDefaults()` from `./styleConfigDefaults` (exists).
- Produces: counterclaim polylines have no `marker-end`, followed by one `<line … stroke-linecap="round"/>` for the slash. `svgExport.ts` contains no other `stroke-linecap` today, so the test keys on that attribute.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/svgExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { exportToSvg } from './svgExport';
import { createCurrentDefaults } from './styleConfigDefaults';
import type { ArgumentElement, Connection } from '../types';

function claim(id: string, x: number): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: `Claim ${id}`, content: '',
    position: { x, y: 0 }, size: { width: 180, height: 80 },
  };
}

const slashCount = (svg: string) => (svg.match(/stroke-linecap="round"/g) ?? []).length;

describe('exportToSvg connections', () => {
  const els = [claim('1', 0), claim('2', 400)];

  it('support connections keep the arrowhead marker and draw no slash', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(slashCount(svg)).toBe(0);
  });

  it('counterclaim connections drop the arrowhead and add exactly one slash line', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'counterclaim' }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).not.toContain('marker-end=');
    expect(slashCount(svg)).toBe(1);
    expect(svg).toMatch(/<line x1="[-\d.]+" y1="[-\d.]+" x2="[-\d.]+" y2="[-\d.]+" stroke="#333333" stroke-width="2" stroke-linecap="round"\/>/);
  });

  it('a counterclaim attached to another line also gets the slash', () => {
    const w = claim('w', 200);
    const conns: Connection[] = [
      { id: 'base', from: '1', to: '2', type: 'support' },
      { id: 'cc', from: 'w', to: { connectionId: 'base', position: 0.5 }, type: 'counterclaim' },
    ];
    const svg = exportToSvg([...els, w], conns, createCurrentDefaults());
    expect(slashCount(svg)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/svgExport.test.ts`
Expected: the first test passes; the counterclaim tests FAIL (marker present, slash count 0).

- [ ] **Step 3: Implement**

Change line 14 to `import { computePolylineFor, counterclaimSlash } from './connectionPath';`.

In `renderConnectionSvg`, replace everything from `// Warrant-attachment connections render no arrowhead (matches Arrow.tsx).` to the end of the function with:

```ts
  const isCounterclaim = conn.type === 'counterclaim';
  const slash = isCounterclaim ? counterclaimSlash(points) : null;
  const slashSvg = slash
    ? `<line x1="${slash[0] + offsetX}" y1="${slash[1] + offsetY}" x2="${slash[2] + offsetX}" y2="${slash[3] + offsetY}" stroke="#333333" stroke-width="2" stroke-linecap="round"/>`
    : '';

  // Warrant-attachment connections render no arrowhead (matches Arrow.tsx).
  // Warning-state attachments render dashed and faint to signal "no valid attachment".
  if (isArrowAttachment(conn.to)) {
    if (attachmentStyle === 'warning') {
      return `<polyline points="${pointsAttr}" stroke="#A0A0A0" stroke-width="1" stroke-dasharray="4,4" opacity="0.6" fill="none"/>`;
    }
    return `<polyline points="${pointsAttr}" stroke="#333333" stroke-width="2" fill="none"/>${slashSvg}`;
  }

  // Counterclaims are symmetric: no arrowhead, slash at the midpoint.
  const markerEnd = isCounterclaim ? '' : ' marker-end="url(#arrowhead)"';
  return `<polyline points="${pointsAttr}" stroke="#333333" stroke-width="2" fill="none"${markerEnd}/>${slashSvg}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/svgExport.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/svgExport.ts src/utils/svgExport.test.ts
git commit -m "feat(export): SVG counterclaim — no arrowhead, midpoint slash line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Properties-panel Support / Counterclaim toggle

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx` (imports line 4; constants after `SUPPORT_CONTRIBUTOR_TYPES` ~line 19–22; store selectors ~line 45–46; connection block ~line 133–173)

**Interfaces:**
- Consumes: `setConnectionType` (Task 1), `ConnectionType`.

No unit test (`.tsx`, Node env). Verified by `npx tsc -b` and Task 10.

- [ ] **Step 1: Import the type and add the option list**

Add `ConnectionType` to the `import type { … } from '../../types';` list on line 4.

After the `SUPPORT_CONTRIBUTOR_TYPES` constant add:

```ts
const CONNECTION_TYPES: { value: ConnectionType; label: string }[] = [
  { value: 'support', label: 'Support' },
  { value: 'counterclaim', label: 'Counterclaim' },
];
```

- [ ] **Step 2: Read the action from the store**

After `const resetConnectionRouting = useDiagramStore((s) => s.resetConnectionRouting);` add:

```ts
  const setConnectionType = useDiagramStore((s) => s.setConnectionType);
```

- [ ] **Step 3: Render the segmented toggle**

Inside `if (selectedConnection) { … }`, inside `<div className="flex items-center gap-4 h-full">`, insert as the FIRST child (before the `Connection — …` span):

```tsx
          <div
            role="radiogroup"
            aria-label="Connection type"
            className="flex rounded-md overflow-hidden border"
            style={{ borderColor: theme.input.border }}
          >
            {CONNECTION_TYPES.map(({ value, label }) => {
              const active = selectedConnection.type === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setConnectionType(selectedConnection.id, value)}
                  className="px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: active ? theme.sidebar.accent : theme.input.bg,
                    color: active ? theme.sidebar.accentText : theme.input.text,
                    outlineColor: theme.focus.ring,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc -b && npm run lint 2>&1 | tail -3`
Expected: tsc clean; lint problem count unchanged from baseline (compare with `git stash; npm run lint | tail -1; git stash pop` if unsure).

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(properties): Support / Counterclaim toggle for a selected connection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Context menu on connection lines

**Files:**
- Modify: `src/components/Canvas/ContextMenu.tsx` (imports lines 2–12; props ~line 14–29; destructuring ~line 31–45; JSX before the Delete button ~line 128)
- Modify: `src/components/Canvas/Canvas.tsx` (store destructure ~line 113–142; handlers after `handleContextMenuDelete` ~line 646; `<ConnectionArrow>` props ~line 1052–1064; `<ContextMenu>` props ~line 1177–1200)

**Interfaces:**
- Consumes: `ConnectionArrow.onContextMenu` (Task 4); `setConnectionType` (Task 1).
- Produces: `ContextMenu` props `connectionType?: ConnectionType` and `onToggleCounterclaim?: () => void`.

Today nothing opens the context menu for connections (the `'connection'` elementType exists but no line emits `onContextMenu`); this task adds that path.

- [ ] **Step 1: ContextMenu — props and menu item**

Add `Slash` to the lucide import list. Add `ConnectionType` to the `import type { … } from '../../types';` list.

In `interface ContextMenuProps` add:

```ts
  /** Present only when elementType === 'connection'. */
  connectionType?: ConnectionType;
  onToggleCounterclaim?: () => void;
```

Add `connectionType,` and `onToggleCounterclaim,` to the destructured parameters.

Insert directly BEFORE the `{/* Delete */}` comment:

```tsx
      {/* Counterclaim toggle (connections only) */}
      {elementType === 'connection' && onToggleCounterclaim && (
        <button
          onClick={() => {
            onToggleCounterclaim();
            onClose();
          }}
          className={menuItemClass}
        >
          <Slash size={16} />
          {connectionType === 'counterclaim' ? 'Mark as support' : 'Mark as counterclaim'}
        </button>
      )}
```

- [ ] **Step 2: Canvas — read the action and add the handler**

Add `setConnectionType,` to the `const { … } = useDiagramStore();` destructure (after `removeConnection,`).

After `handleContextMenuDelete` add:

```ts
  const contextConnection =
    contextMenu.elementType === 'connection'
      ? connections.find((c) => c.id === contextMenu.elementId)
      : undefined;

  const handleContextMenuToggleCounterclaim = useCallback(() => {
    const conn = connections.find((c) => c.id === contextMenu.elementId);
    if (!conn) return;
    setConnectionType(conn.id, conn.type === 'counterclaim' ? 'support' : 'counterclaim');
  }, [contextMenu.elementId, connections, setConnectionType]);
```

- [ ] **Step 3: Canvas — wire the line and the menu**

On `<ConnectionArrow …>` add after `onHover={handleArrowHover}`:

```tsx
              onContextMenu={(e) => handleContextMenu(connection.id, 'connection', e)}
```

On `<ContextMenu …>` add after `onSendToBack={handleContextMenuSendToBack}`:

```tsx
          connectionType={contextConnection?.type}
          onToggleCounterclaim={contextConnection ? handleContextMenuToggleCounterclaim : undefined}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (If `handleContextMenu`'s `elementType` parameter type rejects `'connection'`, it already includes it via `ContextMenuState['elementType']` — check `Canvas.tsx:40`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/ContextMenu.tsx src/components/Canvas/Canvas.tsx
git commit -m "feat(canvas): right-click a connection → Mark as counterclaim / Mark as support

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Legend row

**Files:**
- Modify: `src/components/Canvas/shapes/Legend.tsx` (imports line 3; `LegendProps` ~line 6–10; `LegendItem` ~line 12–19; after the Info Box block ~line 145–151; swatch branches ~line 209–249)
- Modify: `src/components/Canvas/Canvas.tsx` (`<Legend …>` ~line 1157–1162)

**Interfaces:**
- Produces: `Legend` requires a new prop `connections: Connection[]`.

- [ ] **Step 1: Legend — prop, item flag, row**

Add `Connection` to the type import on line 3:

```ts
import type { DiagramElement, ArgumentElement, TeacherSupportElement, SupportElement, Connection } from '../../../types';
```

In `LegendProps` add `connections: Connection[];`. Destructure `connections` in the component signature: `export function Legend({ elements, connections, position, onDragEnd }: LegendProps)`.

In `LegendItem` add `isLine?: boolean;`.

After the `// Add info box if used` block (before `// Don't render if no items`) add:

```ts
  // Connection marks
  if (connections.some((c) => c.type === 'counterclaim')) {
    legendItems.push({
      label: 'Counterclaim',
      color: '#000000',
      isLine: true,
    });
  }
```

- [ ] **Step 2: Legend — swatch**

In the swatch ternary chain, insert a new branch between the `item.isCloud` branch and the final rectangle default, i.e. replace

```tsx
            ) : (
              // Rectangle for other types
```

with

```tsx
            ) : item.isLine ? (
              // Line with a midpoint slash for counterclaim connections
              <>
                <Line
                  points={[padding, swatchHeight / 2, padding + swatchWidth, swatchHeight / 2]}
                  stroke={item.color}
                  strokeWidth={2}
                />
                <Line
                  points={[
                    padding + swatchWidth / 2 - 3, swatchHeight / 2 + 5,
                    padding + swatchWidth / 2 + 3, swatchHeight / 2 - 5,
                  ]}
                  stroke={item.color}
                  strokeWidth={2}
                  lineCap="round"
                />
              </>
            ) : (
              // Rectangle for other types
```

- [ ] **Step 3: Canvas — pass connections**

Change the `<Legend elements={elements} …>` call to include `connections={connections}`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/shapes/Legend.tsx src/components/Canvas/Canvas.tsx
git commit -m "feat(legend): Counterclaim row with line+slash swatch when one exists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: DiagramMix export, image-import schema, toolbar warning

**Files:**
- Modify: `src/utils/diagramxExport.ts` (`let hasEndArrow = true;` ~line 496; new export after `hasAttachedQualifiers` ~line 436)
- Modify: `src/utils/importedDiagramSchema.ts:48-53`
- Modify: `src/components/Toolbar/Toolbar.tsx` (import ~line 29–34; `handleExportDiagramx` ~line 172–191)
- Create: `src/utils/diagramxExport.test.ts`
- Test: `src/utils/importedDiagramSchema.test.ts` (append)

**Interfaces:**
- Produces: `export function hasCounterclaims(connections: Connection[]): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/diagramxExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { exportToDiagramx, hasCounterclaims } from './diagramxExport';
import type { ArgumentElement, Connection } from '../types';

function claim(id: string, x: number): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: `Claim ${id}`, content: '',
    position: { x, y: 0 }, size: { width: 180, height: 80 },
  };
}

type ConnectorItem = { connector: { _0: { connectorStyle: Record<string, unknown> } } };

function connectorStyles(json: string): Record<string, unknown>[] {
  const doc = JSON.parse(json) as { tabs: { model: { items: unknown[] } }[] };
  return doc.tabs[0].model.items
    .filter((it): it is ConnectorItem => typeof it === 'object' && it !== null && 'connector' in it)
    .map((it) => it.connector._0.connectorStyle);
}

describe('exportToDiagramx connectors', () => {
  const els = [claim('1', 0), claim('2', 400)];

  it('support connections get an end arrowhead', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
    const styles = connectorStyles(exportToDiagramx(els, conns, 'd'));
    expect(styles).toHaveLength(1);
    expect(styles[0].endArrowheadKind).toBe(1);
    expect(styles[0].endArrowSizeWidth).toBeGreaterThan(0);
  });

  it('counterclaim connections get no arrowhead (slash has no DiagramMix equivalent)', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'counterclaim' }];
    const styles = connectorStyles(exportToDiagramx(els, conns, 'd'));
    expect(styles).toHaveLength(1);
    expect(styles[0].endArrowheadKind).toBeUndefined();
    expect(styles[0].endArrowSizeWidth).toBe(0);
  });
});

describe('hasCounterclaims', () => {
  it('is true only when at least one connection is a counterclaim', () => {
    expect(hasCounterclaims([])).toBe(false);
    expect(hasCounterclaims([{ id: 'a', from: '1', to: '2', type: 'support' }])).toBe(false);
    expect(hasCounterclaims([
      { id: 'a', from: '1', to: '2', type: 'support' },
      { id: 'b', from: '2', to: '1', type: 'counterclaim' },
    ])).toBe(true);
  });
});
```

Append to `src/utils/importedDiagramSchema.test.ts` inside `describe('parseImportedDiagram', …)`:

```ts
  it('accepts counterclaim connections', () => {
    const withCounter = {
      ...validResponse,
      connections: [{ id: 'conn-1', from: 'import-1', to: 'import-2', type: 'counterclaim' }],
    };
    const result = parseImportedDiagram(withCounter);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.connections[0].type).toBe('counterclaim');
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/diagramxExport.test.ts src/utils/importedDiagramSchema.test.ts`
Expected: FAIL — `hasCounterclaims` not exported; counterclaim connector still has `endArrowheadKind: 1`; import returns `schema_invalid`.

- [ ] **Step 3: Implement**

`src/utils/diagramxExport.ts`: change `let hasEndArrow = true;` (inside the connectors loop) to:

```ts
    // Counterclaims are symmetric — no arrowhead. Their slash has no
    // DiagramMix equivalent and is dropped (Toolbar warns).
    let hasEndArrow = conn.type !== 'counterclaim';
```

After `hasAttachedQualifiers` add:

```ts
/** True if any connection is a counterclaim. Used for the dropped-slash warning. */
export function hasCounterclaims(connections: Connection[]): boolean {
  return connections.some((c) => c.type === 'counterclaim');
}
```

`src/utils/importedDiagramSchema.ts`: in `connectionSchema` change `type: z.literal('support'),` to:

```ts
  type: z.enum(['support', 'counterclaim']),
```

`src/components/Toolbar/Toolbar.tsx`: add `hasCounterclaims,` to the `from '../../utils/diagramxExport'` import. In `handleExportDiagramx`, after the `hasAttachedQualifiers` warning block add:

```ts
      if (hasCounterclaims(connections)) {
        addToast('warning', 'Counterclaim slashes were dropped — DiagramMix has no equivalent marker.');
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/diagramxExport.test.ts src/utils/importedDiagramSchema.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/utils/diagramxExport.ts src/utils/diagramxExport.test.ts src/utils/importedDiagramSchema.ts src/utils/importedDiagramSchema.test.ts src/components/Toolbar/Toolbar.tsx
git commit -m "feat(export): DiagramMix counterclaim without arrowhead + dropped-slash warning; import accepts counterclaim

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Requirements doc, full verification, browser walkthrough

**Files:**
- Modify: `docs/REQUIREMENTS.md:98-102` (§3.1 table)

- [ ] **Step 1: Document the arrow type**

In `docs/REQUIREMENTS.md` §3.1, add a row to the Arrow Types table after `Standard Support`:

```markdown
| Counterclaim | Solid line, **no** arrowhead, short slash (/) at the midpoint | Black | Two claims that counter each other (symmetric; does not change either claim's derived role) |
```

- [ ] **Step 2: Full verification recipe**

Run, in order:

```bash
npm run lint 2>&1 | tail -3      # problem count must equal the pre-branch baseline (≈17)
npx tsc -b
npm test
npm run build
```

Expected: lint count unchanged; tsc clean; all tests pass (previous 187 + the new ones); build succeeds.

- [ ] **Step 3: Browser walkthrough (Playwright MCP or Claude for Chrome)**

Start `npm run dev` and, on `http://localhost:5173`:

1. Drop two Claims, press `C`, click Claim 1 then Claim 2 → a support arrow appears.
2. Select the arrow → properties panel shows the `Support | Counterclaim` toggle; click `Counterclaim` → arrowhead disappears, a `/` sits at the midpoint. `⌘Z` restores the arrowhead; `⌘⇧Z` re-applies.
3. Right-click the line → menu shows `Mark as support`; click it → arrowhead returns. Right-click again → `Mark as counterclaim`.
4. Drag a segment to make a Z-elbow → the slash follows the midpoint onto the correct segment.
5. Toggle the legend → a `Counterclaim` row with line+slash appears while a counterclaim exists, disappears after flipping back to support.
6. Confirm Claim 1's label stays `Claim 1` (not `Dataclaim 1`) while linked by a counterclaim.
7. Export PNG and SVG → both show the slash and no arrowhead (open the SVG file; search for `marker-end` — absent for the counterclaim).
8. Export `.diagramx` → warning toast about dropped slashes appears.
9. Save `.json`, reload the page, load the file → the connection is still a counterclaim (`"type": "counterclaim"`, `"version": "1.7"` in the file).

Take a screenshot of steps 2 and 5 for the review record.

- [ ] **Step 4: Commit**

```bash
git add docs/REQUIREMENTS.md
git commit -m "docs(requirements): counterclaim arrow type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then proceed to `docs/superpowers/plans/2026-09-21-analytic-notes.md` (same branch).
