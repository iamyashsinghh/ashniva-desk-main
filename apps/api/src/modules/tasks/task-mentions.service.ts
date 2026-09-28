import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  DEFAULT_MENTIONABLE_LIMIT,
  MAX_MENTIONABLE_LIMIT,
  MIN_MENTIONABLE_QUERY_LENGTH,
  mentionsIn,
  type AuthenticatedUser,
  type MentionablePage,
  type MentionableUser,
  type UserRef,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';

/**
 * Who may be @mentioned in a task comment.
 *
 * Task comments are not a private chat room — any active staff member in the organization can be
 * named, matching the product rule that anybody who can open the task can tag any colleague. The
 * picker and the write path share this list so a forged id is refused before the comment is stored.
 */
@Injectable()
export class TaskMentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: { q?: string; limit?: number; cursor?: string },
  ): Promise<MentionablePage> {
    const limit = Math.min(query.limit ?? DEFAULT_MENTIONABLE_LIMIT, MAX_MENTIONABLE_LIMIT);
    const term = (query.q ?? '').trim();
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        id: { not: actor.userId },
        memberships: {
          some: {
            organizationId: actor.organizationId,
            deletedAt: null,
          },
        },
        ...(term.length >= MIN_MENTIONABLE_QUERY_LENGTH
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { organizationId: actor.organizationId, deletedAt: null },
          select: { role: { select: { name: true } }, title: true },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = users.slice(0, limit);
    const items: MentionableUser[] = page.map((user) => {
      const membership = user.memberships[0];
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        roleName: membership?.role.name ?? null,
        contextLabel: membership?.title ?? null,
      };
    });
    return {
      items,
      ...(users.length > limit ? { nextCursor: page.at(-1)?.id } : {}),
    };
  }

  async assertMentionsAreReachable(
    actor: AuthenticatedUser,
    taskId: string,
    body: string,
  ): Promise<string[]> {
    const mentioned = mentionsIn(body);
    if (mentioned.length === 0) {
      return [];
    }
    const reachable = await this.activeMemberIds(actor.organizationId, mentioned);
    reachable.add(actor.userId);
    const forged = mentioned.filter((userId) => !reachable.has(userId));
    if (forged.length > 0) {
      await this.auditLog.record({
        action: AUDIT_ACTION.TASK_UPDATED,
        entityType: AUDIT_ENTITY_TYPE.TASK,
        entityId: taskId,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        after: { attempted: 'MENTION', userIds: forged },
      });
      throw new BadRequestException(
        'You can only mention people in your organization',
      );
    }
    return mentioned.filter((userId) => userId !== actor.userId);
  }

  async resolveUsers(organizationId: string, userIds: string[]): Promise<Map<string, UserRef>> {
    const unique = [...new Set(userIds)];
    const map = new Map<string, UserRef>();
    if (unique.length === 0) {
      return map;
    }
    const rows = await this.prisma.user.findMany({
      where: {
        id: { in: unique },
        memberships: { some: { organizationId, deletedAt: null } },
      },
      select: { id: true, name: true, email: true },
    });
    for (const row of rows) {
      map.set(row.id, row);
    }
    return map;
  }

  private async activeMemberIds(
    organizationId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }
}
