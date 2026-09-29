import {
  PERMISSIONS,
  PROBLEM_STATUS,
  type PermissionKey,
  type ProblemDetail,
} from '@ashniva/types';

import type { IconName } from '../../../shared/components/Icon';
import { closeBlockedReason } from '../problem-display';

export type ProblemActionKey =
  'request-rca' | 'ask' | 'assign-fix' | 'preventive-test' | 'edit' | 'close';

export interface OfferedProblemAction {
  key: ProblemActionKey;
  label: string;
  icon: IconName;
  enabled: boolean;
  /** Why it is off, when it is. */
  reason?: string;
  danger?: boolean;
}

/**
 * The actions on a problem, gated exactly as the web's action row is.
 *
 * Status and permission are the same two things the API checks, so nothing offered here answers
 * 403. Whether **Close** works is not decided here at all: `closure.allowed` decides, and when it
 * is false the server's own blocker sentences are the reason shown. A closed problem offers
 * nothing — reopening is not a thing a problem does.
 */
export function problemActions(
  problem: ProblemDetail,
  can: (permission: PermissionKey) => boolean,
): OfferedProblemAction[] {
  if (problem.status === PROBLEM_STATUS.CLOSED) {
    return [];
  }
  const manage = can(PERMISSIONS.PROBLEM_MANAGE);
  const offered: OfferedProblemAction[] = [];

  if (manage && problem.status === PROBLEM_STATUS.OPEN) {
    offered.push({
      key: 'request-rca',
      label: 'Request RCA',
      icon: 'document-text-outline',
      enabled: true,
    });
  }
  if (can(PERMISSIONS.PROBLEM_READ)) {
    offered.push({
      key: 'ask',
      label: 'Ask developer',
      icon: 'help-circle-outline',
      enabled: true,
    });
  }
  if (manage) {
    // The task list to choose from is `GET /tasks`, which `problem:manage` does not imply.
    const readsTasks = can(PERMISSIONS.TASK_READ);
    offered.push({
      key: 'assign-fix',
      label: problem.fixTask ? 'Change permanent fix' : 'Assign permanent fix',
      icon: 'construct-outline',
      enabled: readsTasks,
      ...(readsTasks ? {} : { reason: 'Choosing the fix task needs the task:read permission' }),
    });
  }
  const preventive = can(PERMISSIONS.PROBLEM_ADD_PREVENTIVE_TEST);
  offered.push({
    key: 'preventive-test',
    label: 'Add preventive test',
    icon: 'shield-checkmark-outline',
    enabled: preventive,
    ...(preventive
      ? {}
      : { reason: 'Recording a preventive test needs the problem:add-preventive-test permission' }),
  });
  if (manage) {
    offered.push({ key: 'edit', label: 'Edit problem', icon: 'create-outline', enabled: true });
  }

  const blocked = closeBlockedReason(problem.closure);
  const closeReason = manage ? blocked : 'Closing a problem needs the problem:manage permission';
  offered.push({
    key: 'close',
    label: 'Close problem',
    icon: 'checkmark-done-outline',
    enabled: manage && !blocked,
    danger: true,
    ...(closeReason ? { reason: closeReason } : {}),
  });
  return offered;
}

/**
 * The one action worth a full-width button: whatever moves the problem on next. Asking for the
 * analysis on an untouched problem, closing one that may be closed, or naming the fix when nobody
 * has. Everything else waits under "More actions".
 */
export function primaryProblemAction(
  offered: readonly OfferedProblemAction[],
  problem: ProblemDetail,
): OfferedProblemAction | null {
  const find = (key: ProblemActionKey) =>
    offered.find((entry) => entry.key === key && entry.enabled);
  return (
    find('request-rca') ??
    find('close') ??
    (problem.fixTask ? undefined : find('assign-fix')) ??
    null
  );
}
