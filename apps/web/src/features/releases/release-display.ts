import {
  RELEASE_STATUS,
  RELEASE_STATUS_LABELS,
  type ReleaseApproverRole,
  type ReleaseDetail,
  type ReleaseGate,
  type ReleaseItemKind,
  type ReleaseStatus,
  type TestEnvironment,
} from '@ashniva/types';
import type { Tone } from '@ashniva/ui';

/**
 * Wording for this screen only.
 *
 * The enums themselves live in `@ashniva/types`; these are the sentences a reader sees, and every
 * map is keyed by the type so a new member of an enum fails the type-check here rather than
 * rendering as a raw constant.
 */

export const ENVIRONMENT_LABELS: Record<TestEnvironment, string> = {
  DEVELOPMENT: 'Development',
  STAGING: 'Staging',
  PRODUCTION: 'Production',
};

export const APPROVER_ROLE_LABELS: Record<ReleaseApproverRole, string> = {
  SENIOR: 'Senior',
  PROJECT_MANAGER: 'Project manager',
  QA_LEAD: 'QA lead',
  CLIENT: 'Client',
  DIRECTOR: 'Director',
};

export const ITEM_KIND_LABELS: Record<ReleaseItemKind, string> = {
  TASK: 'Task',
  TICKET: 'Ticket',
  CHANGE_REQUEST: 'Change request',
};

/** Short names for the server's gates; the sentence a reader acts on is the gate's own `reason`. */
export const GATE_LABELS: Record<ReleaseGate['key'], string> = {
  items: 'What is going out',
  approvals: 'Sign-offs',
  qa: 'QA',
  uat: 'Client UAT',
  publisher: 'Who may publish',
};

/** Rolled back and failed are the two a reader must not skim past. */
export function releaseTone(status: ReleaseStatus): Tone {
  if (status === RELEASE_STATUS.ROLLED_BACK || status === RELEASE_STATUS.FAILED) {
    return 'danger';
  }
  if (status === RELEASE_STATUS.VERIFIED || status === RELEASE_STATUS.PUBLISHED) {
    return 'success';
  }
  return status === RELEASE_STATUS.DRAFT ? 'neutral' : 'progress';
}

/**
 * Why Publish is off, in the server's own words.
 *
 * `readiness.publishable` is the only thing that decides whether the button works, and the
 * failing gates' `reason` strings are the only explanation offered. Nothing here re-checks
 * approvals, QA or UAT: that arithmetic is done once, on the server, and copied — not repeated.
 *
 * Returns undefined when the release is publishable, which is what "the button is enabled" means.
 */
export function publishBlockedReason(
  release: Pick<ReleaseDetail, 'readiness' | 'status'>,
): string | undefined {
  if (release.readiness.publishable) {
    return undefined;
  }
  const blockers = release.readiness.gates
    .filter((gate) => !gate.satisfied)
    .map((gate) => gate.reason);
  if (blockers.length > 0) {
    return blockers.join(' · ');
  }
  // Every gate is satisfied and the server still says no, which leaves where the release is in
  // its life: a draft nobody has approved yet, or one that has already gone out.
  return `A release that is ${RELEASE_STATUS_LABELS[release.status]} cannot be published`;
}

/**
 * Contents and details may only change while the release is a draft.
 *
 * The API allows a title edit a little longer than this, but items are draft-only either way
 * (what was approved has to be what ships), so one rule for both keeps the screen from offering a
 * button that the API answers with a 409.
 */
export function isDraft(status: ReleaseStatus): boolean {
  return status === RELEASE_STATUS.DRAFT;
}
