import { ROLE_KEYS, type RoleKey } from '@ashniva/types';

/** Which roles appear in each picker. */
export const WORKER_ROLES: RoleKey[] = [
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.SUPPORT_EXECUTIVE,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.SUPER_ADMIN,
];
export const REVIEWER_ROLES: RoleKey[] = [
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.SUPER_ADMIN,
];
export const TESTER_ROLES: RoleKey[] = [ROLE_KEYS.TESTER, ROLE_KEYS.TEAM_LEAD];
/** New-project "Who will lead this team": Team Lead / Senior Developer only. */
export const TEAM_LEAD_ROLES: RoleKey[] = [ROLE_KEYS.TEAM_LEAD];
/** New-project "Project manager": Project Manager only. */
export const PROJECT_MANAGER_ROLES: RoleKey[] = [ROLE_KEYS.PROJECT_MANAGER];
/** Intern learning assignments. */
export const INTERN_ROLES: RoleKey[] = [ROLE_KEYS.INTERN];
