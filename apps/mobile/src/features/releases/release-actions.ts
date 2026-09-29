import { RELEASE_STATUS, type ReleaseDetail, type ReleaseStatus } from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import type { ButtonVariant } from '../../shared/components/primitives';
import { publishBlockedReason } from './release-display';

export type ReleaseAction =
  | 'request-approval'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'verify-live'
  | 'rollback'
  | 'reopen';

export interface ReleaseButton {
  action: ReleaseAction;
  label: string;
  icon: IconName;
  variant: ButtonVariant;
  enabled: boolean;
  /** Why the button is off, when it is. Shown under the bar, never hidden in a tooltip. */
  reason?: string;
}

export interface ReleaseAbilities {
  manage: boolean;
  approve: boolean;
  publish: boolean;
}

/** Where in its life a release still has publishing ahead of it. */
const BEFORE_PUBLISH: readonly ReleaseStatus[] = [
  RELEASE_STATUS.DRAFT,
  RELEASE_STATUS.APPROVAL_REQUESTED,
  RELEASE_STATUS.APPROVED,
  RELEASE_STATUS.SCHEDULED,
];

const CAN_ROLL_BACK: readonly ReleaseStatus[] = [
  RELEASE_STATUS.PUBLISHING,
  RELEASE_STATUS.PUBLISHED,
  RELEASE_STATUS.VERIFIED,
];

/**
 * The workflow buttons for one release — the web page's `ReleaseActions`, as data.
 *
 * Which buttons appear follows the release's status and the caller's permissions, the same two
 * things the API checks. Whether **Publish** works is not decided here at all: the server's
 * readiness checklist decides, and its failing gates are what the disabled button says. Publish is
 * shown to everyone who can see a release that has not gone out, because "who may publish" is one
 * of those gates and an absent button teaches nobody whose job it is.
 */
export function releaseButtons(release: ReleaseDetail, can: ReleaseAbilities): ReleaseButton[] {
  const status = release.status;
  const buttons: ReleaseButton[] = [];

  if (can.manage && status === RELEASE_STATUS.DRAFT) {
    const empty = release.items.length === 0;
    buttons.push({
      action: 'request-approval',
      label: 'Request approval',
      icon: 'paper-plane-outline',
      variant: 'primary',
      enabled: !empty,
      ...(empty ? { reason: 'Add what is going out before asking anyone to approve it' } : {}),
    });
  }

  if (can.approve && status === RELEASE_STATUS.APPROVAL_REQUESTED) {
    buttons.push(
      { action: 'approve', label: 'Approve', icon: 'checkmark', variant: 'primary', enabled: true },
      { action: 'reject', label: 'Reject', icon: 'close', variant: 'dangerGhost', enabled: true },
    );
  }

  if (can.manage && (status === RELEASE_STATUS.APPROVED || status === RELEASE_STATUS.SCHEDULED)) {
    buttons.push({
      action: 'schedule',
      label: release.scheduledFor ? 'Reschedule' : 'Schedule',
      icon: 'calendar-outline',
      variant: 'secondary',
      enabled: true,
    });
  }

  if (BEFORE_PUBLISH.includes(status)) {
    const blocked = publishBlockedReason(release);
    buttons.push({
      action: 'publish',
      label: 'Publish',
      icon: 'rocket-outline',
      variant: 'danger',
      enabled: !blocked,
      ...(blocked ? { reason: blocked } : {}),
    });
  }

  if (can.manage && status === RELEASE_STATUS.PUBLISHED) {
    buttons.push({
      action: 'verify-live',
      label: 'Verify live',
      icon: 'pulse-outline',
      variant: 'primary',
      enabled: true,
    });
  }

  if (CAN_ROLL_BACK.includes(status)) {
    buttons.push({
      action: 'rollback',
      label: 'Roll back',
      icon: 'arrow-undo-outline',
      variant: 'dangerGhost',
      enabled: can.publish,
      ...(can.publish
        ? {}
        : { reason: 'Rolling a release back needs the release:publish permission' }),
    });
  }

  if (can.manage && status === RELEASE_STATUS.FAILED) {
    buttons.push({
      action: 'reopen',
      label: 'Reopen for editing',
      icon: 'refresh',
      variant: 'secondary',
      enabled: true,
    });
  }

  return buttons;
}
