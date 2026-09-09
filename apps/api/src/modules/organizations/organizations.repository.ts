import { Injectable } from '@nestjs/common';
import { OPEN_TICKET_STATUSES } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Organization, OrganizationType, Prisma } from '../../generated/prisma/client';

const organizationInclude = {
  _count: {
    select: {
      memberships: { where: { deletedAt: null } },
      clientProjects: { where: { deletedAt: null } },
      raisedTickets: { where: { deletedAt: null, status: { in: [...OPEN_TICKET_STATUSES] } } },
    },
  },
} satisfies Prisma.OrganizationInclude;

export type OrganizationRow = Prisma.OrganizationGetPayload<{
  include: typeof organizationInclude;
}>;

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  type: OrganizationType;
  timezone?: string;
  currency?: string;
}

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findFirst({ where: { slug, deletedAt: null } });
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
  }

  /** The company running Ashniva Desk. Its branding is the default for everyone. */
  findServiceProvider(): Promise<Organization | null> {
    return this.prisma.organization.findFirst({
      where: { isServiceProvider: true, deletedAt: null },
    });
  }

  listAll(): Promise<OrganizationRow[]> {
    return this.prisma.organization.findMany({
      where: { deletedAt: null },
      include: organizationInclude,
      orderBy: [{ isServiceProvider: 'desc' }, { name: 'asc' }],
    });
  }

  findRowById(id: string): Promise<OrganizationRow | null> {
    return this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: organizationInclude,
    });
  }

  create(input: CreateOrganizationInput): Promise<OrganizationRow> {
    return this.prisma.organization.create({ data: input, include: organizationInclude });
  }

  update(
    id: string,
    data: Partial<Pick<Organization, 'name' | 'type' | 'timezone' | 'currency'>>,
  ): Promise<OrganizationRow> {
    return this.prisma.organization.update({ where: { id }, data, include: organizationInclude });
  }

  /**
   * Replaces the whole `settings` document.
   *
   * Whole, not merged, because Postgres' JSON merge is shallow and a partial update would flatten
   * a nested key rather than merge into it. The caller reads the current value and hands back the
   * complete one — see `BrandingStore`.
   */
  async updateSettings(id: string, settings: Record<string, unknown>): Promise<void> {
    // Prisma's `InputJsonValue` is a recursive structural type that a `Record<string, unknown>`
    // cannot be proved to satisfy, even though every value written here has just come out of a
    // Zod schema and is therefore JSON by construction. The assertion is at the boundary rather
    // than the callers being made to carry Prisma's type around.
    await this.prisma.organization.update({
      where: { id },
      data: { settings: settings as Prisma.InputJsonObject },
    });
  }
}
