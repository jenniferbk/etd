import { describe, expect, it } from 'vitest';
import { parseSse } from './sse';

describe('parseSse', () => {
  it('splits complete frames and keeps the partial tail', () => {
    const { frames, rest } = parseSse('event: ops\ndata: {"a":1}\n\n: ping\n\nevent: hel');
    expect(frames).toEqual([{ event: 'ops', data: '{"a":1}' }]);
    expect(rest).toBe('event: hel');
  });

  it('joins multi-line data and defaults the event name', () => {
    expect(parseSse('data: one\ndata: two\n\n').frames).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('handles CRLF line endings', () => {
    expect(parseSse('event: x\r\ndata: 1\r\n\r\n').frames).toEqual([{ event: 'x', data: '1' }]);
  });
});
