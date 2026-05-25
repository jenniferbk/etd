import type { StyleConfig, Subtype } from '../types/styleConfig';

// Normalize a loaded styleConfig into the current in-memory shape.
//
// v1.3/v1.4 wire format had `otherSubtypes: Subtype[]` at the top level.
// v1.5+ wire format has `subtypes: Record<SupportType, Subtype[]>` instead.
// When loading older files we move `otherSubtypes` under `subtypes.other`
// and initialize the action/question buckets to empty.
//
// Returns the input unchanged when it's already in the new shape, so this is
// a safe no-op for v1.5+ files. Accepts `unknown` because save files come
// from JSON.parse — caller should not have to pre-shape them.
export function normalizeStyleConfig(loaded: unknown): StyleConfig {
  const obj = loaded as Partial<StyleConfig> & { otherSubtypes?: Subtype[] };
  if (obj.subtypes) {
    return obj as StyleConfig;
  }
  return {
    argumentTypes: obj.argumentTypes!,
    supportTypes:  obj.supportTypes!,
    subtypes: {
      action:   [],
      question: [],
      other:    obj.otherSubtypes ?? [],
    },
  };
}

// FROZEN — never modify default VALUES. Used only for v1.2 → v1.3 load migration.
// If defaults change in the future, change createCurrentDefaults instead.
// (The shape — subtypes: Record<SupportType, Subtype[]> — was introduced in v1.5
// and is the in-memory shape this factory returns even though it represents
// v1.2-era defaults. The six 'other' subtype VALUES are the frozen contract.)
export function createV1_2_MigrationDefaults(): StyleConfig {
  return {
    argumentTypes: {
      data:      { label: 'Data',      borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      claim:     { label: 'Claim',     borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      warrant:   { label: 'Warrant',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      backing:   { label: 'Backing',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      qualifier: { label: 'Qualifier', borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      rebuttal:  { label: 'Rebuttal',  borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
    },
    supportTypes: {
      action:   { label: 'Action',   borderStyle: 'solid', borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
      question: { label: 'Question', borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#E0FFFF' },
      other:    { label: 'Other',    borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#FFFACD' },
    },
    subtypes: {
      action:   [],
      question: [],
      other: [
        { id: 'displays',   label: 'Displays' },
        { id: 'suggests',   label: 'Suggests' },
        { id: 'summarizes', label: 'Summarizes' },
        { id: 'restates',   label: 'Restates' },
        { id: 'highlights', label: 'Highlights' },
        { id: 'validates',  label: 'Validates' },
      ],
    },
  };
}

// Used for new diagrams, "Reset all type styles", "Reset subtypes to defaults",
// and per-type resets. Safe to evolve in future releases.
//
// IMPORTANT: this function MUST NOT delegate to createV1_2_MigrationDefaults.
// They are intentionally independent literal copies at launch so that future
// edits here cannot accidentally modify the frozen v1.2 contract.
export function createCurrentDefaults(): StyleConfig {
  return {
    argumentTypes: {
      data:      { label: 'Data',      borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      claim:     { label: 'Claim',     borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      warrant:   { label: 'Warrant',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      backing:   { label: 'Backing',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      qualifier: { label: 'Qualifier', borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      rebuttal:  { label: 'Rebuttal',  borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
    },
    supportTypes: {
      action:   { label: 'Action',   borderStyle: 'solid', borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
      question: { label: 'Question', borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#E0FFFF' },
      other:    { label: 'Other',    borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#FFFACD' },
    },
    subtypes: {
      action:   [],
      question: [],
      other: [
        { id: 'displays',   label: 'Displays' },
        { id: 'suggests',   label: 'Suggests' },
        { id: 'summarizes', label: 'Summarizes' },
        { id: 'restates',   label: 'Restates' },
        { id: 'highlights', label: 'Highlights' },
        { id: 'validates',  label: 'Validates' },
      ],
    },
  };
}
