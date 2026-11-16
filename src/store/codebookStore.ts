import { create } from 'zustand';
import type { Codebook, KindType } from '../data/types';
import type { LiveDoc } from '../live/ops';
import { discoverKinds, unknownSubtypes } from '../data/codebook';
import * as codebookApi from '../api/codebook';
import { ApiError } from '../api/client';

const UNCATEGORIZED = '[uncategorized]';

interface CodebookState {
  byGroup: Record<number, Codebook>;
  refresh: (groupId: number) => Promise<Codebook>;
  ensure: (groupId: number, docs?: LiveDoc[]) => Promise<Codebook>;
  addKind: (groupId: number, body: { id?: string; label: string; category: string; type: KindType }) => Promise<Codebook>;
  updateKind: (groupId: number, kindId: string, patch: { label?: string; category?: string; type?: KindType; status?: 'active' | 'retired' }) => Promise<Codebook>;
  mergeKind: (groupId: number, kindId: string, into: string) => Promise<Codebook>;
}

const isConflict = (e: unknown) => e instanceof ApiError && e.status === 409;

export const useCodebookStore = create<CodebookState>((set) => {
  const store = (groupId: number, kinds: Codebook['kinds']): Codebook => {
    const cb = { groupId, kinds };
    set((s) => ({ byGroup: { ...s.byGroup, [groupId]: cb } }));
    return cb;
  };
  const refresh = async (groupId: number) => store(groupId, await codebookApi.getCodebook(groupId));

  return {
    byGroup: {},
    refresh,

    async ensure(groupId, docs = []) {
      let cb = await refresh(groupId);
      if (cb.kinds.length === 0) {
        const found = discoverKinds(docs);
        if (found.length === 0) return cb;
        try {
          return store(groupId, await codebookApi.initCodebook(
            groupId, found.map((k) => ({ ...k, category: UNCATEGORIZED })),
          ));
        } catch (e) {
          if (!isConflict(e)) throw e;
          // Someone else initialized first; fall through and add what is still unknown.
          cb = await refresh(groupId);
        }
      }
      const unknown = unknownSubtypes(docs, cb);
      if (unknown.length === 0) return cb;
      for (const k of unknown) {
        try {
          await codebookApi.addKind(groupId, { id: k.id, label: k.label, category: UNCATEGORIZED, type: k.type });
        } catch (e) {
          // A concurrent add of the same id or label; the refresh below picks it up.
          if (!isConflict(e)) throw e;
        }
      }
      return refresh(groupId);
    },

    async addKind(groupId, body) {
      await codebookApi.addKind(groupId, body);
      return refresh(groupId);
    },
    async updateKind(groupId, kindId, patch) {
      await codebookApi.updateKind(groupId, kindId, patch);
      return refresh(groupId);
    },
    async mergeKind(groupId, kindId, into) {
      await codebookApi.mergeKind(groupId, kindId, into);
      return refresh(groupId);
    },
  };
});
