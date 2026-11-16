import type { LiveDoc } from '../live/ops';
import type { EpisodeFields } from '../types/episode';
import type { ArgumentType, ContributorType } from '../types/elements';

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

// ---- Data view shaping (Task 5)

export type DataColumnKey =
  | 'seq' | 'episode' | 'clip' | 'status' | 'sgwc' | 'discipline'
  | 'part' | 'contributor' | 'content' | 'who' | 'time' | 'qualifier'
  | 'untyped_move' | 'untyped_by' | 'untyped_type' | 'untyped_kind' | 'untyped_category'
  | 'question_move' | 'question_by' | 'question_kind' | 'question_category'
  | 'other_move' | 'other_by' | 'other_kind' | 'other_category'
  | 'links' | 'note'
  | 'component_id' | 'move_id_untyped' | 'move_id_question' | 'move_id_other'
  | 'diagram_id' | 'first_row_of_component';

export interface DiagramDocInput {
  diagramId: number | null;
  title: string;
  versionId: number | null;
  folderId: number | null;
  doc: LiveDoc;
}

export type MoveSlot = 'untyped' | 'question' | 'other';

export interface MoveCell {
  id: string;
  /** content + " (time)" */
  text: string;
  content: string;
  time: string;
  by: string;
  supportType: 'action' | 'question' | 'other';
  kind?: ResolvedKind;
}

export interface ComponentCell {
  id: string;
  part: 'D' | 'C' | 'W' | 'B' | 'R' | 'Q';
  argumentType: ArgumentType;
  contributor: ContributorType;
  content: string;
  who: string;
  time: string;
  qualifier: string;
  links: string;
  note: string;
}

export interface ComponentGroup {
  key: string;
  diagramKey: string;
  diagramId: number | null;
  episodeTitle: string;
  episode: EpisodeFields;
  clipSuggestion?: string;
  /** null = the unlinked-moves group */
  component: ComponentCell | null;
  moves: Record<MoveSlot, MoveCell[]>;
  order: number;
}

export interface DataRow {
  seq: number;
  group: ComponentGroup;
  firstOfGroup: boolean;
  firstOfEpisode: boolean;
  untyped?: MoveCell;
  question?: MoveCell;
  other?: MoveCell;
}
