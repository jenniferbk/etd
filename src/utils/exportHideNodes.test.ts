import { describe, expect, it } from 'vitest';
import { NOTE_BADGE_SELECTOR, withNodesHidden, type HideableNode, type HideableStage } from './exportHideNodes';

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
