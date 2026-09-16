/**
 * System roles. Stored on `roles.key`; seeded once per installation.
 * Organizations may later add custom roles, but these keys are reserved.
 */
export const ROLE_KEYS = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  DEVELOPER: 'DEVELOPER',
  TESTER: 'TESTER',
  SUPPORT_EXECUTIVE: 'SUPPORT_EXECUTIVE',
  INTERNAL_EMPLOYEE: 'INTERNAL_EMPLOYEE',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  CLIENT_EMPLOYEE: 'CLIENT_EMPLOYEE',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ALL_ROLE_KEYS: readonly RoleKey[] = Object.values(ROLE_KEYS);

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin / Director',
  PROJECT_MANAGER: 'Project Manager',
  TEAM_LEAD: 'Team Lead / Senior Developer',
  DEVELOPER: 'Developer',
  TESTER: 'Tester / QA',
  SUPPORT_EXECUTIVE: 'Support Executive',
  INTERNAL_EMPLOYEE: 'Internal Company Employee',
  CLIENT_ADMIN: 'Client Admin',
  CLIENT_EMPLOYEE: 'Client Employee',
};

/** Roles that belong to client organizations and use the client portal. */
export const CLIENT_ROLE_KEYS: readonly RoleKey[] = [
  ROLE_KEYS.CLIENT_ADMIN,
  ROLE_KEYS.CLIENT_EMPLOYEE,
];

/** Roles that can manage other people's work (assign, review, approve). */
export const MANAGER_ROLE_KEYS: readonly RoleKey[] = [
  ROLE_KEYS.SUPER_ADMIN,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.TEAM_LEAD,
];

export function isClientRole(roleKey: RoleKey): boolean {
  return CLIENT_ROLE_KEYS.includes(roleKey);
}

export function isManagerRole(roleKey: RoleKey): boolean {
  return MANAGER_ROLE_KEYS.includes(roleKey);
}

/**
 * Who may see every project in the organization, not only the ones they are on.
 *
 * Everyone else — including a project manager who is not on the team — sees only projects they
 * manage, lead, or sit on as a member of the assigned team.
 */
export function seesAllOrganizationProjects(roleKey: RoleKey): boolean {
  return roleKey === ROLE_KEYS.SUPER_ADMIN;
}

/**
 * Who may start a one-to-one chat.
 *
 * Super admin, project manager and team lead message people on their teams (or, for admin, the
 * whole organization) in private as well as in the project group. Developers and every other
 * staff role only post in that group.
 */
export function canUsePersonalChat(roleKey: RoleKey): boolean {
  return isManagerRole(roleKey);
}
