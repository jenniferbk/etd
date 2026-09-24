import { describe, expect, it } from 'vitest';
import { NOTE_BADGE_SELECTOR, snapshotStage, withNodesHidden, type HideableNode, type HideableStage, type SnapshotStage } from './exportHideNodes';

function fakeNode(initial: boolean): HideableNode & { value: boolean } {
  const node = {
    value: initial,
    visible(v?: boolean) {
      if (v === undefined) return node.value;
      node.value = v;
      return node;
    },
  };
  return node as unknown as HideableNode & { value: boolean };
}

describe('withNodesHidden', () => {
  it('hides matching nodes while fn runs and restores prior visibility after', () => {
    const shown = fakeNode(true);
    const alreadyHidden = fakeNode(false);
    let draws = 0;
    const stage: HideableStage = { find: () => [shown, alreadyHidden], draw: () => { draws += 1; } };
    const seen: boolean[] = [];
    const result = withNodesHidden(stage, NOTE_BADGE_SELECTOR, () => {
      seen.push(shown.value, alreadyHidden.value);
      return 'png';
    });
    expect(result).toBe('png');
    expect(seen).toEqual([false, false]);
    expect(shown.value).toBe(true);
    expect(alreadyHidden.value).toBe(false);
    expect(draws).toBe(2);
  });

  it('restores visibility even when fn throws', () => {
    const shown = fakeNode(true);
    const stage: HideableStage = { find: () => [shown], draw: () => undefined };
    expect(() => withNodesHidden(stage, NOTE_BADGE_SELECTOR, () => { throw new Error('boom'); })).toThrow('boom');
    expect(shown.value).toBe(true);
  });
});

describe('snapshotStage', () => {
  it('captures in canvas coordinates regardless of pan/zoom, then restores the view', () => {
    let pos = { x: -600, y: -400 };
    let scale = { x: 2, y: 2 };
    let seen: unknown = null;
    let config: unknown = null;
    const stage = {
      find: () => [],
      draw: () => undefined,
      position(p?: { x: number; y: number }) { if (p) pos = p; return pos; },
      scale(v?: { x: number; y: number }) { if (v) scale = v; return scale; },
      toDataURL(c: unknown) { seen = { pos, scale }; config = c; return 'data:image/png;base64,xx'; },
    } as unknown as SnapshotStage;

    const url = snapshotStage(stage, { x: 10, y: 20, width: 300, height: 200 }, { pixelRatio: 2 });

    expect(url).toBe('data:image/png;base64,xx');
    expect(seen).toEqual({ pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 } });
    expect(config).toMatchObject({ x: 10, y: 20, width: 300, height: 200, pixelRatio: 2 });
    expect(pos).toEqual({ x: -600, y: -400 });
    expect(scale).toEqual({ x: 2, y: 2 });
  });
});
