import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStorageStore.set(k, String(v)),
  removeItem: (k: string) => void localStorageStore.delete(k),
  clear: () => void localStorageStore.clear(),
});

import { useAuthStore } from './authStore';
import { getToken, setToken } from './client';

const USER = { id: 1, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false };
const GROUPS = [{ id: 1, name: 'COMS', role: 'member' }];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, groups: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('signIn stores the token, user, and groups', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/login')) return jsonResponse({ token: 'tok', user: USER });
      if (url.endsWith('/api/groups')) return jsonResponse(GROUPS);
      throw new Error(`unexpected fetch: ${url}`);
    });
    await useAuthStore.getState().signIn('a@uga.edu', 'pw123456');
    expect(getToken()).toBe('tok');
    expect(useAuthStore.getState().user).toEqual(USER);
    expect(useAuthStore.getState().groups).toEqual(GROUPS);
  });

  it('restore clears a dead token silently', async () => {
    setToken('stale');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    await useAuthStore.getState().restore();
    expect(getToken()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('signOut clears state even if the server call fails', async () => {
    setToken('tok');
    useAuthStore.setState({ user: USER, groups: GROUPS as never });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await useAuthStore.getState().signOut();
    expect(getToken()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().groups).toEqual([]);
  });
});
