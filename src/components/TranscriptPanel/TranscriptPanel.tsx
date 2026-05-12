import { useMemo, useRef, useState } from 'react';
import { PanelRightClose, Search, FileText, Upload } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
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
  const addToast = useToastStore((s) => s.addToast);
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

  const selectedIds = useDiagramStore((s) => s.selectedIds);

  const linkedLineIndexes = useMemo(() => {
    if (!transcript) return new Set<number>();
    const selected = new Set(selectedIds);
    const set = new Set<number>();
    for (const el of elements) {
      if (!selected.has(el.id)) continue;
      if (el.sourceTranscript?.transcriptId === transcript.id) {
        set.add(el.sourceTranscript.lineIndex);
      }
    }
    return set;
  }, [elements, selectedIds, transcript]);

  const [searchQuery, setSearchQuery] = useState('');

  const filteredLines = useMemo(() => {
    if (!transcript) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transcript.lines;
    return transcript.lines.filter(
      (line) =>
        line.text.toLowerCase().includes(q) ||
        (line.speaker?.toLowerCase().includes(q) ?? false),
    );
  }, [transcript, searchQuery]);

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
        const proceed = await confirmAsync({
          title: 'Replace transcript?',
          message: `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
          confirmLabel: 'Replace transcript',
          cancelLabel: 'Cancel',
        });
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
        addToast('error', `No valid transcript lines found in ${file.name}.`);
        e.target.value = '';
        return;
      }
      setTranscript(parsed);
    } catch (err) {
      console.error('Failed to read transcript file:', err);
      addToast('error', 'Failed to read transcript file.');
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
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <FileText
            size={28}
            aria-hidden="true"
            style={{ color: theme.sidebar.muted }}
          />
          <p
            className="text-sm leading-relaxed"
            style={{ color: theme.sidebar.textSecondary }}
          >
            No transcript loaded · load a .txt file to link argument elements to spoken lines.
          </p>
          <button
            onClick={handleLoadClick}
            className="px-3 py-2 text-sm font-medium rounded-md border transition-colors duration-150 inline-flex items-center gap-2"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              borderColor: theme.button.secondary.border,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme.button.secondary.bg;
            }}
          >
            <Upload size={14} aria-hidden="true" />
            Load transcript
          </button>
        </div>
      )}

      {transcript && (
        <>
          <div
            className="px-3 py-2 border-b"
            style={{ borderColor: theme.sidebar.border }}
          >
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: theme.sidebar.muted }}
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcript…"
                aria-label="Search transcript lines"
                className="w-full pl-8 pr-2.5 py-1.5 text-sm rounded-md border transition-colors duration-150 focus:outline-none"
                style={{
                  backgroundColor: theme.input.bg,
                  borderColor: theme.input.border,
                  color: theme.input.text,
                }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredLines.map((line, idx) => (
              <TranscriptPanelItem
                key={line.index}
                line={line}
                transcriptId={transcript.id}
                used={usedLineIndexes.has(line.index)}
                linkedToSelection={linkedLineIndexes.has(line.index)}
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
            {filteredLines.length === 0 && searchQuery.trim() !== '' && (
              <div
                className="px-5 py-6 text-center text-sm italic"
                style={{ color: theme.sidebar.textSecondary }}
              >
                No lines match "{searchQuery.trim()}".
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
