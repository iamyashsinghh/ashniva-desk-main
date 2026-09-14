import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  PROJECT_MEMBER_ROLE,
  ROLE_KEYS,
  canUsePersonalChat,
  isClientRole,
  type AuthenticatedUser,
  type MessagingScopeContact,
  type RoleKey,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';

/** How many names one directory request returns. Beyond it, the caller narrows with a search. */
const DIRECTORY_PAGE = 100;

/** How many colleagues a tenant-wide reach resolves at once. */
const ELIGIBLE_LIMIT = 1000;

/**
 * Who somebody may reach when there is no project between them.
 *
 * **This is the only place the question is answered.** Three surfaces ask it — who may be sent a
 * direct message, who may be added to a group, and who the messaging directory returns — and a
 * rule written out three times is a rule that will be three different rules by the second change
 * to it. Every one of them calls this file, and the endpoints re-ask it on the way in rather than
 * trusting anything the caller says.
 *
 * ## Where the scope comes from
 *
 * There is no reporting-line table. Reach is derived from relations that already exist:
 *
 *  * **Admin (`conversation:reach-organization` / super admin)** — every eligible colleague.
 *  * **Project manager** — the people on the projects they manage and the teams those projects
 *    (and they) sit on. They may message those people in private and in the project group.
 *  * **Team lead** — the people on their team and the projects they lead. Same: private and group.
 *  * **Developer (and other staff)** — nobody in private. They only post in the project team group.
 *
 * ## Who can be reached at all
 *
 * Being named by one of those relations is necessary and not sufficient. Everybody this file
 * returns is also, checked in one query and never inferred:
 *
 *  * a member of the **actor's own organization**;
 *  * not holding a **client role**;
 *  * **active and not deleted**; and
 *  * a holder of **`conversation:participate`**.
 */
@Injectable()
export class MessagingScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The people the actor may reach, with the relation that admits each one.
   *
   * `candidates` narrows the final eligibility query when the caller already knows which names it
   * cares about; the scope itself is resolved the same way either way.
   */
  async reachable(
    actor: AuthenticatedUser,
    candidates?: readonly string[],
  ): Promise<Map<string, string>> {
    if (!isInternalUser(actor)) {
      return new Map();
    }

    if (
      actor.permissions.includes(PERMISSIONS.CONVERSATION_REACH_ORGANIZATION) ||
      actor.roleKey === ROLE_KEYS.SUPER_ADMIN
    ) {
      const everyone = await this.eligible(actor, candidates);
      const reasons = await this.derivedReach(actor);
      return new Map(
        everyone.map((user) => [user.id, reasons.get(user.id) ?? 'In your organization']),
      );
    }

    if (!canUsePersonalChat(actor.roleKey)) {
      return new Map();
    }

    const reasons = await this.derivedReach(actor);
    for (const [id, reason] of await this.teammateReach(actor)) {
      if (!reasons.has(id)) {
        reasons.set(id, reason);
      }
    }
    if (reasons.size === 0) {
      return new Map();
    }
    const eligible = await this.eligible(
      actor,
      candidates
        ? [...reasons.keys()].filter((id) => candidates.includes(id))
        : [...reasons.keys()],
    );
    return new Map(eligible.map((user) => [user.id, reasons.get(user.id) as string]));
  }

  /** The directory the composer offers: everybody in reach, with names and any existing thread. */
  async directory(actor: AuthenticatedUser, search?: string): Promise<MessagingScopeContact[]> {
    const reasons = await this.reachable(actor);
    if (reasons.size === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: [...reasons.keys()] },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: DIRECTORY_PAGE,
    });
    return users.map((user) => ({
      ...user,
      reason: reasons.get(user.id) as string,
      conversationId: null,
    }));
  }

  /**
   * Manager and lead reach: the people their projects and teams already name.
   */
  private async derivedReach(actor: AuthenticatedUser): Promise<Map<string, string>> {
    const [ownedProjects, seniorMemberships, ledTeams] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [{ managerUserId: actor.userId }, { leadUserId: actor.userId }],
        },
        select: { id: true, code: true, managerUserId: true, leadUserId: true, teamId: true },
      }),
      this.prisma.projectMember.findMany({
        where: {
          userId: actor.userId,
          role: { in: [PROJECT_MEMBER_ROLE.MANAGER, PROJECT_MEMBER_ROLE.LEAD] },
          project: { organizationId: actor.organizationId, deletedAt: null },
        },
        select: {
          role: true,
          project: { select: { id: true, code: true, managerUserId: true, teamId: true } },
        },
      }),
      this.prisma.team.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          leadUserId: actor.userId,
        },
        select: { id: true, name: true },
      }),
    ]);

    const projects = new Map<
      string,
      { code: string; managerUserId: string | null; teamId: string | null; led: boolean }
    >();
    for (const project of ownedProjects) {
      projects.set(project.id, {
        code: project.code,
        managerUserId: project.managerUserId,
        teamId: project.teamId,
        led: project.managerUserId !== actor.userId,
      });
    }
    for (const membership of seniorMemberships) {
      const existing = projects.get(membership.project.id);
      const led = membership.role === PROJECT_MEMBER_ROLE.LEAD;
      projects.set(membership.project.id, {
        code: membership.project.code,
        managerUserId: membership.project.managerUserId,
        teamId: membership.project.teamId,
        led: existing ? existing.led && led : led,
      });
    }

    const reasons = new Map<string, string>();
    const remember = (userId: string, reason: string): void => {
      if (userId !== actor.userId && !reasons.has(userId)) {
        reasons.set(userId, reason);
      }
    };

    if (projects.size > 0) {
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: { in: [...projects.keys()] },
          role: { not: PROJECT_MEMBER_ROLE.CLIENT_CONTACT },
        },
        select: { userId: true, projectId: true },
      });
      for (const member of members) {
        const project = projects.get(member.projectId);
        if (project) {
          remember(
            member.userId,
            project.led
              ? `On ${project.code}, which you lead`
              : `On ${project.code}, which you manage`,
          );
        }
      }
      for (const [, project] of projects) {
        if (project.led && project.managerUserId) {
          remember(project.managerUserId, `Manages ${project.code}, which you lead`);
        }
      }

      const linkedTeamIds = [
        ...new Set(
          [...projects.values()]
            .map((project) => project.teamId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (linkedTeamIds.length > 0) {
        const teams = await this.prisma.team.findMany({
          where: { id: { in: linkedTeamIds } },
          select: { id: true, name: true },
        });
        const names = new Map(teams.map((team) => [team.id, team.name]));
        const teamMembers = await this.prisma.teamMember.findMany({
          where: { teamId: { in: linkedTeamIds } },
          select: { userId: true, teamId: true },
        });
        for (const member of teamMembers) {
          remember(member.userId, `In ${names.get(member.teamId) ?? 'your team'}`);
        }
      }
    }

    if (ledTeams.length > 0) {
      const names = new Map(ledTeams.map((team) => [team.id, team.name]));
      const members = await this.prisma.teamMember.findMany({
        where: { teamId: { in: ledTeams.map((team) => team.id) } },
        select: { userId: true, teamId: true },
      });
      for (const member of members) {
        remember(member.userId, `In ${names.get(member.teamId) ?? 'your team'}, which you lead`);
      }
    }

    return reasons;
  }

  /**
   * Developer (and other non-management staff) reach: people they already work with.
   */
  private async teammateReach(actor: AuthenticatedUser): Promise<Map<string, string>> {
    const [projectMemberships, teamMemberships] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: {
          userId: actor.userId,
          role: { not: PROJECT_MEMBER_ROLE.CLIENT_CONTACT },
          project: { organizationId: actor.organizationId, deletedAt: null },
        },
        select: { project: { select: { id: true, code: true, managerUserId: true, leadUserId: true } } },
      }),
      this.prisma.teamMember.findMany({
        where: {
          userId: actor.userId,
          team: { organizationId: actor.organizationId, deletedAt: null },
        },
        select: { teamId: true, team: { select: { id: true, name: true } } },
      }),
    ]);

    const reasons = new Map<string, string>();
    const remember = (userId: string, reason: string): void => {
      if (userId !== actor.userId && !reasons.has(userId)) {
        reasons.set(userId, reason);
      }
    };

    const projectIds = [...new Set(projectMemberships.map((row) => row.project.id))];
    const teamIds = [...new Set(teamMemberships.map((row) => row.teamId))];

    if (teamIds.length > 0) {
      const linkedProjects = await this.prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          teamId: { in: teamIds },
        },
        select: { id: true, code: true, managerUserId: true, leadUserId: true },
      });
      for (const project of linkedProjects) {
        if (!projectIds.includes(project.id)) {
          projectIds.push(project.id);
          projectMemberships.push({ project });
        }
      }
    }

    if (projectIds.length > 0) {
      const members = await this.prisma.projectMember.findMany({
        where: {
          projectId: { in: projectIds },
          role: { not: PROJECT_MEMBER_ROLE.CLIENT_CONTACT },
        },
        select: { userId: true, projectId: true },
      });
      const byId = new Map(projectMemberships.map((row) => [row.project.id, row.project]));
      for (const member of members) {
        const project = byId.get(member.projectId);
        remember(member.userId, `On ${project?.code ?? 'your project'}`);
      }
      for (const row of projectMemberships) {
        if (row.project.managerUserId) {
          remember(row.project.managerUserId, `Manages ${row.project.code}`);
        }
        if (row.project.leadUserId) {
          remember(row.project.leadUserId, `Leads ${row.project.code}`);
        }
      }
    }

    if (teamIds.length > 0) {
      const names = new Map(teamMemberships.map((row) => [row.teamId, row.team.name]));
      const members = await this.prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true, teamId: true },
      });
      for (const member of members) {
        remember(member.userId, `In ${names.get(member.teamId) ?? 'your team'}`);
      }
    }

    return reasons;
  }

  /**
   * Everybody in the tenant this module is willing to name, in one query.
   */
  private async eligible(
    actor: AuthenticatedUser,
    candidates?: readonly string[],
  ): Promise<Array<{ id: string }>> {
    if (candidates && candidates.length === 0) {
      return [];
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        userId: { not: actor.userId, ...(candidates ? { in: [...candidates] } : {}) },
        user: { deletedAt: null, status: 'ACTIVE' },
        role: {
          permissions: { some: { permission: { key: PERMISSIONS.CONVERSATION_PARTICIPATE } } },
        },
      },
      select: { userId: true, role: { select: { key: true, templateKey: true } } },
      ...(candidates ? {} : { take: ELIGIBLE_LIMIT }),
    });
    return memberships
      .filter(
        (membership) =>
          !isClientRole((membership.role.templateKey ?? membership.role.key) as RoleKey),
      )
      .map((membership) => ({ id: membership.userId }));
  }
}
