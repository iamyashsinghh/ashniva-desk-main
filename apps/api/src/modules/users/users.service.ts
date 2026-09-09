import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  USER_STATUS,
  type AuthenticatedUser,
  type DirectoryEntry,
  type RoleKey,
  type UserCreatedResponse,
  type UserSummary,
} from '@ashniva/types';

import { assertCanManageOrganization, isInternalUser } from '../../common/auth/access-scope';
import { boundedList } from '../../common/dto/unpaginated-list';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AccountTokensService } from '../auth/account-tokens.service';
import { PasswordHashingService } from '../auth/password-hashing.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import type {
  ChangePasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UserRolesService } from './user-roles.service';
import { toUserSummary } from './users.mapper';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly passwords: PasswordHashingService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly auditLog: AuditLogService,
    private readonly accountTokens: AccountTokensService,
    private readonly userRoles: UserRolesService,
  ) {}

  /** Lightweight people list for pickers; internal staff only, own organization only. */
  async directory(actor: AuthenticatedUser): Promise<DirectoryEntry[]> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The directory is internal');
    }
    const rows = await this.users.listMemberships({
      organizationId: actor.organizationId,
      status: USER_STATUS.ACTIVE,
    });
    return boundedList(
      'GET /users/directory',
      rows.map((row) => ({
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        roleKey: row.role.key as RoleKey,
        title: row.title,
        teams: row.user.teamMemberships.map((membership) => membership.team),
      })),
    );
  }

  async list(actor: AuthenticatedUser, query: ListUsersQueryDto): Promise<UserSummary[]> {
    const organizationId = this.targetOrganization(actor, query.organizationId);
    const rows = await this.users.listMemberships({ ...query, organizationId });
    return boundedList('GET /users', rows.map(toUserSummary));
  }

  async get(
    actor: AuthenticatedUser,
    userId: string,
    organizationId?: string,
  ): Promise<UserSummary> {
    const target = this.targetOrganization(actor, organizationId);
    const row = await this.users.findMembership(target, userId);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return toUserSummary(row);
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<UserCreatedResponse> {
    const organizationId = this.targetOrganization(actor, dto.organizationId);
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const role = await this.userRoles.resolveRole(actor, organization, dto);

    let user = await this.users.findByEmail(dto.email);
    let invitation: UserCreatedResponse['invitation'] = null;
    if (user) {
      const existing = await this.users.findMembership(organizationId, user.id);
      if (existing) {
        throw new ConflictException('This person is already a member of the organization');
      }
    } else {
      // Without a password the account starts as INVITED and the person sets their own.
      user = await this.users.createUser({
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        passwordHash: dto.password ? await this.passwords.hash(dto.password) : null,
        status: dto.password ? USER_STATUS.ACTIVE : USER_STATUS.INVITED,
      });
    }

    const membership = await this.users.upsertMembership({
      organizationId,
      userId: user.id,
      roleId: role.id,
      title: dto.title ?? null,
      showDevelopmentSection: dto.showDevelopmentSection ?? true,
    });
    if (dto.teamIds) {
      await this.users.setTeams(organizationId, user.id, dto.teamIds);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_CREATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user.id,
      after: { email: user.email, organizationId, roleKey: role.key, invited: !dto.password },
    });
    if (user.status === USER_STATUS.INVITED) {
      const issued = await this.accountTokens.issueInvitation({
        organizationId,
        userId: user.id,
        roleId: role.id,
        invitedById: actor.userId,
      });
      invitation = { link: issued.link, expiresAt: issued.expiresAt.toISOString() };
    }
    const summary = await this.get(actor, membership.userId, organizationId);
    return { ...summary, invitation };
  }

  async update(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto): Promise<UserSummary> {
    const organizationId = this.targetOrganization(actor, dto.organizationId);
    const before = await this.users.findMembership(organizationId, userId);
    if (!before) {
      throw new NotFoundException('User not found');
    }

    if (dto.name !== undefined || dto.phone !== undefined) {
      await this.users.updateUser(userId, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      });
    }

    const membershipData: {
      title?: string | null;
      showDevelopmentSection?: boolean;
    } = {};
    if (dto.title !== undefined) {
      membershipData.title = dto.title;
    }
    if (dto.showDevelopmentSection !== undefined) {
      membershipData.showDevelopmentSection = dto.showDevelopmentSection;
    }
    if (Object.keys(membershipData).length > 0) {
      await this.users.updateMembership(organizationId, userId, membershipData);
    }
    if (dto.teamIds) {
      await this.users.setTeams(organizationId, userId, dto.teamIds);
    }

    const after = await this.get(actor, userId, organizationId);
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      before: { roleKey: before.role.key, title: before.title, name: before.user.name },
      after: { roleKey: after.roleKey, title: after.title, name: after.name },
    });
    return after;
  }

  /** Suspends the person everywhere and signs them out of every device. */
  async deactivate(
    actor: AuthenticatedUser,
    userId: string,
    organizationId?: string,
  ): Promise<UserSummary> {
    const target = this.targetOrganization(actor, organizationId);
    const row = await this.users.findMembership(target, userId);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    if (actor.userId === userId) {
      throw new BadRequestException('You cannot deactivate yourself');
    }
    await this.users.updateUser(userId, { status: USER_STATUS.SUSPENDED });
    await this.refreshTokens.revokeAllForUser(userId);
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_DEACTIVATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      after: { email: row.user.email, status: USER_STATUS.SUSPENDED },
    });
    return this.get(actor, userId, target);
  }

  async activate(
    actor: AuthenticatedUser,
    userId: string,
    organizationId?: string,
  ): Promise<UserSummary> {
    const target = this.targetOrganization(actor, organizationId);
    const row = await this.users.findMembership(target, userId);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    await this.users.updateUser(userId, { status: USER_STATUS.ACTIVE });
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      after: { email: row.user.email, status: USER_STATUS.ACTIVE },
    });
    return this.get(actor, userId, target);
  }

  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users.findById(actor.userId);
    if (
      !user?.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.updateUser(user.id, {
      passwordHash: await this.passwords.hash(dto.newPassword),
    });
    // Other sessions must sign in again with the new password.
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.auditLog.record({
      action: AUDIT_ACTION.USER_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: user.id,
      after: { passwordChanged: true },
    });
  }

  /** Internal staff may target any organization; everyone else only their own. */
  private targetOrganization(actor: AuthenticatedUser, requested?: string): string {
    const organizationId = requested ?? actor.organizationId;
    assertCanManageOrganization(actor, organizationId);
    return organizationId;
  }
}
