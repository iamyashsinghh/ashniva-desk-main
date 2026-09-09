import { Injectable } from '@nestjs/common';
import { DERIVED_MEMBERSHIP_KINDS, type ConversationKind } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
// `message-attachments` imports only a *type* from this file, so the cycle is erased at compile
// time and there is no runtime require back into here.
import { UnadoptableAttachmentsError } from './message-attachments';

const USER_REF = { select: { id: true, name: true, email: true } };

const CONVERSATION_INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  task: { select: { id: true, number: true, title: true } },
  ticket: { select: { id: true, number: true, title: true } },
  members: { include: { user: USER_REF }, orderBy: { joinedAt: 'asc' } },
} satisfies Prisma.ConversationInclude;

const MESSAGE_INCLUDE = {
  sender: USER_REF,
  attachments: { where: { deletedAt: null }, include: { uploadedBy: USER_REF } },
} satisfies Prisma.MessageInclude;

const REVISION_INCLUDE = { editedBy: USER_REF } satisfies Prisma.MessageRevisionInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;
export type MessageRevisionRow = Prisma.MessageRevisionGetPayload<{
  include: typeof REVISION_INCLUDE;
}>;

/**
 * Data access for internal conversations.
 *
 * Every method takes `organizationId` first and puts it in the where clause. That is the first
 * layer; the provider-only row-level-security policies added in 20260913090000 are the second,
 * for the query that forgets. Neither is the *authorization* — that is
 * `CommunicationPolicyService`, and nothing here decides who may see what.
 */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(organizationId: string, id: string): Promise<ConversationRow | null> {
    return this.prisma.conversation.findFirst({
      where: { id, organizationId },
      include: CONVERSATION_INCLUDE,
    });
  }

  /**
   * The conversation for one anchor key, if it exists.
   *
   * By the same key the unique index is built on, so a lookup and an insert agree about what "the
   * same thread" is — and by the same two columns, now that the index spans the tenant rather
   * than the project.
   */
  findByAnchor(organizationId: string, anchorKey: string): Promise<ConversationRow | null> {
    return this.prisma.conversation.findFirst({
      where: { organizationId, anchorKey },
      include: CONVERSATION_INCLUDE,
    });
  }

  /**
   * The conversations for many anchor keys, in one query.
   *
   * `GET /conversations/contacts` asks "is there already a thread with this person" once per
   * candidate, and used to ask the database each time. Five hundred candidates were five hundred
   * lookups for a screen that shows a list of names.
   */
  async findByAnchors(
    organizationId: string,
    anchorKeys: readonly string[],
  ): Promise<Map<string, ConversationRow>> {
    if (anchorKeys.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.conversation.findMany({
      where: { organizationId, anchorKey: { in: [...anchorKeys] } },
      include: CONVERSATION_INCLUDE,
    });
    return new Map(rows.map((row) => [row.anchorKey, row]));
  }

  /**
   * Creates a conversation, or returns null when somebody else created it first.
   *
   * The unique index on the anchor is the whole mechanism: two people opening a task's discussion
   * at the same moment produce one row, and the loser re-reads rather than creating a second
   * thread nobody would ever see.
   */
  async create(data: Prisma.ConversationUncheckedCreateInput): Promise<ConversationRow | null> {
    try {
      return await this.prisma.conversation.create({ data, include: CONVERSATION_INCLUDE });
    } catch (error) {
      return isUniqueViolation(error) ? null : Promise.reject(error);
    }
  }

  /**
   * Conversations the caller has a place in, most recent first.
   *
   * The member rows are what makes this list cheap; they are *not* what makes it authorized. The
   * service filters the result through the policy, so a conversation whose project the caller has
   * left drops out of the list on the next load without any row being deleted.
   */
  listFor(
    organizationId: string,
    userId: string,
    filter: {
      projectId?: string;
      kind?: ConversationKind;
      limit: number;
      /**
       * The tasks whose conversations this caller may see, as a predicate.
       *
       * A database predicate rather than a filter applied to the result, and that is correctness
       * rather than speed: this query takes `limit` rows in recency order, so a project's task
       * threads the caller has no place in would fill the window and push their own conversations
       * off the end. The service filters the result through the policy as well; this is what makes
       * the page it filters the right page.
       */
      taskScope?: Prisma.TaskWhereInput;
    },
  ): Promise<ConversationRow[]> {
    return this.prisma.conversation.findMany({
      where: {
        organizationId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        // Under `AND` rather than beside the membership clause below, which is itself an `OR`: two
        // `OR` keys in one `where` is one `OR` key, silently, and the one that survives would have
        // been the membership one.
        ...(filter.taskScope
          ? // Everything that is not a task conversation is unaffected; a task conversation has to
            // hang off a task the caller has a relationship with.
            { AND: [{ OR: [{ taskId: null }, { task: filter.taskScope }] }] }
          : {}),
        OR: [
          // A member row the person has not left. `leftAt` matters here and only here: for a
          // group it is the membership, so a former member's row must stop producing a listing.
          { members: { some: { userId, leftAt: null } } },
          // The derived kinds have no membership to match on: whoever is on the project belongs
          // to them, and the policy filter decides which of those the caller may actually see.
          {
            kind: { in: [...DERIVED_MEMBERSHIP_KINDS] },
            project: { members: { some: { userId } } },
          },
        ],
      },
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: filter.limit,
    });
  }

  /** Every conversation in the organization, for super-admin oversight. Always audited. */
  listAll(
    organizationId: string,
    filter: { projectId?: string; limit: number },
  ): Promise<ConversationRow[]> {
    return this.prisma.conversation.findMany({
      where: { organizationId, ...(filter.projectId ? { projectId: filter.projectId } : {}) },
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: filter.limit,
    });
  }

  messages(conversationId: string, limit: number, cursor?: string): Promise<MessageRow[]> {
    return this.prisma.message.findMany({
      where: { conversationId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: MESSAGE_INCLUDE,
      // Newest first so a cursor walks backwards through the thread; the caller reverses for
      // display. Ids are UUIDv7, so ordering by id is ordering by time and is stable under ties.
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  findMessage(conversationId: string, clientMessageId: string): Promise<MessageRow | null> {
    return this.prisma.message.findFirst({
      where: { conversationId, clientMessageId },
      include: MESSAGE_INCLUDE,
    });
  }

  /** One message of one conversation. Scoped by conversation so an id from another thread misses. */
  messageById(conversationId: string, messageId: string): Promise<MessageRow | null> {
    return this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      include: MESSAGE_INCLUDE,
    });
  }

  /**
   * Rewrites a message, keeping what it said before. Null when the row has moved on.
   *
   * One transaction, because a revision written without the edit landing would claim a change
   * that never happened, and an edit without its revision is the destructive rewrite the revision
   * exists to prevent.
   *
   * The `updateMany` claim is the same idiom the rest of the repositories use, and here it is what
   * makes the revision trail true under contention. The policy judged a row read a moment ago, so
   * the sender's two open tabs both arrive: pinned to `editedAt`, the loser matches nothing and is
   * told so, rather than writing a second revision of the *same* pre-edit body and dropping one of
   * the two new ones with nothing recording it. `deletedAt: null` covers the other race — an
   * oversight withdrawal landing between the read and the write — so an edit cannot put words and
   * an `editedAt` onto a tombstone.
   */
  async editMessage(
    message: MessageRow,
    body: string,
    editedById: string,
  ): Promise<MessageRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.message.updateMany({
        where: { id: message.id, deletedAt: null, editedAt: message.editedAt },
        data: { body, editedAt: new Date() },
      });
      if (claimed.count === 0) {
        return null;
      }
      await tx.messageRevision.create({
        data: {
          organizationId: message.organizationId,
          messageId: message.id,
          body: message.body,
          editedById,
        },
      });
      return tx.message.findFirstOrThrow({ where: { id: message.id }, include: MESSAGE_INCLUDE });
    });
  }

  /**
   * Withdraws a message without removing its row. Null when it was already withdrawn.
   *
   * The row keeps its place so the thread still reads correctly and the mapper renders a
   * tombstone. The attachments are soft-deleted with it: blanking them out of this module's
   * response while the files module would still hand the bytes to anybody with the id would be a
   * tombstone in one place and the file in another.
   *
   * Claimed on `deletedAt: null` for the same reason the edit is claimed: the policy read the row
   * before deciding, so two withdrawals of one message both reach here, and only the one that
   * moves the row from live to withdrawn should be told it removed anything.
   */
  async softDeleteMessage(message: MessageRow): Promise<MessageRow | null> {
    const at = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.message.updateMany({
        where: { id: message.id, deletedAt: null },
        data: { deletedAt: at },
      });
      if (claimed.count === 0) {
        return null;
      }
      if (message.attachments.length > 0) {
        await tx.file.updateMany({
          // Scoped to the message's tenant as well as to its ids. The ids come from a read that
          // was already scoped, so nothing today reaches past it; the tenant column is here so a
          // later refactor of where the ids come from cannot make this the write that does.
          where: {
            id: { in: message.attachments.map((file) => file.id) },
            organizationId: message.organizationId,
          },
          data: { deletedAt: at },
        });
      }
      return tx.message.findFirstOrThrow({ where: { id: message.id }, include: MESSAGE_INCLUDE });
    });
  }

  /** What a message said before each of its edits, oldest first. */
  revisionsOf(messageId: string): Promise<MessageRevisionRow[]> {
    return this.prisma.messageRevision.findMany({
      where: { messageId },
      include: REVISION_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Writes a message and moves the conversation's clock, in one transaction.
   *
   * Returns null when the sender's own id has been used before on this conversation, which is how
   * a retried send returns the first message rather than posting a second one. Attaching the
   * files happens here too: a message and its attachments appear together or not at all.
   */
  async addMessage(
    data: Prisma.MessageUncheckedCreateInput,
    attachmentIds: readonly string[],
  ): Promise<MessageRow | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({ data, include: MESSAGE_INCLUDE });
        if (attachmentIds.length > 0) {
          const adopted = await tx.file.updateMany({
            where: {
              id: { in: [...attachmentIds] },
              organizationId: data.organizationId,
              uploadedById: data.senderId ?? undefined,
              // Only a file nothing else owns yet, so a message cannot adopt a ticket's
              // attachment and carry it into a conversation the ticket's readers cannot see.
              messageId: null,
              taskId: null,
              ticketId: null,
              commentId: null,
              deletedAt: null,
            },
            data: { messageId: message.id, projectId: data.projectId, visibility: 'INTERNAL' },
          });
          // The count this filter returns is the whole answer, and discarding it was the bug: a
          // file that did not match was dropped without a word. Checked *here*, inside the write,
          // rather than by asking first — a separate lookup would cost a query on every send with
          // an attachment and would still race with whatever adopted the file in between, while
          // this is the same statement that does the work, so what it counted is what it changed.
          // The caller expects `attachmentIds` to be distinct; `MessagesService` makes it so.
          if (adopted.count !== attachmentIds.length) {
            throw new UnadoptableAttachmentsError(attachmentIds.length, adopted.count);
          }
        }
        await tx.conversation.update({
          where: { id: data.conversationId },
          data: { lastMessageAt: message.createdAt },
        });
        return tx.message.findFirstOrThrow({
          where: { id: message.id },
          include: MESSAGE_INCLUDE,
        });
      });
    } catch (error) {
      return isUniqueViolation(error) ? null : Promise.reject(error);
    }
  }

  /** Renaming a group, or changing its picture. Only ever these two columns. */
  async updateConversation(
    conversationId: string,
    data: { title?: string; imageFileId?: string | null },
  ): Promise<ConversationRow> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      include: CONVERSATION_INCLUDE,
    });
  }

  /** Unread counts for a set of conversations, in one query. */
  async unreadCounts(
    userId: string,
    conversations: readonly ConversationRow[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (conversations.length === 0) {
      return counts;
    }
    const rows = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversations.map((row) => row.id) },
        senderId: { not: userId },
        deletedAt: null,
        OR: conversations.map((row) => ({
          conversationId: row.id,
          createdAt: {
            gt: row.members.find((member) => member.userId === userId)?.lastReadAt ?? new Date(0),
          },
        })),
      },
      _count: { _all: true },
    });
    for (const row of rows) {
      counts.set(row.conversationId, row._count._all);
    }
    return counts;
  }

  /** The last message of each conversation, for the list preview. */
  async previews(conversationIds: readonly string[]): Promise<Map<string, MessageRow>> {
    const previews = new Map<string, MessageRow>();
    if (conversationIds.length === 0) {
      return previews;
    }
    // One row per conversation would need a lateral join; taking the newest few and keeping the
    // first per conversation is simpler and bounded by the page size the caller already chose.
    const rows = await this.prisma.message.findMany({
      where: { conversationId: { in: [...conversationIds] }, deletedAt: null },
      include: MESSAGE_INCLUDE,
      orderBy: { id: 'desc' },
      take: conversationIds.length * 4,
    });
    for (const row of rows) {
      if (!previews.has(row.conversationId)) {
        previews.set(row.conversationId, row);
      }
    }
    return previews;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
