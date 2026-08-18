import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it('maps the used/expired invite message', () => {
    expect(friendlyError(new ApiError(400, 'invalid or expired invite'))).toBe(
      'That invite link has already been used or expired — ask your group admin for a new one.',
    );
  });

  it('maps the used/expired reset-token message', () => {
    expect(friendlyError(new ApiError(400, 'invalid or expired reset token'))).toBe(
      'That reset link has already been used or expired — ask your group admin for a new one.',
    );
  });

  it('maps the wrong-password message', () => {
    expect(friendlyError(new ApiError(401, 'invalid email or password'))).toBe(
      "That email and password don't match — try again, or ask your group admin to reset your password.",
    );
  });

  it('maps the delete-permission message', () => {
    expect(friendlyError(new ApiError(403, 'only the creator or a group admin can delete a diagram'))).toBe(
      'Only the person who created this diagram or a group admin can delete it.',
    );
  });

  it('maps fetch network failures (TypeError) to a connection hint', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toBe(
      "Can't reach the server — check your connection (and the VPN, if you're off campus).",
    );
  });

  it('passes through unmapped ApiError messages verbatim', () => {
    expect(friendlyError(new ApiError(404, 'diagram not found'))).toBe('diagram not found');
  });

  it('uses the fallback for unknown errors', () => {
    expect(friendlyError(42)).toBe('Something went wrong — please try again.');
    expect(friendlyError(new Error('boom'), 'custom fallback')).toBe('boom');
  });
});
