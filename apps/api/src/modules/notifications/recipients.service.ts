import { Injectable } from '@nestjs/common';
import type { PermissionKey } from '@ashniva/types';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';

/** Who receives a notification: a user in the organization the notification belongs to. */
export interface Recipient {
  userId: string;
  organizationId: string;
}

/**
 * Resolves recipient sets from memberships and role permissions (never from request input).
 * Runs as the system: a client raising a ticket must reach provider staff whose memberships
 * the client tenant cannot read under row-level security.
 */
@Injectable()
export class NotificationRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Active members of `organizationId` whose role grants `permission`. */
  withPermission(organizationId: string, permission: PermissionKey): Promise<Recipient[]> {
    return this.tenantContext.runAsSystem(() =>
      this.queryWithPermission(organizationId, permission),
    );
  }

  /** One person, if they are an active member of the organization. */
  member(organizationId: string, userId: string | null | undefined): Promise<Recipient[]> {
    return this.members(organizationId, [userId]);
  }

  /** Several people of one organization, de-duplicated. */
  members(organizationId: string, userIds: Array<string | null | undefined>): Promise<Recipient[]> {
    return this.tenantContext.runAsSystem(() => this.queryMembers(organizationId, userIds));
  }

  private async queryWithPermission(
    organizationId: string,
    permission: PermissionKey,
  ): Promise<Recipient[]> {
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
        role: { permissions: { some: { permission: { key: permission } } } },
      },
      select: { userId: true },
    });
    return rows.map((row) => ({ userId: row.userId, organizationId }));
  }

  private async queryMembers(
    organizationId: string,
    userIds: Array<string | null | undefined>,
  ): Promise<Recipient[]> {
    const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { in: ids },
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return rows.map((row) => ({ userId: row.userId, organizationId }));
  }
}
