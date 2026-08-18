import { ApiError } from './client';

// Server messages → plain language for non-technical researchers.
// Unmapped ApiError messages pass through verbatim; they are already
// human-readable JSON error strings from our own server.
const MESSAGE_MAP: Record<string, string> = {
  'invalid or expired invite':
    'That invite link has already been used or expired — ask your group admin for a new one.',
  'invalid or expired reset token':
    'That reset link has already been used or expired — ask your group admin for a new one.',
  'invalid email or password':
    "That email and password don't match — try again, or ask your group admin to reset your password.",
  'only the creator or a group admin can delete a diagram':
    'Only the person who created this diagram or a group admin can delete it.',
};

export function friendlyError(
  err: unknown,
  fallback = 'Something went wrong — please try again.',
): string {
  if (err instanceof ApiError) {
    return MESSAGE_MAP[err.message] ?? err.message;
  }
  if (err instanceof TypeError) {
    // fetch() rejects with TypeError on network failure
    return "Can't reach the server — check your connection (and the VPN, if you're off campus).";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
