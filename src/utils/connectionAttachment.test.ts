import { describe, it, expect } from 'vitest';
import { canAttachToConnection } from './connectionAttachment';
import type { ArgumentElement, SupportElement, ArgumentType, ContributorType } from '../types';

function arg(argumentType: ArgumentType, contributor: ContributorType = 'student'): ArgumentElement {
  return {
    id: 'a',
    type: 'argument',
    argumentType,
    contributor,
    label: '',
    content: '',
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
  };
}

describe('canAttachToConnection', () => {
  it('allows warrant, backing, and rebuttal to attach to a connection', () => {
    expect(canAttachToConnection(arg('warrant'))).toBe(true);
    expect(canAttachToConnection(arg('backing'))).toBe(true);
    expect(canAttachToConnection(arg('rebuttal'))).toBe(true);
  });

  it('allows an implicit-contributor element to attach to a connection', () => {
    expect(canAttachToConnection(arg('warrant', 'implicit'))).toBe(true);
    expect(canAttachToConnection(arg('claim', 'implicit'))).toBe(true);
  });

  it('does not allow plain data or claim to attach to a connection', () => {
    expect(canAttachToConnection(arg('data'))).toBe(false);
    expect(canAttachToConnection(arg('claim'))).toBe(false);
  });

  it('returns false for support elements and null', () => {
    const support: SupportElement = {
      id: 's',
      type: 'support',
      contributor: 'teacher',
      supportType: 'action',
      content: '',
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
    };
    expect(canAttachToConnection(support)).toBe(false);
    expect(canAttachToConnection(null)).toBe(false);
    expect(canAttachToConnection(undefined)).toBe(false);
  });
});
