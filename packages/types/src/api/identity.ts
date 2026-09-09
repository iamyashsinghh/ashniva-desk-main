import type { OrganizationType } from '../domain/organization-type';
import type { UserStatus } from '../domain/user-status';
import type { PermissionKey } from '../permissions/permission-keys';
import type { RoleKey } from '../roles/role-keys';

/** Minimal person reference embedded in tasks, tickets, comments, … */
export interface UserRef {
  id: string;
  name: string;
  email: string;
}

export interface TeamRef {
  id: string;
  name: string;
}

export interface OrganizationRef {
  id: string;
  name: string;
  slug: string;
}

/** One membership row: a person inside one organization (Users & teams screen). */
export interface UserSummary {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: UserStatus;
  title: string | null;
  roleKey: RoleKey;
  roleId: string;
  roleName: string;
  isCustomRole: boolean;
  showDevelopmentSection: boolean;
  organization: OrganizationRef;
  teams: TeamRef[];
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * One entry of a company picker: enough to label an option and to tell the provider's own
 * organization apart from a client's, and nothing else.
 *
 * `OrganizationSummary` carries how many people, projects and open tickets a client has, which is
 * commercial information about somebody else's business. Every filter and form in the product
 * wanted a list of names and was handed that instead.
 */
export interface OrganizationOption {
  id: string;
  name: string;
  isServiceProvider: boolean;
}

export interface OrganizationSummary extends OrganizationRef {
  type: OrganizationType;
  isServiceProvider: boolean;
  timezone: string;
  currency: string;
  userCount: number;
  projectCount: number;
  openTicketCount: number;
  createdAt: string;
}

export interface TeamSummary extends TeamRef {
  description: string | null;
  lead: UserRef | null;
  members: UserRef[];
  createdAt: string;
}

export interface RoleSummary {
  id: string;
  key: RoleKey | string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionKey[];
  memberCount: number;
}

/** Returned by POST /users: the person plus, when no password was given, the invitation link. */
export interface UserCreatedResponse extends UserSummary {
  invitation: { link: string; expiresAt: string } | null;
}

/** Picker entry (assignee, reviewer, tester, requester). */
export interface DirectoryEntry extends UserRef {
  roleKey: RoleKey;
  title: string | null;
  teams: TeamRef[];
}
