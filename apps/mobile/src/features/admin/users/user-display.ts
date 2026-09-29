import { ROLE_LABELS, USER_STATUS, type UserStatus, type UserSummary } from '@ashniva/types';

import type { PillTone } from '../../../shared/components/pill';
import { formatSince } from '../../../shared/format/format';

export const USER_STATUSES = Object.values(USER_STATUS) as UserStatus[];

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
};

const STATUS_TONES: Record<UserStatus, PillTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'danger',
};

export function userStatusLabel(status: UserStatus): string {
  return STATUS_LABELS[status];
}

export function userStatusTone(status: UserStatus): PillTone {
  return STATUS_TONES[status];
}

/** A custom role's own name, else the system role's label. */
export function roleLabel(user: Pick<UserSummary, 'roleName' | 'roleKey'>): string {
  return user.roleName || ROLE_LABELS[user.roleKey];
}

export function lastSignIn(user: Pick<UserSummary, 'lastLoginAt'>): string {
  return user.lastLoginAt ? `Signed in ${formatSince(user.lastLoginAt)}` : 'Never signed in';
}

export function teamsLine(user: Pick<UserSummary, 'teams'>): string | null {
  return user.teams.length ? user.teams.map((team) => team.name).join(', ') : null;
}

/**
 * Somebody who has never signed in can be sent a fresh invitation link, as on the web. The API
 * refuses one for an account that has been used, so the action is only offered before that.
 */
export function canResendInvitation(user: Pick<UserSummary, 'lastLoginAt'>): boolean {
  return user.lastLoginAt === null;
}
