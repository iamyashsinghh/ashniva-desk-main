import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { isClientRole, type AuthenticatedUser } from '@ashniva/types';

/**
 * Scope rules shared by services. Two kinds of principals exist:
 * - internal staff: members of the service-provider organization; they work on every client's
 *   projects and tickets (their tenant scope is the provider organization);
 * - client users: members of a client organization; they only ever see rows whose
 *   clientOrganizationId is their own organization.
 * Rows that belong to another tenant are reported as 404, never 403, so ids cannot be probed.
 */
export function isInternalUser(user: AuthenticatedUser): boolean {
  return user.isServiceProvider && !isClientRole(user.roleKey);
}

export function isClientUser(user: AuthenticatedUser): boolean {
  return !isInternalUser(user);
}

/** Internal staff may administer any organization; everyone else only their own. */
export function assertCanManageOrganization(user: AuthenticatedUser, organizationId: string): void {
  if (isInternalUser(user) || user.organizationId === organizationId) {
    return;
  }
  throw new ForbiddenException('You can only manage your own organization');
}

/** Throws the "not found" used for rows outside the caller's tenant. */
export function notFoundOutsideTenant(entity: string): never {
  throw new NotFoundException(`${entity} not found`);
}
