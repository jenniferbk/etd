import { api } from './client';
import type { CodebookKind, KindType } from '../data/types';

interface ServerKind extends Omit<CodebookKind, 'mergedInto'> { mergedInto: string | null }

const norm = (k: ServerKind): CodebookKind => {
  const { mergedInto, ...rest } = k;
  return mergedInto === null ? rest : { ...rest, mergedInto };
};
const base = (groupId: number) => `/api/groups/${groupId}/codebook`;

export interface CodebookLogEntry {
  id: number; at: string; user: string;
  action: 'init' | 'add' | 'update' | 'merge' | 'seed';
  kindId: string | null; before: unknown; after: unknown;
}

export async function getCodebook(groupId: number): Promise<CodebookKind[]> {
  return (await api<{ kinds: ServerKind[] }>(base(groupId))).kinds.map(norm);
}

export async function initCodebook(
  groupId: number, kinds: { id: string; label: string; category: string; type: KindType }[],
): Promise<CodebookKind[]> {
  return (await api<{ kinds: ServerKind[] }>(`${base(groupId)}/init`, { method: 'POST', body: { kinds } })).kinds.map(norm);
}

export async function addKind(
  groupId: number, body: { id?: string; label: string; category: string; type: KindType },
): Promise<CodebookKind> {
  return norm(await api<ServerKind>(`${base(groupId)}/kinds`, { method: 'POST', body }));
}

export async function updateKind(
  groupId: number, kindId: string,
  patch: { label?: string; category?: string; type?: KindType; status?: 'active' | 'retired' },
): Promise<CodebookKind> {
  return norm(await api<ServerKind>(`${base(groupId)}/kinds/${encodeURIComponent(kindId)}`, { method: 'PATCH', body: patch }));
}

export async function mergeKind(groupId: number, kindId: string, into: string): Promise<CodebookKind[]> {
  return (await api<{ kinds: ServerKind[] }>(`${base(groupId)}/kinds/${encodeURIComponent(kindId)}/merge`, { method: 'POST', body: { into } })).kinds.map(norm);
}

export async function getCodebookLog(groupId: number): Promise<CodebookLogEntry[]> {
  return (await api<{ entries: CodebookLogEntry[] }>(`${base(groupId)}/log`)).entries;
}
