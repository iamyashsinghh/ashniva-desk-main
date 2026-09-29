import {
  RELEASE_APPROVAL_DECISION,
  RELEASE_STATUS,
  RELEASE_STATUS_LABELS,
  TEST_ENVIRONMENT,
  type ReleaseApprovalDecision,
  type ReleaseApproverRole,
  type ReleaseDetail,
  type ReleaseGate,
  type ReleaseItemKind,
  type ReleaseStatus,
  type TestEnvironment,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import type { SegmentOption } from '../../shared/components/navigation-list';
import type { PillTone } from '../../shared/components/primitives';
import type { TabOption } from '../../shared/components/TabBar';

/**
 * How a release reads on a phone — the web page's wording, so a status is called the same thing
 * at a desk and in a pocket. The enums themselves live in `@ashniva/types`; every map here is keyed
 * by the type, so a new member fails the type-check rather than rendering as a raw constant.
 */

export const ENVIRONMENT_LABELS: Record<TestEnvironment, string> = {
  [TEST_ENVIRONMENT.DEVELOPMENT]: 'Development',
  [TEST_ENVIRONMENT.STAGING]: 'Staging',
  [TEST_ENVIRONMENT.PRODUCTION]: 'Production',
};

/** Production first: a release is, by default, the thing going to production. */
export const ENVIRONMENT_OPTIONS: readonly SegmentOption<TestEnvironment>[] = [
  { value: TEST_ENVIRONMENT.PRODUCTION, label: 'Production' },
  { value: TEST_ENVIRONMENT.STAGING, label: 'Staging' },
  { value: TEST_ENVIRONMENT.DEVELOPMENT, label: 'Development' },
];

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

export const ITEM_KIND_ICONS: Record<ReleaseItemKind, IconName> = {
  TASK: 'checkbox-outline',
  TICKET: 'ticket-outline',
  CHANGE_REQUEST: 'swap-horizontal-outline',
};

/** Short names for the server's gates; the sentence a reader acts on is the gate's own `reason`. */
export const GATE_LABELS: Record<ReleaseGate['key'], string> = {
  items: 'What is going out',
  approvals: 'Sign-offs',
  qa: 'QA',
  uat: 'Client UAT',
  publisher: 'Who may publish',
};

export const DECISION_LABELS: Record<ReleaseApprovalDecision, string> = {
  [RELEASE_APPROVAL_DECISION.PENDING]: 'Waiting',
  [RELEASE_APPROVAL_DECISION.APPROVED]: 'Approved',
  [RELEASE_APPROVAL_DECISION.REJECTED]: 'Rejected',
};

export const DECISION_TONES: Record<ReleaseApprovalDecision, PillTone> = {
  [RELEASE_APPROVAL_DECISION.PENDING]: 'warning',
  [RELEASE_APPROVAL_DECISION.APPROVED]: 'success',
  [RELEASE_APPROVAL_DECISION.REJECTED]: 'danger',
};

export function releaseStatusLabel(status: ReleaseStatus): string {
  return RELEASE_STATUS_LABELS[status] ?? status;
}

/** Rolled back and failed are the two a reader must not skim past. */
export function releaseTone(status: ReleaseStatus): PillTone {
  if (status === RELEASE_STATUS.ROLLED_BACK || status === RELEASE_STATUS.FAILED) {
    return 'danger';
  }
  if (status === RELEASE_STATUS.VERIFIED || status === RELEASE_STATUS.PUBLISHED) {
    return 'success';
  }
  return status === RELEASE_STATUS.DRAFT ? 'neutral' : 'progress';
}

export type ReleaseView = 'in-flight' | 'awaiting-approval' | 'published' | 'all';

/**
 * The list's views, grouped by where a release is rather than by date. "In flight" is the one
 * that matters day to day: a release sitting in approval for a week is what the list exists to show.
 */
export const RELEASE_VIEWS: Record<ReleaseView, { label: string; statuses?: ReleaseStatus[] }> = {
  'in-flight': {
    label: 'In flight',
    statuses: [
      RELEASE_STATUS.DRAFT,
      RELEASE_STATUS.APPROVAL_REQUESTED,
      RELEASE_STATUS.APPROVED,
      RELEASE_STATUS.SCHEDULED,
      RELEASE_STATUS.PUBLISHING,
    ],
  },
  'awaiting-approval': {
    label: 'Awaiting approval',
    statuses: [RELEASE_STATUS.APPROVAL_REQUESTED],
  },
  published: {
    label: 'Published',
    statuses: [RELEASE_STATUS.PUBLISHED, RELEASE_STATUS.VERIFIED],
  },
  all: { label: 'All' },
};

export const RELEASE_VIEW_TABS: readonly TabOption<ReleaseView>[] = [
  { value: 'in-flight', label: RELEASE_VIEWS['in-flight'].label, icon: 'rocket-outline' },
  {
    value: 'awaiting-approval',
    label: RELEASE_VIEWS['awaiting-approval'].label,
    icon: 'hourglass-outline',
  },
  { value: 'published', label: RELEASE_VIEWS.published.label, icon: 'checkmark-done-outline' },
  { value: 'all', label: RELEASE_VIEWS.all.label, icon: 'albums-outline' },
];

/**
 * Contents and details may only change while the release is a draft. The API allows a title edit
 * a little longer, but items are draft-only either way, so one rule for both keeps the screen from
 * offering a button the API answers with a 409.
 */
export function isDraft(status: ReleaseStatus): boolean {
  return status === RELEASE_STATUS.DRAFT;
}

/**
 * Why Publish is off, in the server's own words.
 *
 * `readiness.publishable` is the only thing that decides whether the button works, and the failing
 * gates' `reason` strings are the only explanation offered — nothing here re-checks approvals, QA
 * or UAT. Undefined means publishable.
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
  return `A release that is ${releaseStatusLabel(release.status)} cannot be published`;
}

/** The API's own rule for a version: it is typed back at publish, so nothing unreproducible. */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function versionProblem(version: string): string | null {
  const trimmed = version.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 40) {
    return 'At most 40 characters';
  }
  return VERSION_PATTERN.test(trimmed)
    ? null
    : 'Letters, digits, . _ + and - only, starting with a letter or digit';
}
