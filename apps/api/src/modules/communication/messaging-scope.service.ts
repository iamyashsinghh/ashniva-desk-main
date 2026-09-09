import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  PROJECT_MEMBER_ROLE,
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
 * **There is no reporting-line table in this product and this file does not invent one.** Reach is
 * derived from relations that already exist and that somebody already maintains, so it changes the
 * moment the relation does — which is the same property the project-anchored policy rests on:
 *
 *  * **Manager reach** — the members of the projects they manage (`projects.manager_user_id`, or
 *    a `MANAGER` row in `project_members`) and of the teams they lead (`teams.lead_user_id`).
 *  * **Lead reach** — the members of the teams they lead and of the projects they lead
 *    (`projects.lead_user_id`, or a `LEAD` row in `project_members`), **plus the managers of those
 *    projects**, so a lead can always reach the person they report into on that work.
 *  * **Everybody else** — nothing. A developer holds no `manager_user_id`, no `lead_user_id` and
 *    no `MANAGER`/`LEAD` membership, so every query below returns nothing for them and their reach
 *    is empty. That is worth stating plainly: "a developer gets no new reach" is not a rule
 *    written anywhere in this file, it is what these relations already say. Their project, task
 *    and ticket conversations, the project-anchored direct pairing and mentioning anybody on a
 *    shared project are all untouched.
 *  * **`conversation:reach-organization`** — the whole tenant. Held by the super admin by default,
 *    and a permission rather than a role comparison so that a tenant can see it on the roles
 *    screen and take it away.
 *
 * ## Who can be reached at all
 *
 * Being named by one of those relations is necessary and not sufficient. Everybody this file
 * returns is also, checked in one query and never inferred:
 *
 *  * a member of the **actor's own organization**, which for an internal actor is the provider
 *    organization — so no client user is ever a candidate, whatever a `project_members` row of
 *    theirs says;
 *  * not holding a **client role**, for the same reason twice over;
 *  * **active and not deleted**; and
 *  * a holder of **`conversation:participate`**, because offering somebody who cannot read a
 *    conversation would produce a thread that silently reaches nobody.
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
    if (actor.permissions.includes(PERMISSIONS.CONVERSATION_REACH_ORGANIZATION)) {
      const everyone = await this.eligible(actor, candidates);
      return new Map(everyone.map((user) => [user.id, 'In your organization']));
    }

    const reasons = await this.derivedReach(actor);
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
      // A page, not the organization. Somebody holding tenant-wide reach in a company of two
      // thousand should get a list they can read and a search box, not two thousand rows.
      take: DIRECTORY_PAGE,
    });
    return users.map((user) => ({
      ...user,
      reason: reasons.get(user.id) as string,
      conversationId: null,
    }));
  }

  /**
   * The relational half: every user id a project or team relation puts inside the actor's reach.
   *
   * Four queries, none of which grows with the size of the organization: the actor's own manager
   * and lead relations, then the membership of what those name. Nothing here decides whether a
   * candidate is internal or active — `eligible` does that, once, for whatever this produces.
   */
  private async derivedReach(actor: AuthenticatedUser): Promise<Map<string, string>> {
    const [ownedProjects, seniorMemberships, ledTeams] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [{ managerUserId: actor.userId }, { leadUserId: actor.userId }],
        },
        select: { id: true, code: true, managerUserId: true, leadUserId: true },
      }),
      this.prisma.projectMember.findMany({
        where: {
          userId: actor.userId,
          role: { in: [PROJECT_MEMBER_ROLE.MANAGER, PROJECT_MEMBER_ROLE.LEAD] },
          project: { organizationId: actor.organizationId, deletedAt: null },
        },
        select: { role: true, project: { select: { id: true, code: true, managerUserId: true } } },
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

    /** Project id → how the actor stands on it, and what to call it. */
    const projects = new Map<
      string,
      { code: string; managerUserId: string | null; led: boolean }
    >();
    for (const project of ownedProjects) {
      projects.set(project.id, {
        code: project.code,
        managerUserId: project.managerUserId,
        // Managing a project is the wider reach, so it wins where somebody holds both.
        led: project.managerUserId !== actor.userId,
      });
    }
    for (const membership of seniorMemberships) {
      const existing = projects.get(membership.project.id);
      const led = membership.role === PROJECT_MEMBER_ROLE.LEAD;
      projects.set(membership.project.id, {
        code: membership.project.code,
        managerUserId: membership.project.managerUserId,
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
          // A client contact is a client-side person holding a project role. They are refused
          // again by `eligible`, and excluded here so that two independent things would have to
          // fail before one appeared in a directory of colleagues.
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
      // A lead reaches the manager above them on the projects they lead, whether or not that
      // manager holds a `project_members` row.
      for (const [, project] of projects) {
        if (project.led && project.managerUserId) {
          remember(project.managerUserId, `Manages ${project.code}, which you lead`);
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
   * Everybody in the tenant this module is willing to name, in one query.
   *
   * The four conditions that make somebody a colleague rather than merely a row: a live
   * membership of the actor's own organization, a role that is not a client role, an account
   * somebody can sign in to, and `conversation:participate`.
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
      // Only reached without a candidate list by somebody holding tenant-wide reach, and bounded
      // for them: an unbounded scope resolution is an unbounded request.
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
