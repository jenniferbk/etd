import type { StyleConfig } from '../types/styleConfig';

// FROZEN — never modify. Used only for v1.2 → v1.3 load migration.
// If defaults change in the future, change createCurrentDefaults instead.
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
    otherSubtypes: [
      { id: 'displays',   label: 'Displays' },
      { id: 'suggests',   label: 'Suggests' },
      { id: 'summarizes', label: 'Summarizes' },
      { id: 'restates',   label: 'Restates' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'validates',  label: 'Validates' },
    ],
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
    otherSubtypes: [
      { id: 'displays',   label: 'Displays' },
      { id: 'suggests',   label: 'Suggests' },
      { id: 'summarizes', label: 'Summarizes' },
      { id: 'restates',   label: 'Restates' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'validates',  label: 'Validates' },
    ],
  };
}
