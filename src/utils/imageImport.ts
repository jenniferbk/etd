import { parseImportedDiagram, type ImportedDiagram } from './importedDiagramSchema';

export const IMPORT_ENDPOINT = 'https://jenkleiman.com/.netlify/functions/etd-image-import';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImportResult =
  | { kind: 'ok'; diagram: ImportedDiagram }
  | { kind: 'image_too_large' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'model_output_invalid' }
  | { kind: 'upstream_timeout' }
  | { kind: 'bad_content_type' }
  | { kind: 'network_error' }
  | { kind: 'cancelled' }
  | { kind: 'empty_diagram' }
  | { kind: 'unknown_error' };

export interface ImportOptions {
  signal?: AbortSignal;
}

export async function importImage(file: File, options: ImportOptions = {}): Promise<ImportResult> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { kind: 'image_too_large' };
  }

  const formData = new FormData();
  formData.append('image', file);

  let response: Response;
  try {
    response = await fetch(IMPORT_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: options.signal,
    });
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    return { kind: 'network_error' };
  }

  if (!response.ok) {
    let body: { error?: string; retryAfter?: number } = {};
    try {
      body = await response.json();
    } catch {
      // ignore — fall through with empty body
    }
    switch (response.status) {
      case 413: return { kind: 'image_too_large' };
      case 429: return { kind: 'rate_limited', retryAfterSeconds: body.retryAfter };
      case 502: return { kind: 'model_output_invalid' };
      case 504: return { kind: 'upstream_timeout' };
      case 400: return { kind: 'bad_content_type' };
      default: return { kind: 'unknown_error' };
    }
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: 'model_output_invalid' };
  }

  const parsed = parseImportedDiagram(json);
  if (parsed.kind === 'ok') {
    return { kind: 'ok', diagram: parsed.diagram };
  }
  if (parsed.kind === 'empty_diagram') {
    return { kind: 'empty_diagram' };
  }
  return { kind: 'model_output_invalid' };
}
