import { useMemo, useRef } from 'react';
import { PanelRightClose } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { theme } from '../../utils/theme';
import { parseTranscript } from '../../utils/transcriptParser';
import { TranscriptPanelItem } from './TranscriptPanelItem';

interface TranscriptPanelProps {
  onClose: () => void;
}

export function TranscriptPanel({ onClose }: TranscriptPanelProps) {
  const transcript = useDiagramStore((s) => s.transcript);
  const setTranscript = useDiagramStore((s) => s.setTranscript);
  const updateTranscriptLine = useDiagramStore((s) => s.updateTranscriptLine);
  const elements = useDiagramStore((s) => s.elements);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived: which line indexes are "used" (referenced by at least one element).
  const usedLineIndexes = useMemo(() => {
    if (!transcript) return new Set<number>();
    const set = new Set<number>();
    for (const el of elements) {
      if (el.sourceTranscript?.transcriptId === transcript.id) {
        set.add(el.sourceTranscript.lineIndex);
      }
    }
    return set;
  }, [elements, transcript]);

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Orphan check: warn if replacing a transcript whose lines are referenced by canvas elements.
    if (transcript) {
      const orphanCount = elements.filter(
        (el) => el.sourceTranscript?.transcriptId === transcript.id,
      ).length;
      if (orphanCount > 0) {
        const proceed = confirm(
          `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
        );
        if (!proceed) {
          e.target.value = '';
          return;
        }
      }
    }

    try {
      const text = await file.text();
      const parsed = parseTranscript(text, file.name);
      if (parsed.lines.length === 0) {
        alert(`No valid transcript lines found in ${file.name}.`);
        e.target.value = '';
        return;
      }
      setTranscript(parsed);
    } catch (err) {
      console.error('Failed to read transcript file:', err);
      alert('Failed to read transcript file.');
    }
    e.target.value = '';
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: theme.sidebar.border }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2
            className="font-semibold text-sm uppercase tracking-wider"
            style={{ color: theme.sidebar.text }}
          >
            Transcript
          </h2>
          {transcript && (
            <button
              onClick={handleClose}
              className="p-1 rounded transition-colors duration-150"
              title="Hide panel"
              aria-label="Hide transcript panel"
              style={{ color: theme.sidebar.textSecondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.sidebar.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <PanelRightClose size={16} />
            </button>
          )}
        </div>
        {transcript && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span
              className="font-mono truncate flex-1 min-w-0"
              style={{ color: theme.sidebar.textSecondary }}
              title={transcript.filename}
            >
              {transcript.filename}
            </span>
            <span
              className="flex-shrink-0"
              style={{ color: theme.sidebar.muted }}
            >
              {transcript.lines.length} line{transcript.lines.length === 1 ? '' : 's'}
              {transcript.parseWarnings.length > 0 && ` · ${transcript.parseWarnings.length} skipped`}
            </span>
          </div>
        )}
      </div>

      {!transcript && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p
            className="text-sm mb-4"
            style={{ color: theme.sidebar.textSecondary }}
          >
            No transcript loaded.
          </p>
          <button
            onClick={handleLoadClick}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: theme.sidebar.surface,
              color: theme.sidebar.text,
              borderWidth: '1px',
              borderColor: theme.sidebar.border,
            }}
          >
            Load transcript (.txt)
          </button>
        </div>
      )}

      {transcript && (
        <>
          <div className="flex-1 overflow-y-auto">
            {transcript.lines.map((line, idx) => (
              <TranscriptPanelItem
                key={line.index}
                line={line}
                transcriptId={transcript.id}
                used={usedLineIndexes.has(line.index)}
                dismissed={line.dismissed === true}
                altRow={idx % 2 === 1}
                onContributorChange={(value) =>
                  updateTranscriptLine(line.index, { contributor: value })
                }
                onObjectTypeChange={(objectType, subtype) =>
                  updateTranscriptLine(line.index, { objectType, subtype })
                }
                onDismissChange={(value) =>
                  updateTranscriptLine(line.index, { dismissed: value })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
