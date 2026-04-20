import type { ContributorType, SupportSubtype } from '../../types/elements';
import type { TranscriptLine, TranscriptObjectType } from '../../types/transcript';
import { theme } from '../../utils/theme';
import { getContributorColor } from '../../utils/colors';

const CONTRIBUTOR_OPTIONS: { value: ContributorType | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'given', label: 'Given' },
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];

// Composite dropdown values. For "other" supports, the value encodes the subtype as
// "other:displays" / "other:suggests" / etc. All other entries are just the objectType.
type ObjectTypeOption = {
  value: string;               // "" | "claim" | "action" | "other:displays" | ...
  label: string;
  objectType: TranscriptObjectType | null;
  subtype?: SupportSubtype;
};

const OBJECT_TYPE_OPTIONS: ObjectTypeOption[] = [
  { value: '', label: '—', objectType: null },
  { value: 'data', label: 'Data', objectType: 'data' },
  { value: 'claim', label: 'Claim', objectType: 'claim' },
  { value: 'warrant', label: 'Warrant', objectType: 'warrant' },
  { value: 'backing', label: 'Backing', objectType: 'backing' },
  { value: 'qualifier', label: 'Qualifier', objectType: 'qualifier' },
  { value: 'rebuttal', label: 'Rebuttal', objectType: 'rebuttal' },
  { value: 'action', label: 'Action', objectType: 'action' },
  { value: 'question', label: 'Question', objectType: 'question' },
  { value: 'other:displays', label: 'Other Support: Displays', objectType: 'other', subtype: 'displays' },
  { value: 'other:suggests', label: 'Other Support: Suggests', objectType: 'other', subtype: 'suggests' },
  { value: 'other:summarizes', label: 'Other Support: Summarizes', objectType: 'other', subtype: 'summarizes' },
  { value: 'other:restates', label: 'Other Support: Restates', objectType: 'other', subtype: 'restates' },
  { value: 'other:highlights', label: 'Other Support: Highlights', objectType: 'other', subtype: 'highlights' },
  { value: 'other:validates', label: 'Other Support: Validates', objectType: 'other', subtype: 'validates' },
];

function encodeObjectTypeValue(objectType: TranscriptObjectType | null, subtype?: SupportSubtype): string {
  if (objectType === null) return '';
  if (objectType === 'other') return `other:${subtype ?? 'displays'}`;
  return objectType;
}

function decodeObjectTypeValue(value: string): { objectType: TranscriptObjectType | null; subtype?: SupportSubtype } {
  const match = OBJECT_TYPE_OPTIONS.find((opt) => opt.value === value);
  if (!match) return { objectType: null };
  return { objectType: match.objectType, subtype: match.subtype };
}

// Support elements are limited to teacher|student contributors.
function isIncompatible(contributor: ContributorType | null, objectType: TranscriptObjectType | null): boolean {
  if (contributor == null || objectType == null) return false;
  const isSupport = objectType === 'action' || objectType === 'question' || objectType === 'other';
  if (!isSupport) return false;
  return contributor !== 'teacher' && contributor !== 'student';
}

export interface TranscriptPanelItemProps {
  line: TranscriptLine;
  transcriptId: string;
  used: boolean;
  onContributorChange: (value: ContributorType | null) => void;
  onObjectTypeChange: (objectType: TranscriptObjectType | null, subtype?: SupportSubtype) => void;
}

export function TranscriptPanelItem({
  line,
  transcriptId,
  used,
  onContributorChange,
  onObjectTypeChange,
}: TranscriptPanelItemProps) {
  const incompatible = isIncompatible(line.contributor, line.objectType);
  const canDrag = line.contributor !== null && line.objectType !== null && !incompatible;

  const dragTooltip = !canDrag
    ? incompatible
      ? 'Support elements require teacher or student contributor.'
      : 'Set contributor and object type first.'
    : '';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    const payload = {
      kind: 'transcript-line',
      transcriptId,
      lineIndex: line.index,
      // Inline what the Canvas needs so it doesn't have to re-read the store on drop:
      speaker: line.speaker,
      timestamp: line.timestamp,
      text: line.text,
      contributor: line.contributor,
      objectType: line.objectType,
      subtype: line.subtype,
    };
    e.dataTransfer.setData('application/x-etd-transcript-line', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const borderColor = line.contributor ? getContributorColor(line.contributor) : theme.sidebar.border;

  // Dropdowns styled with accent border + input bg so they visually pop against the card surface.
  const dropdownStyle: React.CSSProperties = {
    backgroundColor: theme.input.bg,
    color: theme.input.text,
    borderColor: theme.sidebar.accent,
    borderWidth: '1px',
    fontWeight: 500,
    boxShadow: `0 0 0 1px ${theme.colors.accent.glow}`,
  };

  return (
    <div
      draggable={canDrag}
      onDragStart={handleDragStart}
      title={dragTooltip || undefined}
      className="rounded-lg p-3 mb-2 transition-all duration-150"
      style={{
        backgroundColor: theme.sidebar.surface,
        borderLeft: `3px solid ${borderColor}`,
        opacity: used ? 0.55 : 1,
        cursor: canDrag ? 'grab' : 'not-allowed',
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <div
          className="text-xs font-mono"
          style={{ color: theme.sidebar.muted }}
        >
          {line.timestamp}  <span style={{ color: theme.sidebar.textSecondary }}>{line.speaker}</span>
        </div>
        {used && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: theme.sidebar.accent }}
          >
            ✓ used
          </span>
        )}
      </div>

      <div
        className="text-sm mb-2"
        style={{
          color: theme.sidebar.text,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={line.text}
      >
        {line.text}
      </div>

      <div className="flex gap-2">
        <select
          value={line.contributor ?? ''}
          onChange={(e) => onContributorChange(e.target.value === '' ? null : (e.target.value as ContributorType))}
          className="flex-1 px-2 py-1 text-xs rounded"
          style={dropdownStyle}
        >
          {CONTRIBUTOR_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={encodeObjectTypeValue(line.objectType, line.subtype)}
          onChange={(e) => {
            const { objectType, subtype } = decodeObjectTypeValue(e.target.value);
            onObjectTypeChange(objectType, subtype);
          }}
          className="flex-1 px-2 py-1 text-xs rounded"
          style={dropdownStyle}
        >
          {OBJECT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {incompatible && (
        <div
          className="text-[10px] mt-1"
          style={{ color: '#ef4444' }}
        >
          Support requires teacher or student contributor.
        </div>
      )}
    </div>
  );
}
