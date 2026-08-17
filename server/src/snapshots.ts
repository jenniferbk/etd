import { gunzipSync, gzipSync } from 'node:zlib';

export function packSnapshot(snapshot: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'));
}

export function unpackSnapshot(buf: Buffer): unknown {
  return JSON.parse(gunzipSync(buf).toString('utf8'));
}
