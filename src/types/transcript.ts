// Transcript types for the ingester panel
import type { ContributorType, ArgumentType, SupportType } from './elements';

// Object type on a transcript line is either an argument type or a support type
export type TranscriptObjectType = ArgumentType | SupportType;

export interface TranscriptLine {
  index: number;              // 0-based position within the transcript; stable
  timestamp: string;          // preserved verbatim (e.g. "55:07", "1:05:22.3")
  speaker: string;            // preserved verbatim (e.g. "Teacher-CurlyHair")
  text: string;               // the utterance body, trimmed
  contributor: ContributorType | null;
  objectType: TranscriptObjectType | null;
}

export interface Transcript {
  id: string;                 // uuid, stable across save/load
  filename: string;           // display only
  lines: TranscriptLine[];
  parseWarnings: string[];    // human-readable: "Line 12 skipped: could not parse timestamp"
}
