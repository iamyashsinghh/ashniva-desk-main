import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';

import {
  ConversationsRepository,
  messageViewerOf,
  type ConversationRow,
} from './conversations.repository';

/**
 * Whether a new message may quote the one it names.
 *
 * The original is looked up *within* the conversation and *through the sender's own visibility*,
 * with the same query the thread and the moderation routes use. An id from another conversation,
 * a tagged line the sender cannot read and an id that does not exist are therefore one answer —
 * not found — so replying cannot be used to learn anything about a message the sender was never
 * shown.
 */
@Injectable()
export class MessageRepliesService {
  constructor(private readonly conversations: ConversationsRepository) {}

  async assertReplyable(
    actor: AuthenticatedUser,
    row: ConversationRow,
    replyToId: string,
  ): Promise<void> {
    const original = await this.conversations.messageById(
      row.id,
      replyToId,
      messageViewerOf(actor),
    );
    // A system note (a call starting or ending) has nobody to answer, and quoting one would make a
    // reply look addressed to the system.
    if (!original || original.systemKind !== null) {
      throw new NotFoundException('The message you are replying to was not found');
    }
    if (original.deletedAt) {
      throw new ConflictException('That message was withdrawn, so it can no longer be replied to');
    }
  }
}
