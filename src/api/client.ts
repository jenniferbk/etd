const SERVER_URL_KEY = 'etd:serverUrl';
const TOKEN_KEY = 'etd:sessionToken';

// Server URL default: explicit env wins; dev (and non-browser test envs)
// falls back to the local server; production builds served by the ETD
// server itself default to same-origin (campus-VPN deployment).
export const DEFAULT_SERVER_URL: string =
  (import.meta.env.VITE_ETD_API_URL as string | undefined) ??
  (import.meta.env.DEV || typeof window === 'undefined'
    ? 'http://localhost:8787'
    : window.location.origin);

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ''));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  /** Parsed error-response JSON, when the server sent one (e.g. the 409
   *  conflict payload's `currentVersionId`). Undefined for non-JSON bodies. */
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'ApiError';
  }
}

/** GET a binary resource (e.g. a thumbnail) with the session token. Returns
 *  null for any non-OK response. */
export async function apiBlob(path: string): Promise<Blob | null> {
  const token = getToken();
  const res = await fetch(`${getServerUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.ok ? res.blob() : null;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${getServerUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    let parsedBody: unknown;
    try {
      parsedBody = await res.json();
      const body = parsedBody as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(res.status, message, parsedBody);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
