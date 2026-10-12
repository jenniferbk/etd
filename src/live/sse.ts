// Server-Sent Events over fetch. EventSource cannot send the Authorization
// header the API uses, so the stream is read by hand.
import { ApiError } from '../api/client';

export interface SseFrame {
  event: string;
  data: string;
}

/** Split buffered stream text into complete frames plus the unfinished tail.
 *  Comment lines (": ping") produce no frame but still count as traffic. */
export function parseSse(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) frames.push({ event, data: data.join('\n') });
  }
  return { frames, rest };
}

/**
 * Open a stream and deliver frames until it ends. Resolves when the server
 * closes it, rejects with ApiError on a non-OK response, or with the abort
 * error when `signal` fires. `onTraffic` runs on every chunk (heartbeats too).
 */
export async function readEventStream(
  url: string,
  token: string | null,
  signal: AbortSignal,
  onFrame: (frame: SseFrame) => void,
  onTraffic: () => void,
): Promise<void> {
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
    cache: 'no-store',
  });
  if (!res.ok || !res.body) {
    let message = `stream failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    onTraffic();
    buffer += decoder.decode(value, { stream: true });
    const { frames, rest } = parseSse(buffer);
    buffer = rest;
    for (const f of frames) onFrame(f);
  }
}
