// Color constants from REQUIREMENTS.md Appendix A

// Contributor Colors
export const COLORS = {
  // Contributor border colors
  given: '#228B22',      // Forest green
  student: '#0000CD',    // Medium blue
  teacher: '#CC0000',    // Red
  joint: '#800080',      // Purple
  implicit: '#000000',   // Black

  // Support Colors
  teacherAction: '#CC0000',     // Red (teacher action)
  studentAction: '#0000CD',     // Blue (student action)
  question: '#00CED1',          // Dark cyan/aqua
  questionFill: '#E0FFFF',      // Light cyan
  otherSupport: '#DAA520',      // Goldenrod
  otherSupportFill: '#FFFACD', // Lemon chiffon

  // UI Colors
  canvasBackground: '#FFFFFF',
  gridLines: '#E5E5E5',
  selectionHighlight: '#4A90D9',
} as const;

// Get border color for a contributor type
export function getContributorColor(contributor: string): string {
  switch (contributor) {
    case 'given':
      return COLORS.given;
    case 'student':
      return COLORS.student;
    case 'teacher':
      return COLORS.teacher;
    case 'joint':
      return COLORS.joint;
    case 'implicit':
      return COLORS.implicit;
    default:
      return COLORS.student;
  }
}

// Get colors for support type based on contributor.
// Border is always contributor-derived (teacher=red, student=blue).
// Fill is type-derived so the support type is still visually distinct:
//   action  → white
//   question → light cyan
//   other   → lemon chiffon
export function getSupportColors(supportType: string, contributor: 'teacher' | 'student' = 'teacher'): { border: string; fill: string } {
  const border = contributor === 'teacher' ? COLORS.teacherAction : COLORS.studentAction;
  switch (supportType) {
    case 'question':
      return { border, fill: COLORS.questionFill };
    case 'other':
      return { border, fill: COLORS.otherSupportFill };
    case 'action':
    default:
      return { border, fill: '#FFFFFF' };
  }
}

// Deprecated - use getSupportColors instead
export function getTeacherSupportColors(supportType: string): { border: string; fill: string } {
  return getSupportColors(supportType, 'teacher');
}
