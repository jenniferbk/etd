export type KindType = 'question' | 'other';

export interface CodebookKind {
  id: string;
  label: string;
  category: string;
  type: KindType;
  status: 'active' | 'retired';
  mergedInto?: string;
  position: number;
}

export interface Codebook {
  groupId: number;
  kinds: CodebookKind[];
}

export interface ResolvedKind {
  id: string;
  label: string;
  category: string;
  type: KindType;
  retired: boolean;
  missing: boolean;
}
