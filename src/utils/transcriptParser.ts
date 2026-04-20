// Parses a plain-text transcript (optionally with inline [contributor|objectType] tags)
// into a Transcript object. Pure function — no side effects.

import type { Transcript, TranscriptLine, TranscriptObjectType } from '../types/transcript';
import type { ContributorType, ArgumentType, SupportType } from '../types/elements';

const CONTRIBUTOR_VALUES: ContributorType[] = ['given', 'student', 'teacher', 'joint', 'implicit'];
const ARGUMENT_VALUES: ArgumentType[] = ['data', 'claim', 'warrant', 'backing', 'qualifier', 'rebuttal'];
const SUPPORT_VALUES: SupportType[] = ['action', 'question', 'other'];

// Matches the whole line shape:
//   <timestamp> <speaker>[ <tag>]: <text>
// Timestamp: MM:SS, MM:SS.s, H:MM:SS, H:MM:SS.s
// Speaker: anything up to '[' or ':'; trimmed
// Tag (optional): [contributor|objectType], either side may be empty
// Text: everything after the final colon
const LINE_RE =
  /^\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+([^[:]+?)\s*(?:\[([^|\]]*)\|([^|\]]*)\])?\s*:\s*(.+?)\s*$/;

function normalizeContributor(raw: string | undefined): ContributorType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  return (CONTRIBUTOR_VALUES as string[]).includes(lower) ? (lower as ContributorType) : null;
}

function normalizeObjectType(raw: string | undefined): TranscriptObjectType | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if ((ARGUMENT_VALUES as string[]).includes(lower)) return lower as ArgumentType;
  if ((SUPPORT_VALUES as string[]).includes(lower)) return lower as SupportType;
  return null;
}

// Auto-infer contributor from the speaker label.
// Rules (case-insensitive):
//   starts with "Teacher"  -> "teacher"
//   starts with "Student"  -> "student" (also matches "Students", "Students (chorus)")
//   otherwise              -> null
// NEVER infers joint/given/implicit.
function inferContributor(speaker: string): ContributorType | null {
  const lower = speaker.trim().toLowerCase();
  if (lower.startsWith('teacher')) return 'teacher';
  if (lower.startsWith('student')) return 'student';
  return null;
}

function generateTranscriptId(): string {
  // crypto.randomUUID is available in all modern browsers and in Node 19+.
  return crypto.randomUUID();
}

export function parseTranscript(text: string, filename: string): Transcript {
  const rawLines = text.split(/\r?\n/);
  const lines: TranscriptLine[] = [];
  const parseWarnings: string[] = [];
  let index = 0;

  rawLines.forEach((raw, lineNumber) => {
    const trimmed = raw.trim();
    if (trimmed === '') return; // blank lines skipped silently

    const match = raw.match(LINE_RE);
    if (!match) {
      parseWarnings.push(`Line ${lineNumber + 1} skipped: did not match transcript grammar.`);
      return;
    }

    const [, timestamp, speakerRaw, contribRaw, typeRaw, textRaw] = match;
    const speaker = speakerRaw.trim();

    // Tag values: if present but invalid, warn and treat as missing.
    const tagWasPresent = contribRaw !== undefined || typeRaw !== undefined;
    const contribFromTag = normalizeContributor(contribRaw);
    const typeFromTag = normalizeObjectType(typeRaw);

    if (tagWasPresent) {
      if (contribRaw && contribRaw.trim() !== '' && !contribFromTag) {
        parseWarnings.push(`Line ${lineNumber + 1}: unrecognized contributor "${contribRaw.trim()}"; treated as unset.`);
      }
      if (typeRaw && typeRaw.trim() !== '' && !typeFromTag) {
        parseWarnings.push(`Line ${lineNumber + 1}: unrecognized object type "${typeRaw.trim()}"; treated as unset.`);
      }
    }

    // Tag takes precedence over inference; inference fills in when tag is missing/blank.
    const contributor = contribFromTag ?? inferContributor(speaker);

    lines.push({
      index: index++,
      timestamp,
      speaker,
      text: textRaw.trim(),
      contributor,
      objectType: typeFromTag,
    });
  });

  return {
    id: generateTranscriptId(),
    filename,
    lines,
    parseWarnings,
  };
}
