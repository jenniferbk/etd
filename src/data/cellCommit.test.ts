import { describe, it, expect } from 'vitest';
import { clipCommit, moveContentCommit } from './cellCommit';

describe('clipCommit (blank clip showing a suggestion)', () => {
  const s = '74:09-76:12';
  it('blur with the suggestion untouched stores nothing', () => {
    expect(clipCommit(s, 'blur', s)).toEqual([]);
  });
  it('Enter confirms the suggestion as-is', () => {
    expect(clipCommit(s, 'enter', s)).toEqual([{ kind: 'episode', field: 'clip', value: s }]);
  });
  it('blur with an edited value stores the edit', () => {
    expect(clipCommit('74:10-76:12', 'blur', s)).toEqual([{ kind: 'episode', field: 'clip', value: '74:10-76:12' }]);
  });
  it('blank value stores nothing', () => {
    expect(clipCommit('  ', 'enter', s)).toEqual([]);
  });
});

describe('moveContentCommit', () => {
  const m = { id: 'm1', content: 'Why does it work?', time: '75:07' };
  it('unchanged content gives no edit', () => {
    expect(moveContentCommit(m, 'Why does it work?')).toEqual([]);
    expect(moveContentCommit(m, '  Why does it work?  ')).toEqual([]);
  });
  it('edits content only and never parses a timestamp out of the text', () => {
    expect(moveContentCommit(m, 'Wait until (2:30)')).toEqual([
      { kind: 'elementContent', elementId: 'm1', value: 'Wait until (2:30)' },
    ]);
  });
});
