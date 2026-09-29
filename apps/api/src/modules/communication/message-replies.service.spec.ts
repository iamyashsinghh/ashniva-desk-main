import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';

import type { ConversationRow, ConversationsRepository } from './conversations.repository';
import { MessageRepliesService } from './message-replies.service';

/**
 * What a reply may quote. The lookup is the whole check, so these tests pin down *how* it looks:
 * inside this conversation and through the sender's own visibility, which is what makes a message
 * from another thread and a tagged line the sender cannot read the same 404.
 */

const actor = {
  userId: 'user-bob',
  organizationId: 'org-1',
  roleKey: 'DEVELOPER',
} as AuthenticatedUser;
const row = { id: 'conversation-1' } as ConversationRow;

function service(found: unknown) {
  const messageById = jest.fn().mockResolvedValue(found);
  const repository = { messageById } as unknown as ConversationsRepository;
  return { replies: new MessageRepliesService(repository), messageById };
}

describe('MessageRepliesService.assertReplyable', () => {
  it('looks the original up inside this conversation, as the sender sees it', async () => {
    const { replies, messageById } = service({ systemKind: null, deletedAt: null });

    await replies.assertReplyable(actor, row, 'original-1');

    expect(messageById).toHaveBeenCalledWith('conversation-1', 'original-1', {
      userId: 'user-bob',
      readsEveryTagged: false,
    });
  });

  it('refuses an original from another conversation, or one the sender cannot read, as not found', async () => {
    // Both come back from the scoped lookup as no row, so both are the same answer.
    const { replies } = service(null);

    await expect(replies.assertReplyable(actor, row, 'elsewhere')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a system note as not found', async () => {
    const { replies } = service({ systemKind: 'CALL_STARTED', deletedAt: null });

    await expect(replies.assertReplyable(actor, row, 'note')).rejects.toThrow(NotFoundException);
  });

  it('refuses a withdrawn original with a conflict that says why', async () => {
    const { replies } = service({ systemKind: null, deletedAt: new Date() });

    await expect(replies.assertReplyable(actor, row, 'gone')).rejects.toThrow(ConflictException);
    await expect(replies.assertReplyable(actor, row, 'gone')).rejects.toThrow(/withdrawn/);
  });
});
