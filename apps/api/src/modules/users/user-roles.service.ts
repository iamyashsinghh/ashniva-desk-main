import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  ORGANIZATION_TYPE,
  ROLE_KEYS,
  USER_STATUS,
  isClientRole,
  type AuthenticatedUser,
  type RoleKey,
  type UserSummary,
} from '@ashniva/types';

import { assertCanManageOrganization, isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AccountTokensService } from '../auth/account-tokens.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { audienceForTemplate, validatePermissionGrant } from '../roles-permissions/role-rules';
import { RolesRepository } from '../roles-permissions/roles.repository';
import type { ChangeUserRoleDto } from './dto/user.dto';
import { toUserSummary } from './users.mapper';
import { UsersRepository } from './users.repository';

const INTERNAL_STAFF_ROLES: readonly RoleKey[] = [
  ROLE_KEYS.SUPER_ADMIN,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.SUPPORT_EXECUTIVE,
];

interface OrganizationShape {
  id: string;
  isServiceProvider: boolean;
  type: string;
}

/**
 * Role placement (which roles may live in which organization), role changes and invitations.
 * Split from UsersService so each file stays readable; the placement rules apply to a custom
 * role's behaviour template, so a "Store Manager" cloned from Client Admin stays a client role.
 */
@Injectable()
export class UserRolesService {
  constructor(
    private readonly users: UsersRepository,
    private readonly roles: RolesRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly accountTokens: AccountTokensService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** A system role by key, or a custom role of the target organization by id. */
  async resolveRole(
    actor: AuthenticatedUser,
    organization: OrganizationShape,
    dto: { roleKey?: RoleKey; roleId?: string },
  ) {
    if (dto.roleId) {
      const role = await this.roles.findById(dto.roleId, organization.id);
      if (!role) {
        throw new NotFoundException('Role not found in this organization');
      }
      this.assertRoleAllowed(
        actor,
        (role.templateKey ?? role.key) as RoleKey,
        organization,
        role.permissions.map((entry) => entry.permission.key),
      );
      return role;
    }
    if (!dto.roleKey) {
      throw new BadRequestException('Provide roleKey or roleId');
    }
    const role = await this.users.findRoleByKey(dto.roleKey);
    if (!role) {
      throw new NotFoundException(`Role ${dto.roleKey} is not installed`);
    }
    this.assertRoleAllowed(
      actor,
      dto.roleKey,
      organization,
      role.permissions.map((entry) => entry.permission.key),
    );
    return role;
  }

  assertRoleAllowed(
    actor: AuthenticatedUser,
    roleKey: RoleKey,
    organization: { isServiceProvider: boolean; type: string },
    rolePermissions: readonly string[],
  ): void {
    if (!isInternalUser(actor) && !isClientRole(roleKey)) {
      throw new BadRequestException('Client administrators can only assign client roles');
    }
    if (INTERNAL_STAFF_ROLES.includes(roleKey) && !organization.isServiceProvider) {
      throw new BadRequestException(
        'Internal staff roles belong to the service-provider organization',
      );
    }
    if (
      roleKey === ROLE_KEYS.INTERNAL_EMPLOYEE &&
      organization.type !== ORGANIZATION_TYPE.OWN_GROUP
    ) {
      throw new BadRequestException('Internal employees belong to own-group companies');
    }
    if (isClientRole(roleKey) && organization.isServiceProvider) {
      throw new BadRequestException(
        'Client roles cannot be used in the service-provider organization',
      );
    }
    // Placement is not the whole rule: handing someone a role hands them its permissions, which
    // is the same grant the roles editor refuses to make ("You cannot grant permissions you do
    // not hold yourself"). Both paths share `validatePermissionGrant` so they cannot drift.
    //
    // `user:manage` is held by Super Admin and Client Admin today, and both hold everything the
    // roles they may place hold — so nothing legitimate changes. What it stops is the next step:
    // a Super Admin can define a custom role that carries `user:manage` and little else, and
    // without this its holder could create a Super Admin and sign in as one.
    const violation = validatePermissionGrant(actor, audienceForTemplate(roleKey), rolePermissions);
    if (violation) {
      throw new ForbiddenException(
        `${violation.message}: ${violation.permissions?.join(', ') ?? roleKey}`,
      );
    }
  }

  /** Role changes are audited and, at the controller, protected by re-authentication. */
  async changeRole(
    actor: AuthenticatedUser,
    userId: string,
    dto: ChangeUserRoleDto,
  ): Promise<UserSummary> {
    const organizationId = this.targetOrganization(actor, dto.organizationId);
    const before = await this.users.findMembership(organizationId, userId);
    if (!before) {
      throw new NotFoundException('User not found');
    }
    if (actor.userId === userId) {
      throw new BadRequestException('You cannot change your own role');
    }
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const role = await this.resolveRole(actor, organization, dto);
    if (role.id !== before.role.id) {
      // Permissions are read per request, so the change applies immediately; sessions stay.
      await this.users.updateMembership(organizationId, userId, { roleId: role.id });
    }
    const after = await this.users.findMembership(organizationId, userId);
    if (!after) {
      throw new NotFoundException('User not found');
    }
    const summary = toUserSummary(after);
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_ROLE_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      organizationId,
      before: { roleId: before.role.id, roleName: before.role.name },
      after: { roleId: summary.roleId, roleName: summary.roleName },
    });
    return summary;
  }

  /** (Re)issues the invitation link of a person who has not chosen a password yet. */
  async invite(
    actor: AuthenticatedUser,
    userId: string,
    organizationId?: string,
  ): Promise<{ link: string; expiresAt: string }> {
    const target = this.targetOrganization(actor, organizationId);
    const row = await this.users.findMembership(target, userId);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    if (row.user.status !== USER_STATUS.INVITED) {
      throw new BadRequestException('This person already has a password; use "forgot password"');
    }
    const issued = await this.accountTokens.issueInvitation({
      organizationId: target,
      userId,
      roleId: row.role.id,
      invitedById: actor.userId,
    });
    return { link: issued.link, expiresAt: issued.expiresAt.toISOString() };
  }

  private targetOrganization(actor: AuthenticatedUser, requested?: string): string {
    const organizationId = requested ?? actor.organizationId;
    assertCanManageOrganization(actor, organizationId);
    return organizationId;
  }
}
