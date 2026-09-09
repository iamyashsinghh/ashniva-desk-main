import type {
  AddConversationMemberInput,
  ConversationDetail,
  ConversationParticipant,
  CreateGroupInput,
  MessagingScopeContact,
  UpdateConversationInput,
} from '@ashniva/types';

import { useApiMutation, type ApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { conversationKeys } from './chat-api';

/**
 * Conversations that have no project: the directory, direct messages, and groups.
 *
 * Beside `chat-api.ts` rather than inside it, for the reason the API split its own controller in
 * two: these requests name *people*, and their permission comes from a management relationship
 * rather than from membership of a project.
 *
 * None of it is a decision. Every name the directory returns is one the create and add-member
 * endpoints will accept, because it is the same resolution — and a name it withholds is one they
 * refuse, in the API, whatever this app sends.
 */

/** The keys the whole messaging tree hangs off, so a write can make the right things stale. */
export const SCOPE_KEYS = {
  directory: (query: string) => ['conversations', 'directory', query] as const,
  members: (conversationId: string) => ['conversations', conversationId, 'members'] as const,
  list: ['conversations'] as const,
};

/** Who this person may reach outside a project, and why. Searched on the server. */
export function useMessagingDirectory(search: string) {
  const query = search.trim();
  return useResource<MessagingScopeContact[]>(
    SCOPE_KEYS.directory(query),
    '/conversations/directory',
    query ? { query: { q: query } } : {},
  );
}

/** Who is in a conversation, and who has left it. */
export function useConversationMembers(conversationId: string) {
  return useResource<ConversationParticipant[]>(
    SCOPE_KEYS.members(conversationId),
    `/conversations/${conversationId}/members`,
  );
}

export function useOpenDirectMessage(): ApiMutation<{ userId: string }, ConversationDetail> {
  return useApiMutation<{ userId: string }, ConversationDetail>({
    path: '/conversations/direct',
    body: (variables) => variables,
    invalidate: [SCOPE_KEYS.list],
  });
}

export function useCreateGroup(): ApiMutation<CreateGroupInput, ConversationDetail> {
  return useApiMutation<CreateGroupInput, ConversationDetail>({
    path: '/conversations/groups',
    body: (variables) => variables,
    invalidate: [SCOPE_KEYS.list],
  });
}

/**
 * Changing a group.
 *
 * Four writes rather than one hook with a mode, because each makes something different stale and
 * `useApiMutation` says so where the write is defined. Every one of them is refused in the API for
 * somebody who does not administer the group; the screen renders `abilities.canManage`, which is
 * the same judgement made once on the server.
 */
export function useGroupWrites(conversationId: string) {
  const stale = conversationKeys(conversationId).concat([SCOPE_KEYS.members(conversationId)]);

  return {
    rename: useApiMutation<UpdateConversationInput, ConversationDetail>({
      path: `/conversations/${conversationId}`,
      method: 'PATCH',
      body: (variables) => variables,
      invalidate: stale,
    }),
    addMember: useApiMutation<AddConversationMemberInput, ConversationParticipant[]>({
      path: `/conversations/${conversationId}/members`,
      body: (variables) => variables,
      invalidate: stale,
    }),
    removeMember: useApiMutation<{ userId: string }, ConversationParticipant[]>({
      path: (variables) => `/conversations/${conversationId}/members/${variables.userId}`,
      method: 'DELETE',
      invalidate: stale,
    }),
    leave: useApiMutation<void, void>({
      path: `/conversations/${conversationId}/leave`,
      invalidate: stale,
    }),
  };
}
