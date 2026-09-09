import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ALL_PERMISSION_KEYS,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CLIENT_SAFE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  permissionModule,
  type AuthenticatedUser,
  type CustomRoleDetail,
  type PermissionCatalogEntry,
  type PermissionKey,
  type RoleChangeHistoryEntry,
  type RoleKey,
} from '@ashniva/types';

import { assertCanManageOrganization } from '../../common/auth/access-scope';
import { AuditLogRepository } from '../audit-logs/audit-log.repository';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import {
  audienceForTemplate,
  customRoleKey,
  templatePermissions,
  validatePermissionGrant,
  validateTemplate,
} from './role-rules';
import { RolesRepository, type RoleRow } from './roles.repository';

function toDetail(row: RoleRow): CustomRoleDetail {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    templateKey:
      (row.templateKey as RoleKey | null) ?? (row.isSystem ? (row.key as RoleKey) : null),
    audience: row.audience,
    permissions: row.permissions.map((entry) => entry.permission.key as PermissionKey),
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Custom roles: cloned from a system template, editable only within the editor's own
 * permissions, client roles capped to client-safe permissions, system roles read-only. Every
 * change is audited; the controller additionally demands a fresh password check.
 */
@Injectable()
export class RolesPermissionsService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly auditLog: AuditLogService,
    private readonly auditRepository: AuditLogRepository,
  ) {}

  async list(actor: AuthenticatedUser, organizationId?: string): Promise<CustomRoleDetail[]> {
    const target = this.targetOrganization(actor, organizationId);
    const rows = await this.roles.listForOrganization(target);
    return rows.map(toDetail);
  }

  catalog(): PermissionCatalogEntry[] {
    return ALL_PERMISSION_KEYS.map((key) => ({
      key,
      description: PERMISSION_DESCRIPTIONS[key],
      module: permissionModule(key),
      clientAllowed: CLIENT_SAFE_PERMISSIONS.includes(key),
    }));
  }

  async get(
    actor: AuthenticatedUser,
    id: string,
    organizationId?: string,
  ): Promise<CustomRoleDetail> {
    const target = this.targetOrganization(actor, organizationId);
    const row = await this.roles.findById(id, target);
    if (!row) {
      throw new NotFoundException('Role not found');
    }
    return toDetail(row);
  }

  async create(actor: AuthenticatedUser, dto: CreateRoleDto): Promise<CustomRoleDetail> {
    const organizationId = this.targetOrganization(actor, dto.organizationId);
    const templateProblem = validateTemplate(actor, dto.templateKey);
    if (templateProblem) {
      throw new BadRequestException(templateProblem.message);
    }
    const audience = audienceForTemplate(dto.templateKey);
    const permissions = dto.permissions ?? templatePermissions(actor, dto.templateKey);
    const permissionIds = await this.resolvePermissions(actor, audience, permissions);
    const id = await this.roles.create({
      organizationId,
      key: customRoleKey(dto.name, Date.now().toString(36)),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      templateKey: dto.templateKey,
      audience,
      permissionIds,
    });
    const created = await this.get(actor, id, organizationId);
    await this.auditLog.record({
      action: AUDIT_ACTION.ROLE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.ROLE,
      entityId: id,
      organizationId,
      after: { name: created.name, templateKey: dto.templateKey, permissions: created.permissions },
    });
    return created;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<CustomRoleDetail> {
    const row = await this.roles.findById(id, actor.organizationId);
    const role = row ?? (await this.findAcrossManagedOrganizations(actor, id));
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be edited; create a custom role instead');
    }
    const before = toDetail(role);
    let permissionIds: string[] | undefined;
    if (dto.permissions) {
      // Removing permissions the editor lacks is allowed; adding them is not.
      const added = dto.permissions.filter((key) => !before.permissions.includes(key));
      permissionIds = await this.resolvePermissions(actor, role.audience, dto.permissions, added);
    }
    await this.roles.update(
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
      permissionIds,
    );
    const after = await this.get(actor, id, role.organizationId ?? undefined);
    await this.auditLog.record({
      action: dto.permissions ? AUDIT_ACTION.ROLE_PERMISSIONS_CHANGED : AUDIT_ACTION.ROLE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.ROLE,
      entityId: id,
      organizationId: role.organizationId ?? actor.organizationId,
      before: { name: before.name, permissions: before.permissions },
      after: { name: after.name, permissions: after.permissions },
    });
    return after;
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const role =
      (await this.roles.findById(id, actor.organizationId)) ??
      (await this.findAcrossManagedOrganizations(actor, id));
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    if (role.memberCount > 0) {
      throw new ConflictException('Move its members to another role before deleting this role');
    }
    await this.roles.softDelete(id);
    await this.auditLog.record({
      action: AUDIT_ACTION.ROLE_DELETED,
      entityType: AUDIT_ENTITY_TYPE.ROLE,
      entityId: id,
      organizationId: role.organizationId ?? actor.organizationId,
      before: { name: role.name },
    });
  }

  async history(actor: AuthenticatedUser, id: string): Promise<RoleChangeHistoryEntry[]> {
    await this.get(actor, id);
    const page = await this.auditRepository.list({
      entityType: AUDIT_ENTITY_TYPE.ROLE,
      limit: 100,
    });
    return page.items
      .filter((entry) => entry.entityId === id)
      .map((entry) => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actor ? { id: entry.actor.id, name: entry.actor.name } : null,
        before: entry.before,
        after: entry.after,
        createdAt: entry.createdAt.toISOString(),
      }));
  }

  /** Validates a grant and maps keys to ids. `mustHold` limits the escalation check to additions. */
  private async resolvePermissions(
    actor: AuthenticatedUser,
    audience: 'INTERNAL' | 'CLIENT',
    requested: PermissionKey[],
    mustHold: PermissionKey[] = requested,
  ): Promise<string[]> {
    const unique = [...new Set(requested)];
    const violation =
      validatePermissionGrant(actor, audience, mustHold) ??
      validatePermissionGrant({ ...actor, permissions: unique }, audience, unique);
    if (violation) {
      throw violation.code === 'ESCALATION'
        ? new ForbiddenException(
            `${violation.message}: ${violation.permissions?.join(', ') ?? ''}`.trim(),
          )
        : new BadRequestException(
            `${violation.message}${violation.permissions ? `: ${violation.permissions.join(', ')}` : ''}`,
          );
    }
    const ids = await this.roles.permissionIds(unique);
    return unique.map((key) => {
      const id = ids.get(key);
      if (!id) {
        throw new BadRequestException(`Unknown permission: ${key}`);
      }
      return id;
    });
  }

  private targetOrganization(actor: AuthenticatedUser, organizationId?: string): string {
    const target = organizationId ?? actor.organizationId;
    assertCanManageOrganization(actor, target);
    return target;
  }

  /** Provider staff manage client organizations' custom roles too. */
  private async findAcrossManagedOrganizations(actor: AuthenticatedUser, id: string) {
    if (!actor.isServiceProvider) {
      return null;
    }
    const row = await this.roles.findAnyById(id);
    return row && row.organizationId ? this.roles.findById(id, row.organizationId) : null;
  }
}
