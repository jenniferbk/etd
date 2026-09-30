import { describe, it, expect } from 'vitest';
import { parseTranscript } from './transcriptParser';

describe('parseTranscript', () => {
  it('parses a standard utterance line', () => {
    const t = parseTranscript('55:07 Teacher: What do you notice?', 't.txt');
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]).toMatchObject({
      timestamp: '55:07',
      speaker: 'Teacher',
      text: 'What do you notice?',
      contributor: 'teacher',
      objectType: 'claim',
    });
    expect(t.lines[0].annotation).toBeUndefined();
    expect(t.parseWarnings).toEqual([]);
  });

  it('keeps a bracketed visual annotation, inheriting timestamp and speaker from the previous line', () => {
    const t = parseTranscript(
      ['55:07 Teacher: Look here.', '[Teacher points to the graph on the board]'].join('\n'),
      't.txt',
    );
    expect(t.lines).toHaveLength(2);
    expect(t.lines[1]).toMatchObject({
      index: 1,
      timestamp: '55:07',
      speaker: 'Teacher',
      text: '[Teacher points to the graph on the board]',
      contributor: 'teacher',
      objectType: 'action',
      annotation: true,
    });
    expect(t.parseWarnings).toEqual([]);
  });

  it('uses an annotation line’s own leading timestamp when it has one', () => {
    const t = parseTranscript(
      ['55:07 Student 2: I think it doubles.', '55:12 (Student 2 draws a circle)'].join('\n'),
      't.txt',
    );
    expect(t.lines[1]).toMatchObject({
      timestamp: '55:12',
      speaker: 'Student 2',
      text: '(Student 2 draws a circle)',
      contributor: 'student',
      objectType: 'action',
      annotation: true,
    });
  });

  it('chains inheritance across consecutive annotations', () => {
    const t = parseTranscript(
      ['1:02:03 Teacher: Okay.', '[walks to board]', '[writes y = 2x]'].join('\n'),
      't.txt',
    );
    expect(t.lines.map((l) => [l.timestamp, l.speaker])).toEqual([
      ['1:02:03', 'Teacher'],
      ['1:02:03', 'Teacher'],
      ['1:02:03', 'Teacher'],
    ]);
  });

  it('leaves timestamp and speaker blank for an annotation before any utterance', () => {
    const t = parseTranscript('[Class is working in groups]\n55:07 Teacher: Okay.', 't.txt');
    expect(t.lines[0]).toMatchObject({
      timestamp: '',
      speaker: '',
      text: '[Class is working in groups]',
      objectType: 'action',
      annotation: true,
    });
    expect(t.lines[1].index).toBe(1);
  });

  it('still skips blank lines silently', () => {
    const t = parseTranscript('55:07 Teacher: Hi.\n\n   \n55:09 Student: Hi.', 't.txt');
    expect(t.lines).toHaveLength(2);
    expect(t.parseWarnings).toEqual([]);
  });

  it('still warns on unrecognized tag values', () => {
    const t = parseTranscript('55:07 Teacher [bogus|claim]: Hi.', 't.txt');
    expect(t.parseWarnings).toHaveLength(1);
    expect(t.parseWarnings[0]).toMatch(/unrecognized contributor "bogus"/);
  });
});
