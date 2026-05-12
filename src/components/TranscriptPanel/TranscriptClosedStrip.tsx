import { theme } from '../../utils/theme';

interface TranscriptClosedStripProps {
  onOpen: () => void;
}

export function TranscriptClosedStrip({ onOpen }: TranscriptClosedStripProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Show transcript panel"
      aria-label="Show transcript panel"
      className="w-7 border-l flex items-center justify-center transition-colors duration-150"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
        color: theme.sidebar.textSecondary,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '';
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        }}
      >
        Transcript ▸
      </span>
    </button>
  );
}
