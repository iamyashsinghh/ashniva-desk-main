import { Injectable } from '@nestjs/common';
import {
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  PERMISSIONS,
  type AuthenticatedUser,
  type ConversationAudienceMember,
  type ProjectMemberRole,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { TaskChatScopeService } from '../tasks/task-chat-scope.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationsService } from './conversations.service';
import type { ConversationRow } from './conversations.repository';

/**
 * Everybody who may receive a message in this conversation, recomputed now.
 *
 * This is requirement nineteen made real, and it is the one list three separate things agree
 * about: who the realtime fan-out reaches, who a notification may name, and who the composer may
 * offer as a mention. Delivery is not "whoever subscribed" and not "whoever has a member row" —
 * it is whoever is on the project *and* holds `conversation:participate` at this moment, which is
 * the pair of facts the read endpoint itself refuses on. A developer removed from the project
 * between two messages receives the first and not the second, their open socket makes no
 * difference, and the picker stops offering them on the next load.
 *
 * Offering the *same* list to the composer is what makes a mention honest: a name the picker
 * shows is a name the notification will actually reach, rather than one the send path silently
 * drops after the sender has typed it.
 */
@Injectable()
export class ConversationAudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CommunicationPolicyService,
    private readonly conversations: ConversationsService,
    private readonly taskChatScope: TaskChatScopeService,
  ) {}

  /** The audience of a message, without the person who wrote it. */
  async forSender(actor: AuthenticatedUser, row: ConversationRow): Promise<string[]> {
    const audience = await this.userIds(row);
    return audience.filter((userId) => userId !== actor.userId);
  }

  /**
   * Everybody the conversation reaches, the sender included.
   *
   * Two facts, and both have to hold. **Project membership**, which is what a direct
   * conversation's named participants are still checked against — a counterpart who has left the
   * project is delivered nothing. And **`conversation:participate`**, which is what the HTTP read
   * path refuses on: a tenant may build a custom role without it and put somebody holding that
   * role on a project, and `GET /conversations/:id/messages` then answers 403. A fan-out that
   * asked only the first question would push every message body to that person's socket, which
   * would make the endpoint's refusal decoration rather than a control.
   */
  async userIds(row: ConversationRow): Promise<string[]> {
    if (row.projectId === null) {
      // A scope conversation has no project to intersect with, so the member list is the whole
      // audience — the one place in this module where it is. `leftAt` is what keeps it honest:
      // somebody removed from a group stops being delivered to on the next message, and the row
      // that records they were once here is not a subscription.
      const listed = row.members
        .filter((member) => member.leftAt === null)
        .map((member) => member.userId);
      const active = await this.prisma.user.findMany({
        where: { id: { in: listed }, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      return this.withParticipatePermission(
        row.organizationId,
        active.map((user) => user.id),
      );
    }
    // A task conversation reaches the people with a place on the *task*, not everybody on its
    // project. The list is the exact inverse of the predicate the read path is refused by, and it
    // has to stay one: a person who can open the thread and is never delivered to would miss
    // messages with no way to tell, and a person delivered to who cannot open it would be pushed
    // bodies the endpoint refuses them.
    const onTask =
      row.kind === CONVERSATION_KIND.TASK && row.taskId
        ? await this.taskChatAudience(row.taskId)
        : null;

    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId: row.projectId,
        // A direct conversation delivers to its two named participants and nobody else; the
        // derived kinds reach whoever the project admits. `ProjectMember` is hard-deleted — no
        // `deletedAt` — so the row's existence is the membership, but the account behind it still
        // has to be one somebody can sign in to.
        ...(row.kind === CONVERSATION_KIND.DIRECT
          ? { userId: { in: row.members.map((member) => member.userId) } }
          : {}),
        // Intersected rather than replaced: `canCommunicate` refuses somebody who is not on the
        // project whatever their place on the task, so an audience that named them would be wider
        // than the read path and this list must never be that.
        ...(onTask ? { userId: { in: onTask } } : {}),
        user: { deletedAt: null, status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return this.withParticipatePermission(
      row.organizationId,
      members.map((member) => member.userId),
    );
  }

  /** The people a task's own relations put in its conversation. Empty when the task has gone. */
  private async taskChatAudience(taskId: string): Promise<string[]> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        assignedToId: true,
        createdById: true,
        reviewerId: true,
        testerId: true,
      },
    });
    return task ? this.taskChatScope.audienceFor(task) : [];
  }

  /**
   * The audience with names, for the composer's mention picker.
   *
   * Read-authorized like every other endpoint here, and *not* widened by oversight: an inspector
   * may read a thread they are not part of, but there is nobody in it for them to address, and
   * handing them a directory of a project's staff is not what a read grant is for.
   */
  async listFor(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationAudienceMember[]> {
    const row = await this.conversations.load(actor, conversationId);
    const context = this.conversations.contextOf(row, actor.userId);
    const decision = await this.policy.require(actor, COMMUNICATION_ACTION.READ, context);
    if (decision.viaOversight) {
      return [];
    }

    const userIds = await this.userIds(row);
    // Two queries rather than one per candidate: the picker opens on every keystroke of an `@`,
    // and a query per name would make the cost of the roster the size of the project team.
    const [users, memberships] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      row.projectId === null
        ? // A scope conversation has no project, so there is no project role to show. Null is the
          // honest answer rather than an omission.
          Promise.resolve([] as Array<{ userId: string; role: ProjectMemberRole }>)
        : this.prisma.projectMember.findMany({
            where: { projectId: row.projectId, userId: { in: userIds } },
            select: { userId: true, role: true },
          }),
    ]);
    const roles = new Map<string, ProjectMemberRole>(
      memberships.map((member) => [member.userId, member.role as ProjectMemberRole]),
    );
    return users.map((user) => ({ ...user, projectRole: roles.get(user.id) ?? null }));
  }

  /**
   * Keeps only the people whose role in this organization still grants `conversation:participate`.
   *
   * Joined through the membership rather than asked of the policy once per candidate: the policy
   * needs a signed-in caller's permission list, which is exactly what nobody has for somebody
   * else, and a query per member of a project channel is a query per message sent.
   */
  private async withParticipatePermission(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { in: [...userIds] },
        deletedAt: null,
        role: {
          permissions: {
            some: { permission: { key: PERMISSIONS.CONVERSATION_PARTICIPATE } },
          },
        },
      },
      select: { userId: true },
    });
    const allowed = new Set(memberships.map((membership) => membership.userId));
    return userIds.filter((userId) => allowed.has(userId));
  }
}
