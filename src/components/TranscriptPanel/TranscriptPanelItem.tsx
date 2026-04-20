import type { ContributorType } from '../../types/elements';
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

const OBJECT_TYPE_OPTIONS: { value: TranscriptObjectType | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'data', label: 'Data' },
  { value: 'claim', label: 'Claim' },
  { value: 'warrant', label: 'Warrant' },
  { value: 'backing', label: 'Backing' },
  { value: 'qualifier', label: 'Qualifier' },
  { value: 'rebuttal', label: 'Rebuttal' },
  { value: 'action', label: 'Action' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other Support' },
];

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
  onObjectTypeChange: (value: TranscriptObjectType | null) => void;
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
    };
    e.dataTransfer.setData('application/x-etd-transcript-line', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const borderColor = line.contributor ? getContributorColor(line.contributor) : theme.sidebar.border;

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
          className="flex-1 px-2 py-1 text-xs rounded border"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.text,
            borderColor: theme.sidebar.border,
          }}
        >
          {CONTRIBUTOR_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={line.objectType ?? ''}
          onChange={(e) => onObjectTypeChange(e.target.value === '' ? null : (e.target.value as TranscriptObjectType))}
          className="flex-1 px-2 py-1 text-xs rounded border"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.text,
            borderColor: theme.sidebar.border,
          }}
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
