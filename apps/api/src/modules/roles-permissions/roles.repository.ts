import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const roleInclude = {
  // Sorted by key so a role's permission list is stable for the editor, the API and diffs.
  permissions: {
    include: { permission: { select: { key: true } } },
    orderBy: { permission: { key: 'asc' } },
  },
} satisfies Prisma.RoleInclude;

export type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }> & {
  memberCount: number;
};

/** System roles (organizationId NULL) plus the custom roles of one organization. */
@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrganization(organizationId: string): Promise<RoleRow[]> {
    const rows = await this.prisma.role.findMany({
      where: {
        deletedAt: null,
        OR: [{ organizationId: null, isSystem: true }, { organizationId }],
      },
      include: {
        ...roleInclude,
        _count: { select: { memberships: { where: { deletedAt: null, organizationId } } } },
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ _count, ...row }) => ({ ...row, memberCount: _count.memberships }));
  }

  async findById(id: string, organizationId: string): Promise<RoleRow | null> {
    const row = await this.prisma.role.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ organizationId: null, isSystem: true }, { organizationId }],
      },
      include: {
        ...roleInclude,
        _count: { select: { memberships: { where: { deletedAt: null, organizationId } } } },
      },
    });
    return row ? { ...row, memberCount: row._count.memberships } : null;
  }

  findAnyById(id: string) {
    return this.prisma.role.findFirst({ where: { id, deletedAt: null } });
  }

  findSystemByKey(key: string) {
    return this.prisma.role.findFirst({ where: { organizationId: null, isSystem: true, key } });
  }

  async permissionIds(keys: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.permission.findMany({ where: { key: { in: [...keys] } } });
    return new Map(rows.map((row) => [row.key, row.id]));
  }

  async create(input: {
    organizationId: string;
    key: string;
    name: string;
    description: string | null;
    templateKey: string;
    audience: 'INTERNAL' | 'CLIENT';
    permissionIds: string[];
  }): Promise<string> {
    const row = await this.prisma.role.create({
      data: {
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description,
        templateKey: input.templateKey,
        audience: input.audience,
        permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    return row.id;
  }

  async update(
    id: string,
    data: { name?: string; description?: string | null },
    permissionIds?: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data });
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
