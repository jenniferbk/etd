// Color constants from REQUIREMENTS.md Appendix A

// Contributor Colors
export const COLORS = {
  // Contributor border colors
  given: '#228B22',      // Forest green
  student: '#0000CD',    // Medium blue
  joint: '#800080',      // Purple
  implicit: '#000000',   // Black

  // Teacher Support Colors
  teacherAction: '#CC0000',     // Red
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
    case 'joint':
      return COLORS.joint;
    case 'implicit':
      return COLORS.implicit;
    default:
      return COLORS.student;
  }
}

// Get colors for teacher support type
export function getTeacherSupportColors(supportType: string): { border: string; fill: string } {
  switch (supportType) {
    case 'action':
      return { border: COLORS.teacherAction, fill: '#FFFFFF' };
    case 'question':
      return { border: COLORS.question, fill: COLORS.questionFill };
    case 'other':
      return { border: COLORS.otherSupport, fill: COLORS.otherSupportFill };
    default:
      return { border: COLORS.teacherAction, fill: '#FFFFFF' };
  }
}
