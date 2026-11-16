import type { DataColumnKey } from './types';

export type DataColumnGroup = 'Episode' | 'Component' | 'First pass (untyped)' | 'Question' | 'Other' | '' | 'IDs';

export interface DataColumn {
  key: DataColumnKey;
  header: string;
  group: DataColumnGroup;
  width: number;
  hidden?: true;
  /** Grayed on continuation rows of a component group. */
  repeats?: true;
}

const c = (
  key: DataColumnKey,
  header: string,
  group: DataColumnGroup,
  width: number,
  flags: { hidden?: true; repeats?: true } = {},
): DataColumn => ({ key, header, group, width, ...flags });

const R = { repeats: true } as const;
const H = { hidden: true } as const;

/** One definition of column order, headers, groups and widths for the grid and the export (spec 3.1, A..AA, then hidden IDs). */
export const DATA_COLUMNS: readonly DataColumn[] = [
  c('seq', '#', '', 5),
  c('episode', 'Episode', 'Episode', 22, R),
  c('clip', 'Clip', 'Episode', 12, R),
  c('status', 'Status', 'Episode', 11, R),
  c('sgwc', 'SG/WC', 'Episode', 8, R),
  c('discipline', 'Discipline', 'Episode', 11, R),
  c('part', 'Part', 'Component', 6, R),
  c('contributor', 'Contributor', 'Component', 11, R),
  c('content', 'Content of component', 'Component', 40, R),
  c('who', 'Who', 'Component', 12, R),
  c('time', 'Time', 'Component', 8, R),
  c('qualifier', 'Qualifier', 'Component', 16, R),
  c('untyped_move', 'Move', 'First pass (untyped)', 34),
  c('untyped_by', 'By', 'First pass (untyped)', 12),
  c('untyped_type', 'Type', 'First pass (untyped)', 10),
  c('untyped_kind', 'Kind', 'First pass (untyped)', 16),
  c('untyped_category', 'Category', 'First pass (untyped)', 18),
  c('question_move', 'Question', 'Question', 34),
  c('question_by', 'By', 'Question', 12),
  c('question_kind', 'Kind', 'Question', 16),
  c('question_category', 'Category', 'Question', 18),
  c('other_move', 'Other', 'Other', 34),
  c('other_by', 'By', 'Other', 12),
  c('other_kind', 'Kind', 'Other', 16),
  c('other_category', 'Category', 'Other', 18),
  c('links', 'Links to', '', 18, R),
  c('note', 'Note', '', 24, R),
  c('component_id', 'component_id', 'IDs', 10, H),
  c('move_id_untyped', 'move_id_untyped', 'IDs', 10, H),
  c('move_id_question', 'move_id_question', 'IDs', 10, H),
  c('move_id_other', 'move_id_other', 'IDs', 10, H),
  c('diagram_id', 'diagram_id', 'IDs', 10, H),
  c('first_row_of_component', 'first_row_of_component', 'IDs', 10, H),
];
