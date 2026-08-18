import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, String(v)),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => void localStorageStore.clear(),
});

import { api, ApiError, getServerUrl, getToken, setServerUrl, setToken } from './client';

describe('client config', () => {
  beforeEach(() => localStorage.clear());

  // In dev (vitest, no DOM), defaults to localhost. In production, with VITE_ETD_API_URL unset, DEFAULT_SERVER_URL is window.location.origin (campus same-origin deployment—see server/README.md §6.2). This test exercises the localhost fallback.
  it('defaults the server URL and persists an override without a trailing slash', () => {
    expect(getServerUrl()).toBe('http://localhost:8787');
    setServerUrl('https://etd.example.org/');
    expect(getServerUrl()).toBe('https://etd.example.org');
  });

  it('persists and clears the token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe('api()', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('sends the bearer token and JSON body, parses JSON responses', async () => {
    setToken('tok123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const result = await api<{ ok: boolean }>('/api/health', { method: 'POST', body: { a: 1 } });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8787/api/health');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect(init!.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('throws ApiError with the server message on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid email or password' }), { status: 401 }),
    );
    await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'invalid email or password',
    });
    await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
  });

  it('returns undefined for 204 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('captures the parsed error body on ApiError (e.g. a 409 conflict payload)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'conflict', currentVersionId: 12 }), { status: 409 }),
    );
    try {
      await api('/api/diagrams/1', { method: 'PUT', body: {} });
      expect.unreachable('expected api() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).body).toEqual({ error: 'conflict', currentVersionId: 12 });
    }
  });

  it('leaves body undefined for a non-JSON error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }));
    try {
      await api('/api/health');
      expect.unreachable('expected api() to throw');
    } catch (err) {
      expect((err as ApiError).body).toBeUndefined();
    }
  });
});

describe('ApiError', () => {
  it('accepts the legacy two-arg construction', () => {
    const err = new ApiError(404, 'not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
    expect(err.body).toBeUndefined();
  });
});
