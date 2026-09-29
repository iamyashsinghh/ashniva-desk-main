import { MILESTONE_STATUS_TONES, APPROVAL_STATUS_TONES, type Tone } from '@ashniva/ui/status-tone';
import {
  APPROVAL_STATUS_LABELS,
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABELS,
  type ApprovalStatus,
  type MilestoneHistoryEntry,
  type MilestoneStatus,
  type MilestoneSummary,
} from '@ashniva/types';

import type { ButtonVariant, PillTone } from '../../shared/components/primitives';

/** Words and colours for milestones, shared by the detail screen and every list that shows one. */

function toPillTone(tone: Tone | undefined): PillTone {
  if (!tone) {
    return 'neutral';
  }
  return tone === 'review' ? 'info' : tone;
}

export function milestoneStatusTone(status: MilestoneStatus): PillTone {
  return toPillTone(MILESTONE_STATUS_TONES[status]);
}

export function milestoneStatusLabel(status: MilestoneStatus): string {
  return MILESTONE_STATUS_LABELS[status] ?? status;
}

function isApprovalStatus(value: string): value is ApprovalStatus {
  return value in APPROVAL_STATUS_LABELS;
}

/**
 * The sign-off badge. No request yet reads as a job still to do; once one exists, its status is
 * what somebody wants to know.
 */
export function approvalBadge(status: string | null): { label: string; tone: PillTone } {
  if (status === null) {
    return { label: 'Needs client sign-off', tone: 'warning' };
  }
  if (isApprovalStatus(status)) {
    return {
      label: `Sign-off: ${APPROVAL_STATUS_LABELS[status].toLowerCase()}`,
      tone: toPillTone(APPROVAL_STATUS_TONES[status]),
    };
  }
  return { label: `Sign-off: ${status.toLowerCase()}`, tone: 'info' };
}

/** The bar's colour: late is the only thing worth colouring, and done is worth a green. */
export function progressTone(milestone: MilestoneSummary): 'primary' | 'success' | 'danger' {
  if (milestone.status === MILESTONE_STATUS.COMPLETED) {
    return 'success';
  }
  return milestone.isOverdue ? 'danger' : 'primary';
}

/** How the status buttons look: completing is the step forward, cancelling the quiet one. */
export function transitionVariant(status: MilestoneStatus): ButtonVariant {
  if (status === MILESTONE_STATUS.COMPLETED) {
    return 'primary';
  }
  if (status === MILESTONE_STATUS.CANCELLED) {
    return 'dangerGhost';
  }
  return 'secondary';
}

/** One history line, as the web writes it: "status: Planned → In progress · reason". */
export function historyLine(entry: MilestoneHistoryEntry): string {
  const change =
    entry.fromValue || entry.toValue ? `: ${entry.fromValue ?? '—'} → ${entry.toValue ?? '—'}` : '';
  return `${entry.kind.toLowerCase()}${change}${entry.reason ? ` · ${entry.reason}` : ''}`;
}

/** What a milestone write makes stale: the contract and project that list it, and the portal. */
export const MILESTONE_INVALIDATES = [
  ['milestones'],
  ['contracts'],
  ['projects'],
  ['portal'],
] as const;
