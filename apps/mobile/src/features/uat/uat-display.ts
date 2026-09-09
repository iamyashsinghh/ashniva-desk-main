import { UAT_DECISION, type UatDecision } from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';

/**
 * Sign-off status, in words a client would use.
 *
 * The shared status-tone table has no entry for a UAT decision — it is a three-value answer
 * rather than a workflow status — so the mapping lives here. The tones are the same six the rest
 * of the app uses, and every one of them is drawn as a pill whose *text* carries the meaning:
 * nothing on these screens is distinguishable by colour alone.
 */

const LABELS: Record<UatDecision, string> = {
  [UAT_DECISION.PENDING]: 'Waiting for you',
  [UAT_DECISION.APPROVED]: 'You approved it',
  [UAT_DECISION.CHANGES_REQUESTED]: 'You asked for changes',
};

const TONES: Record<UatDecision, PillTone> = {
  [UAT_DECISION.PENDING]: 'warning',
  [UAT_DECISION.APPROVED]: 'success',
  [UAT_DECISION.CHANGES_REQUESTED]: 'danger',
};

export function uatStatusLabel(status: UatDecision): string {
  return LABELS[status] ?? status;
}

export function uatStatusTone(status: UatDecision): PillTone {
  return TONES[status] ?? 'neutral';
}

/** Whether the request is still open. A decided one is read-only, here and in the API. */
export function isAwaitingDecision(status: UatDecision): boolean {
  return status === UAT_DECISION.PENDING;
}
