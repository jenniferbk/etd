// Decides when the codebook mirror writes styleConfig. Plain functions with
// injected store access, so the rules can be tested without React.
//
// Rules: mirror after a codebook change (ensure/refresh resolving lands here
// too) and after a local styleConfig change (a load). A REMOTE styleConfig is
// never re-mirrored directly: when it disagrees with our mirror, refresh the
// codebook; the refresh is a codebook change, which mirrors only if the fresh
// codebook still differs. Two clients with different codebooks so converge on
// the server's codebook instead of overwriting each other.
import type { Codebook } from './types';
import type { StyleConfig } from '../types/styleConfig';
import type { LiveDoc } from '../live/ops';
import { mirrorIntoStyleConfig, unknownSubtypes } from './codebook';

export interface MirrorSyncDeps {
  /** False once the canvas no longer shows this group's library diagram. */
  isActive(): boolean;
  getCodebook(): Codebook | undefined;
  getStyleConfig(): StyleConfig;
  write(next: StyleConfig): void;
  /** Reload the codebook (its store update calls codebookChanged). */
  refresh(): Promise<unknown>;
  /** Add the open diagram's unknown kinds to the codebook. */
  ensure(): Promise<unknown>;
  onError?(e: unknown): void;
}

export interface MirrorSync {
  codebookChanged(): void;
  styleConfigChanged(remote: boolean): void;
}

export function createMirrorSync(d: MirrorSyncDeps): MirrorSync {
  let ensuredKey: string | null = null;
  let refreshing = false;
  const fail = (e: unknown) => (d.onError ?? ((err) => console.warn('Codebook mirror failed', err)))(e);

  const mirror = () => {
    if (!d.isActive()) return;
    const cb = d.getCodebook();
    if (!cb) return;
    const sc = d.getStyleConfig();
    const next = mirrorIntoStyleConfig(sc, cb);
    if (next !== sc) d.write(next);
  };

  // Kinds in styleConfig the codebook lacks: add them (once per id set).
  const ensureUnknown = () => {
    const cb = d.getCodebook();
    if (!cb) return;
    const doc = { styleConfig: d.getStyleConfig() } as unknown as LiveDoc;
    const ids = unknownSubtypes([doc], cb).map((k) => k.id).sort();
    if (ids.length === 0) return;
    const key = ids.join('\n');
    if (key === ensuredKey) return;
    ensuredKey = key;
    d.ensure().catch(fail);
  };

  return {
    codebookChanged: mirror,
    styleConfigChanged(remote) {
      if (!d.isActive()) return;
      ensureUnknown();
      if (!remote) {
        mirror();
        return;
      }
      const cb = d.getCodebook();
      if (!cb || refreshing) return;
      const sc = d.getStyleConfig();
      if (mirrorIntoStyleConfig(sc, cb) === sc) return;
      refreshing = true;
      d.refresh().catch(fail).finally(() => { refreshing = false; });
    },
  };
}
