import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importImage, IMPORT_ENDPOINT } from './imageImport';

const validResponse = {
  version: '1.4',
  name: 'IMG_3630',
  elements: [{
    id: 'import-1', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim 1', content: 'A square.',
    position: { x: 0, y: 0 }, size: { width: 180, height: 90 },
  }],
  connections: [],
};

function mockFetchOnce(status: number, body: unknown): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  ) as typeof fetch;
}

describe('importImage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns ok result on successful import', async () => {
    mockFetchOnce(200, validResponse);
    const file = new File([new Uint8Array([0xff, 0xd8])], 'IMG_3630.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(1);
    }
  });

  it('returns image_too_large for files over 8 MB before fetch', async () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    global.fetch = vi.fn() as typeof fetch;
    const result = await importImage(big);
    expect(result.kind).toBe('image_too_large');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns rate_limited on 429', async () => {
    mockFetchOnce(429, { error: 'rate_limited', message: 'limit', retryAfter: 3600 });
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSeconds).toBe(3600);
    }
  });

  it('returns model_output_invalid on 502', async () => {
    mockFetchOnce(502, { error: 'model_output_invalid', message: '...' });
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('model_output_invalid');
  });

  it('returns network_error when fetch rejects', async () => {
    global.fetch = vi.fn(async () => { throw new Error('boom'); }) as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const result = await importImage(file);
    expect(result.kind).toBe('network_error');
  });

  it('returns cancelled when AbortController is fired', async () => {
    const controller = new AbortController();
    global.fetch = vi.fn(async (_url: any, init: any) => {
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      return new Response();
    }) as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    const promise = importImage(file, { signal: controller.signal });
    controller.abort();
    const result = await promise;
    expect(result.kind).toBe('cancelled');
  });

  it('posts to the expected endpoint with multipart body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    global.fetch = fetchMock as typeof fetch;
    const file = new File([new Uint8Array([0xff])], 'IMG.jpg', { type: 'image/jpeg' });
    await importImage(file);
    expect(fetchMock).toHaveBeenCalledWith(
      IMPORT_ENDPOINT,
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });
});
