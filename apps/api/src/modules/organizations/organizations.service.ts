import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  type AuthenticatedUser,
  type OrganizationOption,
  type OrganizationSummary,
  type OrganizationType,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { OrganizationsRepository, type OrganizationRow } from './organizations.repository';

export function toOrganizationSummary(row: OrganizationRow): OrganizationSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type as OrganizationType,
    isServiceProvider: row.isServiceProvider,
    timezone: row.timezone,
    currency: row.currency,
    userCount: row._count.memberships,
    projectCount: row._count.clientProjects,
    openTicketCount: row._count.raisedTickets,
    createdAt: row.createdAt.toISOString(),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Internal staff see every company; a client user only their own. */
  async list(actor: AuthenticatedUser): Promise<OrganizationSummary[]> {
    if (isInternalUser(actor)) {
      const rows = await this.organizations.listAll();
      return rows.map(toOrganizationSummary);
    }
    const own = await this.organizations.findRowById(actor.organizationId);
    return own ? [toOrganizationSummary(own)] : [];
  }

  /** The same tenant rule as `list`, with the counts left out: a picker needs a name. */
  async options(actor: AuthenticatedUser): Promise<OrganizationOption[]> {
    const rows = await this.list(actor);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isServiceProvider: row.isServiceProvider,
    }));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<OrganizationSummary> {
    if (isInternalUser(actor)) {
      // The same counts the administrative list carries, so the same key opens it.
      if (!actor.permissions.includes(PERMISSIONS.ORGANIZATION_MANAGE)) {
        throw new ForbiddenException('Only administrators read a company’s figures');
      }
    } else if (actor.organizationId !== id) {
      // 404 rather than 403, so a client cannot tell an id that exists from one that does not.
      throw new NotFoundException('Organization not found');
    }
    const row = await this.organizations.findRowById(id);
    if (!row) {
      throw new NotFoundException('Organization not found');
    }
    return toOrganizationSummary(row);
  }

  async create(actor: AuthenticatedUser, dto: CreateOrganizationDto): Promise<OrganizationSummary> {
    this.assertInternal(actor);
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new ConflictException('Could not derive an identifier from the name');
    }
    if (await this.organizations.findBySlug(slug)) {
      throw new ConflictException(`An organization with the identifier "${slug}" already exists`);
    }
    const row = await this.organizations.create({
      name: dto.name,
      slug,
      type: dto.type,
      timezone: dto.timezone,
      currency: dto.currency,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.ORGANIZATION_CREATED,
      entityType: AUDIT_ENTITY_TYPE.ORGANIZATION,
      entityId: row.id,
      after: { name: row.name, slug: row.slug, type: row.type },
    });
    return toOrganizationSummary(row);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationSummary> {
    this.assertInternal(actor);
    const before = await this.organizations.findRowById(id);
    if (!before) {
      throw new NotFoundException('Organization not found');
    }
    const row = await this.organizations.update(id, dto);
    await this.auditLog.record({
      action: AUDIT_ACTION.ORGANIZATION_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.ORGANIZATION,
      entityId: id,
      before: { name: before.name, type: before.type },
      after: { name: row.name, type: row.type },
    });
    return toOrganizationSummary(row);
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Only the service provider can manage organizations');
    }
  }
}
