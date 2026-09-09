import { Injectable } from '@nestjs/common';
import { CONVERSATION_MEMBER_ROLE, type ConversationMemberRole } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';

/**
 * The `conversation_members` rows: joining, leaving, and moving a read cursor.
 *
 * Its own repository because the table means two different things depending on which kind of
 * conversation the row belongs to, and that difference is the whole of this release. For a
 * project-anchored thread a row is a read cursor and a hint, never consulted as authorization; for
 * a group it *is* the membership. Nothing here decides which — `CommunicationPolicyService` does —
 * but keeping the writes in one small file makes the set of ways a membership can change something
 * a reviewer can enumerate.
 */
@Injectable()
export class ConversationMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Makes sure somebody has a member row, so their read cursor has somewhere to live.
   *
   * For a project-anchored conversation this is still a hint and nothing more. For a group it is
   * the act of joining, which is why it can now say who did the adding and with what standing,
   * and why re-adding somebody who left clears their `leftAt` and moves `joinedAt` rather than
   * making a second row: the row is the person's place in the thread, and they only have one.
   */
  async ensureMember(
    organizationId: string,
    conversationId: string,
    userId: string,
    options: { role?: ConversationMemberRole; addedById?: string | null; rejoin?: boolean } = {},
  ): Promise<void> {
    const role = options.role ?? CONVERSATION_MEMBER_ROLE.MEMBER;
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: {
        organizationId,
        conversationId,
        userId,
        role,
        addedById: options.addedById ?? null,
      },
      update: options.rejoin
        ? { leftAt: null, joinedAt: new Date(), role, addedById: options.addedById ?? null }
        : {},
    });
  }

  /**
   * Takes somebody out of a group without deleting the record that they were in it.
   *
   * A tombstone for a membership, for the same reason a withdrawn message keeps its row: the
   * thread still has to render who said what, and "there is no row" cannot be told apart from
   * "there never was one". Claimed on `leftAt: null` so two removals of one person do not both
   * claim to have removed them.
   */
  async markMemberLeft(conversationId: string, userId: string): Promise<boolean> {
    const claimed = await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return claimed.count > 0;
  }

  /**
   * Moves somebody's read cursor.
   *
   * `updateMany` rather than `update` so a caller with no row is a no-op instead of an error —
   * an inspector marking a thread read has no place in it and should not acquire one.
   */
  async markRead(conversationId: string, userId: string, at: Date): Promise<void> {
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: at },
    });
  }
}
