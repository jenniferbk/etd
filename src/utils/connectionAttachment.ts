// Which argument elements may attach perpendicularly to a connection (the
// "attach to an arrow" gesture) rather than only to another element.
//
// In Anna Conner's Extended Toulmin framework these are the inference-modifying
// elements: warrants and their backings attach to a data→claim connection to
// justify the inference, an implicit element plays the (implicit) warrant role,
// and a rebuttal attaches to the connection to mark an exception to that same
// inference.
//
// Pure predicate — no component state. Used to decide whether connect-mode is
// "active" for arrows when a connection is being drawn from this element.

import type { DiagramElement } from '../types';
import { isArgumentElement } from '../types';

export function canAttachToConnection(element: DiagramElement | null | undefined): boolean {
  if (!element || !isArgumentElement(element)) return false;
  return (
    element.argumentType === 'warrant' ||
    element.argumentType === 'backing' ||
    element.argumentType === 'rebuttal' ||
    element.contributor === 'implicit'
  );
}
