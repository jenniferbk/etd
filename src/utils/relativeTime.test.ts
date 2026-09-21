import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  afterEach(() => vi.useRealTimers());

  it('treats zone-less SQLite timestamps as UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:10:00Z'));
    expect(relativeTime('2026-09-21 12:00:00')).toBe('10 minutes ago');
  });

  it('accepts ISO timestamps that already carry a zone (notes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:10:00Z'));
    expect(relativeTime('2026-09-21T12:00:00.000Z')).toBe('10 minutes ago');
    expect(relativeTime('2026-09-21T08:00:00-04:00')).toBe('10 minutes ago');
  });
});
