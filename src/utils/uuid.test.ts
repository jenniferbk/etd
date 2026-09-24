import { afterEach, describe, it, expect, vi } from 'vitest';
import { generateUuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a v4 UUID when crypto.randomUUID exists', () => {
    expect(generateUuid()).toMatch(V4);
  });

  it('falls back to getRandomValues in an insecure context (no randomUUID)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => real.getRandomValues(arr),
    });
    const ids = new Set(Array.from({ length: 50 }, () => generateUuid()));
    for (const id of ids) expect(id).toMatch(V4);
    expect(ids.size).toBe(50);
  });
});
