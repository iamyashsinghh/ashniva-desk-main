import type { OrganizationType } from '../domain/organization-type';
import type { UserStatus } from '../domain/user-status';
import type { PermissionKey } from '../permissions/permission-keys';
import type { RoleKey } from '../roles/role-keys';

/**
 * The built-in pictures somebody may choose instead of uploading a photo.
 *
 * Keys, not artwork: each client draws the key with its own icon set on a colour from the
 * organization's theme, so a rebrand recolours every avatar and no image ships in the API.
 */
export const AVATAR_PRESETS = [
  'rocket',
  'leaf',
  'planet',
  'flame',
  'star',
  'heart',
  'music',
  'coffee',
  'bicycle',
  'code',
  'paw',
  'sun',
] as const;

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

/**
 * A person's picture. Absent or null: draw their initials.
 *
 * A photo is fetched from `GET /users/:id/avatar?v=<version>`. The version changes with every
 * upload, so a client may cache the image for as long as it likes and still never show an old one.
 */
export type UserAvatar =
  | { kind: 'photo'; version: string }
  | { kind: 'preset'; preset: AvatarPreset };

/** Largest profile photo the API accepts. Clients crop and compress well below this first. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The only image types a profile photo may be. Checked against the file's bytes, not its name. */
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Choosing a built-in picture: `PUT /users/me/avatar`. */
export interface SetAvatarPresetInput {
  preset: AvatarPreset;
}

/** Minimal person reference embedded in tasks, tickets, comments, … */
export interface UserRef {
  id: string;
  name: string;
  email: string;
  /**
   * Optional because most payloads that embed a person have no reason to draw them. Chat
   * (participants, counterparts, senders) and the session always fill it in.
   */
  avatar?: UserAvatar | null;
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
