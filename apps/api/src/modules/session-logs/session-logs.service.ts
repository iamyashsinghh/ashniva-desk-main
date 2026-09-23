import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  ROLE_KEYS,
  type AuthenticatedUser,
  type RoleKey,
  type SessionLogEvent,
  type SessionLogResponse,
  type SessionLogSession,
  type UserRef,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';

/** Roles whose desk login / logout / break trail leads and managers need to see. */
const TRACKED_ROLE_KEYS: RoleKey[] = [
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.INTERN,
];

const SESSION_ACTIONS = [AUDIT_ACTION.AUTH_LOGIN, AUDIT_ACTION.AUTH_LOGOUT] as const;

@Injectable()
export class SessionLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthenticatedUser,
    input: { userId?: string; from?: string; to?: string },
  ): Promise<SessionLogResponse> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Session logs are internal');
    }
    if (
      !actor.permissions.includes(PERMISSIONS.REPORT_READ_TEAM) &&
      !actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL)
    ) {
      throw new ForbiddenException('You cannot read team session logs');
    }

    const visibleIds = await this.visibleTrackedUserIds(actor, input.userId);
    if (visibleIds.length === 0) {
      return { events: [], sessions: [] };
    }

    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('Invalid date range');
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: { in: visibleIds },
        deletedAt: null,
      },
      select: {
        userId: true,
        role: { select: { key: true, templateKey: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    const roleByUser = new Map<string, RoleKey | null>();
    const userById = new Map<string, UserRef>();
    for (const row of memberships) {
      const key = (row.role.templateKey ?? row.role.key) as RoleKey;
      if (!TRACKED_ROLE_KEYS.includes(key)) {
        continue;
      }
      roleByUser.set(row.userId, key);
      userById.set(row.userId, row.user);
    }
    const trackedIds = [...roleByUser.keys()];
    if (trackedIds.length === 0) {
      return { events: [], sessions: [] };
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        actorUserId: { in: trackedIds },
        entityType: AUDIT_ENTITY_TYPE.AUTH,
        action: { in: [...SESSION_ACTIONS] },
        OR: [
          { organizationId: actor.organizationId },
          { organizationId: null },
        ],
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 2000,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        ipAddress: true,
        createdAt: true,
      },
    });

    const events: SessionLogEvent[] = [];
    for (const row of rows) {
      if (!row.actorUserId) {
        continue;
      }
      const user = userById.get(row.actorUserId);
      if (!user) {
        continue;
      }
      events.push({
        id: row.id,
        kind: row.action === AUDIT_ACTION.AUTH_LOGIN ? 'LOGIN' : 'LOGOUT',
        at: row.createdAt.toISOString(),
        user,
        roleKey: roleByUser.get(row.actorUserId) ?? null,
        ipAddress: row.ipAddress,
      });
    }

    return {
      events: [...events].reverse(),
      sessions: pairSessions(events),
    };
  }

  private async visibleTrackedUserIds(
    actor: AuthenticatedUser,
    requested?: string,
  ): Promise<string[]> {
    if (actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL)) {
      if (requested) {
        return [requested];
      }
      const members = await this.prisma.organizationMembership.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [
            { role: { key: { in: TRACKED_ROLE_KEYS } } },
            { role: { templateKey: { in: TRACKED_ROLE_KEYS } } },
          ],
        },
        select: { userId: true },
      });
      return members.map((row) => row.userId);
    }

    const teams = await this.prisma.team.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        OR: [{ leadUserId: actor.userId }, { members: { some: { userId: actor.userId } } }],
      },
      select: { members: { select: { userId: true } } },
    });
    const allowed = new Set<string>();
    for (const team of teams) {
      for (const member of team.members) {
        allowed.add(member.userId);
      }
    }
    if (requested) {
      if (!allowed.has(requested)) {
        throw new ForbiddenException('You cannot see this person’s session log');
      }
      return [requested];
    }
    return [...allowed];
  }
}

/** Walk chronological events and build login→logout sessions + break gaps. */
export function pairSessions(eventsAsc: SessionLogEvent[]): SessionLogSession[] {
  const byUser = new Map<string, SessionLogEvent[]>();
  for (const event of eventsAsc) {
    const list = byUser.get(event.user.id) ?? [];
    list.push(event);
    byUser.set(event.user.id, list);
  }

  const sessions: SessionLogSession[] = [];
  const now = Date.now();

  for (const [, userEvents] of byUser) {
    let open: SessionLogEvent | null = null;
    let previousLogoutAt: string | null = null;

    for (const event of userEvents) {
      if (event.kind === 'LOGIN') {
        if (open) {
          // Two logins without logout — close the previous as still open at this login.
          sessions.push({
            id: `${open.id}:open`,
            user: open.user,
            roleKey: open.roleKey,
            loginAt: open.at,
            logoutAt: null,
            durationSeconds: Math.max(
              0,
              Math.floor((new Date(event.at).getTime() - new Date(open.at).getTime()) / 1000),
            ),
            breakAfterSeconds: null,
            stillOpen: true,
          });
        }
        open = event;
        previousLogoutAt = null;
        continue;
      }

      // LOGOUT
      if (open) {
        const durationSeconds = Math.max(
          0,
          Math.floor((new Date(event.at).getTime() - new Date(open.at).getTime()) / 1000),
        );
        sessions.push({
          id: `${open.id}:${event.id}`,
          user: open.user,
          roleKey: open.roleKey,
          loginAt: open.at,
          logoutAt: event.at,
          durationSeconds,
          breakAfterSeconds: null,
          stillOpen: false,
        });
        previousLogoutAt = event.at;
        open = null;
      } else if (previousLogoutAt == null) {
        // Logout without a prior login in range — still show it as a closed stub.
        sessions.push({
          id: `${event.id}:logout-only`,
          user: event.user,
          roleKey: event.roleKey,
          loginAt: event.at,
          logoutAt: event.at,
          durationSeconds: 0,
          breakAfterSeconds: null,
          stillOpen: false,
        });
        previousLogoutAt = event.at;
      }
    }

    if (open) {
      sessions.push({
        id: `${open.id}:open`,
        user: open.user,
        roleKey: open.roleKey,
        loginAt: open.at,
        logoutAt: null,
        durationSeconds: Math.max(
          0,
          Math.floor((now - new Date(open.at).getTime()) / 1000),
        ),
        breakAfterSeconds: null,
        stillOpen: true,
      });
    }
  }

  // Fill breakAfterSeconds: idle from this logout until the next login for the same person.
  const byUserSessions = new Map<string, SessionLogSession[]>();
  for (const session of sessions) {
    const list = byUserSessions.get(session.user.id) ?? [];
    list.push(session);
    byUserSessions.set(session.user.id, list);
  }
  for (const list of byUserSessions.values()) {
    list.sort((a, b) => a.loginAt.localeCompare(b.loginAt));
    for (let i = 0; i < list.length - 1; i += 1) {
      const current = list[i];
      const next = list[i + 1];
      if (!current || !next || !current.logoutAt) {
        continue;
      }
      current.breakAfterSeconds = Math.max(
        0,
        Math.floor(
          (new Date(next.loginAt).getTime() - new Date(current.logoutAt).getTime()) / 1000,
        ),
      );
    }
  }

  return sessions.sort((a, b) => b.loginAt.localeCompare(a.loginAt));
}
