import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  DEFAULT_MENTIONABLE_LIMIT,
  MAX_MENTIONABLE_LIMIT,
  MIN_MENTIONABLE_QUERY_LENGTH,
  PROJECT_MEMBER_ROLE_LABELS,
  mentionsIn,
  type AuthenticatedUser,
  type MentionablePage,
  type MentionableUser,
  type ProjectMemberRole,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationAudienceService } from './conversation-audience.service';
import type { ConversationRow } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { MentionableQueryDto } from './dto/communication.dto';

/**
 * Who may be named in a mention here, and what happens to a name that was not.
 *
 * The composer says "type @ to mention somebody", and until now nothing on the server decided who
 * that somebody could be. A mention was a user id typed into a message body, and the only thing
 * standing between a forged one and a notification was that the notification path happened to
 * intersect it with the delivery audience — which is a coincidence of that file's shape, not a
 * rule, and it left the forged id sitting in the stored body for every renderer to resolve.
 *
 * Two halves, and they are deliberately the same list:
 *
 *  * **The picker** asks this service what the audience is. It is the conversation's *own*
 *    audience — `ConversationAudienceService`, the one list the realtime fan-out and the
 *    notification dispatcher already use — so a name the picker offers is a name a message will
 *    actually reach. For a task thread that is the people with a place on the task; for a project
 *    channel the project's staff; for a group its members. There is no directory here and no
 *    query that grows with the size of the company.
 *  * **The send path** intersects the ids in the body with that same list and refuses the message
 *    when one is not in it. Refusing rather than quietly dropping: a mention that vanishes leaves
 *    the sender believing they addressed somebody, and a forged one is worth an audit row.
 *
 * A mention is never a way to reach somebody outside the thread, and never a grant: passing this
 * check delivers a notification, and nothing else — the recipient still has to be admitted by the
 * read policy to open the conversation, which is the same check that put them in this list.
 */
@Injectable()
export class ConversationMentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CommunicationPolicyService,
    private readonly conversations: ConversationsService,
    private readonly audience: ConversationAudienceService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * A page of the people the caller may mention here.
   *
   * Read-authorized like every other endpoint in this module, and — like `GET
   * /conversations/:id/audience` — *not* widened by oversight: an inspector may read a thread they
   * are not part of, but there is nobody in it for them to address, and a roster of a project's
   * staff is not what a read grant is for.
   */
  async list(
    actor: AuthenticatedUser,
    conversationId: string,
    query: MentionableQueryDto,
  ): Promise<MentionablePage> {
    const row = await this.conversations.load(actor, conversationId);
    const context = this.conversations.contextOf(row, actor.userId);
    const decision = await this.policy.require(actor, COMMUNICATION_ACTION.READ, context);
    if (decision.viaOversight) {
      return { items: [] };
    }

    const limit = Math.min(query.limit ?? DEFAULT_MENTIONABLE_LIMIT, MAX_MENTIONABLE_LIMIT);
    const audience = (await this.audience.userIds(row)).filter(
      // Mentioning yourself notifies nobody, so offering it is offering a no-op.
      (userId) => userId !== actor.userId,
    );
    if (audience.length === 0) {
      return { items: [] };
    }

    const term = (query.q ?? '').trim();
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: audience },
        // Below the minimum the term is a keystroke rather than a search, so the answer is the head
        // of the audience in name order — the page the picker shows before anybody types. At or
        // above it the two `contains` are served by `users_name_trgm_idx` / `users_email_trgm_idx`,
        // and in either case the candidate set is this conversation's audience and never the
        // employee table.
        ...(term.length >= MIN_MENTIONABLE_QUERY_LENGTH
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      // Name first for the reader, id second so the order is total and a cursor can sit on it.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const page = users.slice(0, limit);
    const labels = await this.labelsFor(
      row,
      page.map((user) => user.id),
    );
    const items: MentionableUser[] = page.map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      roleName: labels.roles.get(user.id) ?? null,
      contextLabel: labels.context.get(user.id) ?? null,
    }));
    return {
      items,
      ...(users.length > limit ? { nextCursor: page.at(-1)?.id } : {}),
    };
  }

  /**
   * Refuses a message naming somebody this conversation does not reach.
   *
   * Called on the way in by both the send and the edit path, because an edit that could introduce a
   * mention the send path would have refused is the same hole with an extra step.
   *
   * The audience is recomputed here rather than reused from the caller's fan-out: this runs before
   * the row is written, and the fan-out list is built after it. One extra resolution of a list the
   * request was going to build anyway, in exchange for the check happening before the forged id is
   * stored rather than after.
   */
  async assertMentionsAreReachable(
    actor: AuthenticatedUser,
    row: ConversationRow,
    body: string,
  ): Promise<void> {
    const mentioned = mentionsIn(body);
    if (mentioned.length === 0) {
      return;
    }
    const reachable = new Set(await this.audience.userIds(row));
    // The sender is in their own conversation's audience, so quoting themselves is not a forgery.
    reachable.add(actor.userId);
    const forged = mentioned.filter((userId) => !reachable.has(userId));
    if (forged.length === 0) {
      return;
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CONVERSATION_ACCESS_DENIED,
      entityType: AUDIT_ENTITY_TYPE.CONVERSATION,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      // The ids that were named and refused, and nothing of the body. Somebody walking a list of
      // user ids through a composer is exactly the pattern an audit log exists to make visible.
      after: { attempted: 'MENTION', projectId: row.projectId, userIds: forged },
    });
    throw new BadRequestException('You cannot mention somebody who is not in this conversation');
  }

  /**
   * The two strings a picker shows beside a name, for one page of people.
   *
   * Both are decoration — nothing decides anything from them — so they are fetched for the page
   * that is about to be rendered rather than for the whole audience.
   */
  private async labelsFor(
    row: ConversationRow,
    userIds: readonly string[],
  ): Promise<{ roles: Map<string, string>; context: Map<string, string> }> {
    const roles = new Map<string, string>();
    const context = new Map<string, string>();
    if (userIds.length === 0) {
      return { roles, context };
    }

    const [memberships, projectMembers] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: {
          organizationId: row.organizationId,
          userId: { in: [...userIds] },
          deletedAt: null,
        },
        select: { userId: true, role: { select: { name: true } } },
      }),
      row.projectId === null
        ? Promise.resolve([] as Array<{ userId: string; role: string }>)
        : this.prisma.projectMember.findMany({
            where: { projectId: row.projectId, userId: { in: [...userIds] } },
            select: { userId: true, role: true },
          }),
    ]);

    for (const membership of memberships) {
      roles.set(membership.userId, membership.role.name);
    }
    // What connects this person to the thread, said in as few words as a picker row can carry: the
    // project for a conversation that has one, and their standing on it where they hold one.
    const project = row.project ? (row.project.code ?? row.project.name) : null;
    for (const member of projectMembers) {
      const label = PROJECT_MEMBER_ROLE_LABELS[member.role as ProjectMemberRole];
      context.set(member.userId, project ? `${label} on ${project}` : label);
    }
    if (project) {
      for (const userId of userIds) {
        if (!context.has(userId)) {
          context.set(userId, `On ${project}`);
        }
      }
    } else if (row.kind === CONVERSATION_KIND.GROUP && row.title) {
      for (const userId of userIds) {
        context.set(userId, `In ${row.title}`);
      }
    }
    return { roles, context };
  }
}
