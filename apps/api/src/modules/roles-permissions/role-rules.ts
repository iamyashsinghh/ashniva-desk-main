import {
  CLIENT_SAFE_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  isClientRole,
  type AuthenticatedUser,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';

export type RoleAudience = 'INTERNAL' | 'CLIENT';

export interface RoleRuleViolation {
  code: 'ESCALATION' | 'CLIENT_UNSAFE' | 'SYSTEM_ROLE' | 'UNKNOWN_PERMISSION' | 'TEMPLATE';
  message: string;
  permissions?: PermissionKey[];
}

const KNOWN = new Set<string>(Object.values(PERMISSIONS));

/** Audience implied by a template: client templates make client roles, the rest internal. */
export function audienceForTemplate(templateKey: RoleKey): RoleAudience {
  return isClientRole(templateKey) ? 'CLIENT' : 'INTERNAL';
}

/**
 * Pure checks behind the roles editor. Nothing here touches the database, so every rule has a
 * unit test:
 *  - a person can only grant permissions they hold themselves (no privilege escalation);
 *  - client roles never receive internal-only permissions;
 *  - system roles are never edited;
 *  - a Super Admin template cannot be used to mint a second all-powerful role by a non-admin.
 */
export function validatePermissionGrant(
  actor: AuthenticatedUser,
  audience: RoleAudience,
  requested: readonly string[],
): RoleRuleViolation | null {
  const unknown = requested.filter((key) => !KNOWN.has(key));
  if (unknown.length > 0) {
    return {
      code: 'UNKNOWN_PERMISSION',
      message: `Unknown permission: ${unknown.join(', ')}`,
    };
  }
  const keys = requested as PermissionKey[];
  const beyondActor = keys.filter((key) => !actor.permissions.includes(key));
  if (beyondActor.length > 0) {
    return {
      code: 'ESCALATION',
      message: 'You cannot grant permissions you do not hold yourself',
      permissions: beyondActor,
    };
  }
  if (audience === 'CLIENT') {
    const unsafe = keys.filter((key) => !CLIENT_SAFE_PERMISSIONS.includes(key));
    if (unsafe.length > 0) {
      return {
        code: 'CLIENT_UNSAFE',
        message: 'Client roles cannot hold internal permissions',
        permissions: unsafe,
      };
    }
  }
  return null;
}

export function validateTemplate(
  actor: AuthenticatedUser,
  templateKey: string,
): RoleRuleViolation | null {
  if (!Object.values<string>(ROLE_KEYS).includes(templateKey)) {
    return { code: 'TEMPLATE', message: 'Unknown role template' };
  }
  if (templateKey === ROLE_KEYS.SUPER_ADMIN && actor.roleKey !== ROLE_KEYS.SUPER_ADMIN) {
    return {
      code: 'TEMPLATE',
      message: 'Only a Super Admin can start from the Super Admin template',
    };
  }
  return null;
}

/** Starting permissions of a new custom role: the template's defaults, capped by the actor's. */
export function templatePermissions(
  actor: AuthenticatedUser,
  templateKey: RoleKey,
): PermissionKey[] {
  return DEFAULT_ROLE_PERMISSIONS[templateKey].filter((key) => actor.permissions.includes(key));
}

/** Key stored on custom roles; never collides with the reserved system keys. */
export function customRoleKey(name: string, suffix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `custom:${slug || 'role'}-${suffix}`;
}
