import { create } from 'zustand';
import { api, ApiError, getToken, setToken } from './client';
import type { CloudGroup, CloudUser } from './types';

interface AuthState {
  user: CloudUser | null;
  groups: CloudGroup[];
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    inviteToken: string;
    email: string;
    password: string;
    displayName: string;
    acceptedPolicy: boolean;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  groups: [],

  signIn: async (email, password) => {
    const res = await api<{ token: string; user: CloudUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    const groups = await api<CloudGroup[]>('/api/groups');
    set({ user: res.user, groups });
  },

  register: async (input) => {
    const res = await api<{ token: string; user: CloudUser }>('/api/auth/register', {
      method: 'POST',
      body: input,
    });
    setToken(res.token);
    const groups = await api<CloudGroup[]>('/api/groups');
    set({ user: res.user, groups });
  },

  signOut: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // clearing local state matters more than the server call succeeding
    }
    setToken(null);
    set({ user: null, groups: [] });
  },

  restore: async () => {
    if (!getToken()) return;
    try {
      const user = await api<CloudUser>('/api/auth/me');
      const groups = await api<CloudGroup[]>('/api/groups');
      set({ user, groups });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        set({ user: null, groups: [] });
      }
      // network errors: stay signed out this session but keep the token for next launch
    }
  },
}));
