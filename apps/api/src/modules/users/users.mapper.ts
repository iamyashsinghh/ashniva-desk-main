import type { RoleKey, UserRef, UserStatus, UserSummary } from '@ashniva/types';

import type { MembershipRow } from './users.repository';

export function toUserSummary(row: MembershipRow): UserSummary {
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    phone: row.user.phone,
    status: row.user.status as UserStatus,
    title: row.title,
    roleKey: (row.role.templateKey ?? row.role.key) as RoleKey,
    roleId: row.role.id,
    roleName: row.role.name,
    isCustomRole: !row.role.isSystem,
    showDevelopmentSection: row.showDevelopmentSection,
    organization: row.organization,
    teams: row.user.teamMemberships.map((membership) => membership.team),
    lastLoginAt: row.user.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserRef(user: { id: string; name: string; email: string }): UserRef {
  return { id: user.id, name: user.name, email: user.email };
}
