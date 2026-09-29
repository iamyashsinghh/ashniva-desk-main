import {
  ROLE_LABELS,
  isClientRole,
  type CustomRoleDetail,
  type PermissionCatalogEntry,
  type PermissionKey,
} from '@ashniva/types';

/**
 * The permission matrix's arithmetic: which permissions a role may hold, grouped by area and
 * narrowed by a search, and how far an edited draft has drifted from what is saved.
 */

export interface PermissionGroup {
  module: string;
  entries: PermissionCatalogEntry[];
}

/** A role for client organizations may only hold client-safe permissions; the API enforces it. */
export function isClientAudience(role: Pick<CustomRoleDetail, 'audience' | 'templateKey'>) {
  return role.audience === 'CLIENT' || (role.templateKey ? isClientRole(role.templateKey) : false);
}

export function groupPermissions(
  catalog: readonly PermissionCatalogEntry[],
  clientOnly: boolean,
  search: string,
): PermissionGroup[] {
  const term = search.trim().toLowerCase();
  const groups = new Map<string, PermissionCatalogEntry[]>();
  for (const entry of catalog) {
    if (clientOnly && !entry.clientAllowed) {
      continue;
    }
    const matches =
      !term ||
      entry.description.toLowerCase().includes(term) ||
      entry.key.toLowerCase().includes(term) ||
      entry.module.toLowerCase().includes(term);
    if (matches) {
      groups.set(entry.module, [...(groups.get(entry.module) ?? []), entry]);
    }
  }
  return [...groups.entries()].map(([module, entries]) => ({ module, entries }));
}

export function toggled(
  draft: ReadonlySet<PermissionKey>,
  key: PermissionKey,
  on: boolean,
): Set<PermissionKey> {
  const next = new Set(draft);
  if (on) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

export function permissionChanges(
  saved: readonly PermissionKey[],
  draft: ReadonlySet<PermissionKey>,
): { added: PermissionKey[]; removed: PermissionKey[] } {
  const before = new Set(saved);
  return {
    added: [...draft].filter((key) => !before.has(key)),
    removed: saved.filter((key) => !draft.has(key)),
  };
}

export function changeCountLabel(count: number): string {
  return count === 1 ? '1 unsaved change' : `${count} unsaved changes`;
}

export function roleOverline(role: CustomRoleDetail): string {
  if (role.isSystem) {
    return 'System role';
  }
  return role.templateKey ? `Custom role · from ${ROLE_LABELS[role.templateKey]}` : 'Custom role';
}
