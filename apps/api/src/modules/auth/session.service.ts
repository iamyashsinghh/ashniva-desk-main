import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PermissionKey, RoleKey, SessionOrganization, SessionUser } from '@ashniva/types';

import { OrganizationMembershipsRepository } from '../organization-memberships/organization-memberships.repository';

/**
 * Builds the `SessionUser` returned by login / refresh / me from the membership rows.
 * Kept separate from AuthService so `GET /auth/me` and the token flows share one definition.
 */
@Injectable()
export class SessionService {
  constructor(private readonly memberships: OrganizationMembershipsRepository) {}

  /**
   * Picks the organization for a session: the requested one when the user is a member of it,
   * otherwise the first membership (internal staff have exactly one — the service provider).
   */
  async resolveOrganizationId(userId: string, requested?: string): Promise<string> {
    const memberships = await this.memberships.findAllForUser(userId);
    if (memberships.length === 0) {
      throw new UnauthorizedException('User does not belong to any organization');
    }
    if (requested) {
      const match = memberships.find((membership) => membership.organizationId === requested);
      if (!match) {
        throw new UnauthorizedException('User is not a member of the requested organization');
      }
      return match.organizationId;
    }
    const first = memberships[0];
    if (!first) {
      throw new UnauthorizedException('User does not belong to any organization');
    }
    return first.organizationId;
  }

  async buildSessionUser(userId: string, organizationId: string): Promise<SessionUser> {
    const membership = await this.memberships.findActiveMembership(userId, organizationId);
    if (!membership) {
      throw new UnauthorizedException('User is not an active member of this organization');
    }
    const all = await this.memberships.findAllForUser(userId);
    const organizations: SessionOrganization[] = all.map((entry) => ({
      id: entry.organization.id,
      name: entry.organization.name,
      slug: entry.organization.slug,
      isServiceProvider: entry.organization.isServiceProvider,
    }));

    return {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      title: membership.title,
      roleKey: (membership.role.templateKey ?? membership.role.key) as RoleKey,
      roleId: membership.role.id,
      roleName: membership.role.name,
      isCustomRole: !membership.role.isSystem,
      // Sorted by key, like every other place a role's permissions are returned.
      permissions: membership.role.permissions
        .map((entry) => entry.permission.key as PermissionKey)
        .sort((left, right) => left.localeCompare(right)),
      showDevelopmentSection: membership.showDevelopmentSection,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        isServiceProvider: membership.organization.isServiceProvider,
      },
      organizations,
    };
  }
}
