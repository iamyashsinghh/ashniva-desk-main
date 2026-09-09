import type { PermissionKey } from '../permissions/permission-keys';
import type { RoleKey } from '../roles/role-keys';

/** Permission catalogue entry, grouped by module for the editor. */
export interface PermissionCatalogEntry {
  key: PermissionKey;
  description: string;
  /** "Tasks", "Tickets", … derived from the resource part of the key. */
  module: string;
  /** True when a client organization's role may hold it. */
  clientAllowed: boolean;
}

export interface CustomRoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** System role the custom role was created from. */
  templateKey: RoleKey | null;
  /** Roles marked for client organizations may only hold client-safe permissions. */
  audience: 'INTERNAL' | 'CLIENT';
  permissions: PermissionKey[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleChangeHistoryEntry {
  id: string;
  action: string;
  actor: { id: string; name: string } | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
