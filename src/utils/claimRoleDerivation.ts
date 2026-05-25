// Derive a claim's effective role from the connection graph.
//
// A claim element in Anna Conner's Extended Toulmin framework can take on
// secondary roles based on how its outgoing connections wire into the rest
// of the diagram:
//
//   - "data": the claim is being used as data for another claim's argument.
//     Detected by: an outgoing connection from the claim to another claim
//     element (not to an arrow attachment).
//
//   - "warrant": the claim is attached perpendicularly to some other
//     data→claim connection, playing the warrant role for that inference.
//     Detected by: an outgoing connection from the claim whose `to` is an
//     ArrowAttachment (ConnectionTarget) rather than an element id.
//
//   - Both roles can be active at once → "data+warrant".
//
// Removing the relevant outgoing connection reverts the claim to "plain".
// Storage is unchanged — argumentType stays 'claim'; the role is computed
// at render time.

import type { ArgumentElement, Connection, DiagramElement } from '../types';
import { isArrowAttachment } from '../types';

export type ClaimRole = 'plain' | 'data' | 'warrant' | 'data+warrant';

export function getClaimRole(
  claim: ArgumentElement,
  connections: readonly Connection[],
  elementsById: ReadonlyMap<string, DiagramElement>,
): ClaimRole {
  if (claim.argumentType !== 'claim') return 'plain';

  let asData = false;
  let asWarrant = false;

  for (const c of connections) {
    if (c.from !== claim.id) continue;
    if (isArrowAttachment(c.to)) {
      asWarrant = true;
    } else {
      const target = elementsById.get(c.to);
      if (target && target.type === 'argument' && target.argumentType === 'claim') {
        asData = true;
      }
    }
    if (asData && asWarrant) break;
  }

  if (asData && asWarrant) return 'data+warrant';
  if (asData) return 'data';
  if (asWarrant) return 'warrant';
  return 'plain';
}

// Match the auto-generated "Claim N" pattern (and bare "Claim"). User-renamed
// labels — anything else — are returned unchanged so we don't stomp on
// customization.
const DEFAULT_CLAIM_LABEL_RE = /^Claim(\s+\d+)?$/;

export function deriveClaimLabel(label: string, role: ClaimRole): string {
  if (role === 'plain') return label;
  if (!DEFAULT_CLAIM_LABEL_RE.test(label)) return label;

  const numberPart = label.slice('Claim'.length).trim();
  const suffix = numberPart ? ` ${numberPart}` : '';

  switch (role) {
    case 'data':         return `Dataclaim${suffix}`;
    case 'warrant':      return `Warrantclaim${suffix}`;
    case 'data+warrant': return `Dataclaim/Warrantclaim${suffix}`;
  }
}
