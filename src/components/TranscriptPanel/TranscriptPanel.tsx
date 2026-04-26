import { useMemo, useRef } from 'react';
import { X } from 'lucide-react';
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
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: theme.sidebar.border }}
      >
        <h2
          className="font-semibold text-sm uppercase tracking-wider"
          style={{ color: theme.sidebar.text }}
        >
          Transcript
        </h2>
        {transcript && (
          <button
            onClick={handleClose}
            className="p-1 rounded hover:opacity-80"
            title="Close transcript"
            style={{ color: theme.sidebar.textSecondary }}
          >
            <X size={16} />
          </button>
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
          <div
            className="px-5 py-2 text-xs"
            style={{ color: theme.sidebar.muted, borderColor: theme.sidebar.border, borderBottomWidth: '1px' }}
          >
            <div
              className="truncate"
              style={{ color: theme.sidebar.textSecondary }}
              title={transcript.filename}
            >
              {transcript.filename}
            </div>
            <div>
              {transcript.lines.length} line{transcript.lines.length === 1 ? '' : 's'}
              {transcript.parseWarnings.length > 0 && ` · ${transcript.parseWarnings.length} skipped`}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {transcript.lines.map((line, idx) => (
              <TranscriptPanelItem
                key={line.index}
                line={line}
                transcriptId={transcript.id}
                used={usedLineIndexes.has(line.index)}
                altRow={idx % 2 === 1}
                onContributorChange={(value) =>
                  updateTranscriptLine(line.index, { contributor: value })
                }
                onObjectTypeChange={(objectType, subtype) =>
                  updateTranscriptLine(line.index, { objectType, subtype })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
