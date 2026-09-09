import type {
  AddConversationMemberInput,
  ConversationDetail,
  ConversationParticipant,
  CreateGroupInput,
  MessagingScopeContact,
  UpdateConversationInput,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';
import { conversationKeys } from './api';

/**
 * Conversations that have no project: the scope directory, direct messages, and groups.
 *
 * A second file beside `api.ts` for the reason the API split its own controller in two — these
 * requests name *people* rather than a project, and their permission comes from a management
 * relationship rather than from membership of one. Keeping them apart also keeps each file the
 * size somebody will actually read.
 */

/**
 * Who this person may reach outside a project, and why.
 *
 * Not `GET /users/directory`, which lists the whole organization so work can be assigned. This is
 * the messaging question, answered by the same resolution the create and add-member endpoints
 * enforce — so every name it returns is one those endpoints will accept, and a name it withholds
 * is one they would refuse. The search runs on the server rather than over a cached list, because
 * filtering locally would mean holding a roster the person is not entitled to.
 */
export function useMessagingDirectoryQuery(search: string, enabled = true) {
  const query = search.trim();
  return useQuery({
    queryKey: conversationKeys.directory(query),
    queryFn: () =>
      apiRequest<MessagingScopeContact[]>('/conversations/directory', {
        query: query ? { q: query } : {},
      }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** Who is in a conversation, and who has left it. */
export function useConversationMembersQuery(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: conversationKeys.members(conversationId ?? ''),
    queryFn: () =>
      apiRequest<ConversationParticipant[]>(`/conversations/${conversationId}/members`),
    enabled: enabled && Boolean(conversationId),
  });
}

/**
 * Starting a scope conversation: a direct message, or a group.
 *
 * Both are mutations for the reason `useOpenConversation` gives — the first call creates the
 * thread — and both invalidate the whole `conversations` tree, because a new thread changes the
 * list, the directory's "already open with" column and nothing else.
 */
export function useScopeConversationMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: conversationKeys.all });

  return {
    openDirect: useMutation({
      mutationFn: (userId: string) =>
        apiRequest<ConversationDetail>('/conversations/direct', {
          method: 'POST',
          body: { userId },
        }),
      onSuccess: refresh,
    }),
    createGroup: useMutation({
      mutationFn: (input: CreateGroupInput) =>
        apiRequest<ConversationDetail>('/conversations/groups', { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
  };
}

/**
 * Changing a group: its name, its picture, and who is in it.
 *
 * Every one of these is refused in the API for somebody who does not administer the group, with
 * the read decision taken first so "you are not an administrator" is never an answer somebody
 * outside the group can get. The screen renders `abilities.canManage`, which is the same
 * judgement made once on the server.
 */
export function useGroupMutations(conversationId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: conversationKeys.all });

  return {
    update: useMutation({
      mutationFn: (input: UpdateConversationInput) =>
        apiRequest<ConversationDetail>(`/conversations/${conversationId}`, {
          method: 'PATCH',
          body: input,
        }),
      onSuccess: refresh,
    }),
    addMember: useMutation({
      mutationFn: (input: AddConversationMemberInput) =>
        apiRequest<ConversationParticipant[]>(`/conversations/${conversationId}/members`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (userId: string) =>
        apiRequest<ConversationParticipant[]>(
          `/conversations/${conversationId}/members/${userId}`,
          { method: 'DELETE' },
        ),
      onSuccess: refresh,
    }),
    leave: useMutation({
      mutationFn: () =>
        apiRequest<void>(`/conversations/${conversationId}/leave`, { method: 'POST' }),
      onSuccess: refresh,
    }),
  };
}
