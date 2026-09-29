import { ROLE_KEYS, type DirectoryEntry, type RoleKey } from '@ashniva/types';

/**
 * Which roles each people picker lists, matching the web app's pickers.
 *
 * A convenience, not a control: the API checks the person it is given on every assignment. These
 * only keep a list of forty names down to the dozen that make sense for the field.
 */
const WORKER_ROLES: readonly RoleKey[] = [
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.SUPPORT_EXECUTIVE,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.SUPER_ADMIN,
];
const REVIEWER_ROLES: readonly RoleKey[] = [
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.SUPER_ADMIN,
];
const TESTER_ROLES: readonly RoleKey[] = [ROLE_KEYS.TESTER, ROLE_KEYS.TEAM_LEAD];

// Module-level functions so a picker's memoised option list is not rebuilt every render.
export const isWorker = (person: DirectoryEntry) => WORKER_ROLES.includes(person.roleKey);
export const isReviewer = (person: DirectoryEntry) => REVIEWER_ROLES.includes(person.roleKey);
export const isTester = (person: DirectoryEntry) => TESTER_ROLES.includes(person.roleKey);
