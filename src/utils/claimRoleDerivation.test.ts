import { describe, it, expect } from 'vitest';
import type { ArgumentElement, Connection, DiagramElement } from '../types';
import { getClaimRole, deriveClaimLabel } from './claimRoleDerivation';

function claim(id: string, label = `Claim ${id}`): ArgumentElement {
  return {
    id,
    type: 'argument',
    argumentType: 'claim',
    contributor: 'student',
    label,
    content: '',
    position: { x: 0, y: 0 },
    size: { width: 180, height: 80 },
  };
}

function data(id: string): ArgumentElement {
  return {
    id,
    type: 'argument',
    argumentType: 'data',
    contributor: 'given',
    label: `Data ${id}`,
    content: '',
    position: { x: 0, y: 0 },
    size: { width: 180, height: 80 },
  };
}

function elementsById(els: DiagramElement[]): Map<string, DiagramElement> {
  return new Map(els.map((el) => [el.id, el]));
}

function elemConn(id: string, from: string, to: string): Connection {
  return { id, from, to, type: 'support' };
}

function arrowConn(id: string, from: string, attachToConnectionId: string): Connection {
  return { id, from, to: { connectionId: attachToConnectionId, position: 0.5 }, type: 'support' };
}

describe('getClaimRole', () => {
  it('returns plain for a claim with no outgoing connections', () => {
    const c1 = claim('1');
    expect(getClaimRole(c1, [], elementsById([c1]))).toBe('plain');
  });

  it('returns plain for a non-claim argument element regardless of edges', () => {
    const d1 = data('1');
    const c1 = claim('2');
    const conns = [elemConn('e1', '1', '2')];
    expect(getClaimRole(d1, conns, elementsById([d1, c1]))).toBe('plain');
  });

  it('returns data when claim has an outgoing connection to another claim', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const conns = [elemConn('e1', '1', '2')];
    expect(getClaimRole(c1, conns, elementsById([c1, c2]))).toBe('data');
  });

  it('does NOT mark a claim as dataclaim when its outgoing edge targets non-claim', () => {
    const c1 = claim('1');
    const d2 = data('2');
    const conns = [elemConn('e1', '1', '2')];
    expect(getClaimRole(c1, conns, elementsById([c1, d2]))).toBe('plain');
  });

  it('returns warrant when claim attaches to another connection (arrow attachment)', () => {
    const c1 = claim('1');
    const conns = [arrowConn('e1', '1', 'parent-conn-id')];
    expect(getClaimRole(c1, conns, elementsById([c1]))).toBe('warrant');
  });

  it('returns data+warrant when claim has both roles', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const conns = [
      elemConn('e1', '1', '2'),
      arrowConn('e2', '1', 'some-other-conn'),
    ];
    expect(getClaimRole(c1, conns, elementsById([c1, c2]))).toBe('data+warrant');
  });

  it('ignores incoming connections', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const conns = [elemConn('e1', '2', '1')];
    expect(getClaimRole(c1, conns, elementsById([c1, c2]))).toBe('plain');
  });

  it('treats target-missing references as not-a-claim', () => {
    const c1 = claim('1');
    const conns = [elemConn('e1', '1', 'ghost-id')];
    expect(getClaimRole(c1, conns, elementsById([c1]))).toBe('plain');
  });
});

describe('getClaimRole ignores counterclaim links', () => {
  it('a claim→claim counterclaim does not make the source a data-claim', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const conns: Connection[] = [{ id: 'cc', from: '1', to: '2', type: 'counterclaim' }];
    expect(getClaimRole(c1, conns, elementsById([c1, c2]))).toBe('plain');
  });

  it('a counterclaim attached to a line does not make the source a warrant-claim', () => {
    const c1 = claim('1');
    const conns: Connection[] = [
      elemConn('base', 'd', 'x'),
      { id: 'cc', from: '1', to: { connectionId: 'base', position: 0.5 }, type: 'counterclaim' },
    ];
    expect(getClaimRole(c1, conns, elementsById([c1]))).toBe('plain');
  });

  it('a support link alongside a counterclaim still derives the role from the support link', () => {
    const c1 = claim('1');
    const c2 = claim('2');
    const c3 = claim('3');
    const conns: Connection[] = [
      { id: 'cc', from: '1', to: '2', type: 'counterclaim' },
      elemConn('s', '1', '3'),
    ];
    expect(getClaimRole(c1, conns, elementsById([c1, c2, c3]))).toBe('data');
  });
});

describe('deriveClaimLabel', () => {
  it('returns the input label unchanged when role is plain', () => {
    expect(deriveClaimLabel('Claim 1', 'plain')).toBe('Claim 1');
    expect(deriveClaimLabel('Anything', 'plain')).toBe('Anything');
  });

  it('rewrites the default "Claim N" pattern when role is data', () => {
    expect(deriveClaimLabel('Claim 1', 'data')).toBe('Dataclaim 1');
    expect(deriveClaimLabel('Claim 12', 'data')).toBe('Dataclaim 12');
  });

  it('rewrites the default "Claim N" pattern when role is warrant', () => {
    expect(deriveClaimLabel('Claim 3', 'warrant')).toBe('Warrantclaim 3');
  });

  it('rewrites with combined prefix when role is data+warrant', () => {
    expect(deriveClaimLabel('Claim 5', 'data+warrant')).toBe('Dataclaim/Warrantclaim 5');
  });

  it('handles bare "Claim" without a number', () => {
    expect(deriveClaimLabel('Claim', 'data')).toBe('Dataclaim');
  });

  it('leaves user-renamed labels alone', () => {
    expect(deriveClaimLabel('Pythagoras claim', 'data')).toBe('Pythagoras claim');
    expect(deriveClaimLabel('DataClaim 2', 'data')).toBe('DataClaim 2');
    expect(deriveClaimLabel('my claim', 'data')).toBe('my claim');
    expect(deriveClaimLabel('Claim 1 and more', 'data')).toBe('Claim 1 and more');
  });

  it('is case-sensitive on the "Claim" prefix (lowercase variants are user labels)', () => {
    expect(deriveClaimLabel('claim 1', 'data')).toBe('claim 1');
  });
});
