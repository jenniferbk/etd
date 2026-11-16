import { describe, expect, it } from 'vitest';
import { keepSelection } from './selection';

describe('keepSelection', () => {
  const doc = { elements: [{ id: 'a' }, { id: 'b' }], connections: [{ id: 'c1' }] };

  it('keeps a selection made before first contact', () => {
    expect(keepSelection(['b', 'a'], doc)).toEqual(['b', 'a']);
    expect(keepSelection(['c1'], doc)).toEqual(['c1']);
  });

  it('drops ids that are no longer in the document', () => {
    expect(keepSelection(['a', 'gone', 'c-gone'], doc)).toEqual(['a']);
    expect(keepSelection([], doc)).toEqual([]);
  });
});
