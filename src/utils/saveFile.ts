// Save a file to disk, preferring a native "choose folder + filename" dialog.
//
// Chromium browsers (Chrome/Edge/Opera) expose the File System Access API
// (window.showSaveFilePicker), which opens a real save dialog. Safari and
// Firefox don't, so we fall back to the classic anchor-download (drops into
// the browser's Downloads folder).
//
// User-cancel of the native dialog throws AbortError — treated as a silent
// no-op (returns false), so callers don't show an error toast.

export interface SaveFileOptions {
  data: Blob;
  suggestedName: string; // includes extension, e.g. "my-diagram.json"
  mimeType: string; // e.g. "application/json"
  extension: string; // including leading dot, e.g. ".json"
  description?: string; // shown in the picker's file-type row
}

// Minimal typings for the File System Access API (not in the default DOM lib).
interface FsaWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FsaFileHandle {
  createWritable(): Promise<FsaWritable>;
}
interface ShowSaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
type ShowSaveFilePicker = (opts?: ShowSaveFilePickerOptions) => Promise<FsaFileHandle>;

function getSaveFilePicker(): ShowSaveFilePicker | null {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  return typeof picker === 'function' ? picker : null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function anchorDownload(data: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

// Returns true if the file was written, false if the user cancelled the dialog.
export async function saveFile(options: SaveFileOptions): Promise<boolean> {
  const { data, suggestedName, mimeType, extension, description } = options;
  const picker = getSaveFilePicker();

  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return true;
    } catch (err) {
      if (isAbortError(err)) return false; // user cancelled — no-op
      // Picker failed for some other reason (e.g. permissions); fall back.
      anchorDownload(data, suggestedName);
      return true;
    }
  }

  anchorDownload(data, suggestedName);
  return true;
}

// Helper: convert a data URL (e.g. canvas.toDataURL) to a Blob.
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
