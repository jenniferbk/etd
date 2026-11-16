import { create } from 'zustand';
import type { Codebook, KindType } from '../data/types';
import type { LiveDoc } from '../live/ops';
import { discoverKinds, planCodebookAdditions } from '../data/codebook';
import * as codebookApi from '../api/codebook';
import { ApiError } from '../api/client';

const UNCATEGORIZED = '[uncategorized]';
// Exact message from server/src/routes/codebook.ts for an add whose id already exists.
const DUP_ID = 'kind id already exists';

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
      const found = discoverKinds(docs);
      let plan = planCodebookAdditions(cb.kinds.length === 0 ? null : cb, found);
      if (cb.kinds.length === 0 && plan.init.length > 0) {
        try {
          await codebookApi.initCodebook(groupId, plan.init.map((k) => ({ ...k, category: UNCATEGORIZED })));
        } catch (e) {
          if (!isConflict(e)) throw e;
          // Someone else initialized first; plan again against what they wrote.
          cb = await refresh(groupId);
          plan = planCodebookAdditions(cb, found);
        }
      }
      if (plan.add.length === 0) return refresh(groupId);
      for (const k of plan.add) {
        try {
          await codebookApi.addKind(groupId, { ...k, category: UNCATEGORIZED });
        } catch (e) {
          // Only a concurrent add of the same id is ignorable; anything else is a real failure.
          if (!(isConflict(e) && (e as ApiError).message === DUP_ID)) throw e;
        }
      }
      for (const m of plan.mergeInto) await codebookApi.mergeKind(groupId, m.id, m.into);
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
