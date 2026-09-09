import { DEFAULT_MENTIONABLE_LIMIT } from '@ashniva/types';
import type {
  CallRecordingAccess,
  CommunicationContact,
  CommunicationSettingsInput,
  CommunicationSettingsSummary,
  ConversationAudienceMember,
  ConversationCallSummary,
  ConversationDetail,
  ConversationKind,
  ConversationSummary,
  CreateConversationInput,
  MentionablePage,
  MessagePage,
  MessageRevisionSummary,
  MessageSummary,
} from '@ashniva/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

/** What the conversation list asks the endpoint for. Exactly the parameters it accepts. */
export interface ConversationListFilter {
  projectId?: string;
  kind?: ConversationKind;
  limit?: number;
  unreadOnly?: boolean;
}

export const conversationKeys = {
  all: ['conversations'] as const,
  // Keyed by what is actually asked for, `kind` included: a chip that narrows the window on the
  // server is a different request and must not read the previous chip's answer out of the cache.
  list: (filter: ConversationListFilter) =>
    [
      'conversations',
      'list',
      filter.projectId ?? 'all',
      filter.kind ?? 'any',
      filter.limit ?? 50,
      filter.unreadOnly ?? false,
    ] as const,
  detail: (id: string) => ['conversations', 'detail', id] as const,
  messages: (id: string) => ['conversations', 'messages', id] as const,
  calls: (id: string) => ['conversations', 'calls', id] as const,
  audience: (id: string) => ['conversations', 'audience', id] as const,
  mentionable: (id: string, query: string) => ['conversations', 'mentionable', id, query] as const,
  members: (id: string) => ['conversations', 'members', id] as const,
  contacts: ['conversations', 'contacts'] as const,
  directory: (query: string) => ['conversations', 'directory', query] as const,
  settings: ['conversations', 'settings'] as const,
  oversight: (projectId?: string) => ['conversations', 'oversight', projectId ?? 'all'] as const,
  oversightCalls: (projectId?: string) =>
    ['conversations', 'oversight', 'calls', projectId ?? 'all'] as const,
};

/**
 * The conversation list.
 *
 * `limit` is a parameter rather than a constant because the list is how somebody finds a thread,
 * and a fixed fifty silently hides the fifty-first. The endpoint takes a limit and no cursor, so
 * "show more" raises the ceiling and refetches — one request for the whole page, which is the
 * shape the server was tuned for. Fetching each conversation's detail to fill this list would
 * undo that in the client, and nothing here does it: every field a row draws is already on the
 * summary.
 *
 * `kind` and `unreadOnly` narrow that window on the server rather than after it: the endpoint
 * returns the most recent `limit` rows, so a filter applied only to the answer shows fewer threads
 * than exist for anyone with more conversations than a page holds.
 */
export function useConversationsQuery(filter: ConversationListFilter = {}) {
  const limit = filter.limit ?? 50;
  return useQuery({
    queryKey: conversationKeys.list({ ...filter, limit }),
    queryFn: () =>
      apiRequest<ConversationSummary[]>('/conversations', {
        query: {
          projectId: filter.projectId,
          kind: filter.kind,
          limit,
          ...(filter.unreadOnly ? { unreadOnly: true } : {}),
        },
      }),
    // The previous page stays on screen while a wider one is fetched, so pressing "show more"
    // does not blank the list somebody was reading.
    placeholderData: (previous) => previous,
  });
}

export function useConversationQuery(id: string | undefined) {
  return useQuery({
    queryKey: conversationKeys.detail(id ?? ''),
    queryFn: () => apiRequest<ConversationDetail>(`/conversations/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * A thread, paged backwards.
 *
 * `useInfiniteQuery` rather than `useQuery`, because the endpoint has always returned a
 * `nextCursor` and the screen used to throw it away: a conversation longer than fifty messages
 * simply began at message fifty-one with nothing to say so. Pages arrive newest-page-first and
 * each page is oldest-first inside itself, so the flattened thread is built by reversing the
 * pages and keeping each one's own order.
 */
export function useMessagesQuery(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: conversationKeys.messages(conversationId ?? ''),
    queryFn: ({ pageParam }) =>
      apiRequest<MessagePage>(`/conversations/${conversationId}/messages`, {
        query: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });
}

/** Who may be mentioned here — the server's audience, never a locally assembled directory. */
export function useConversationAudienceQuery(conversationId: string | undefined) {
  return useQuery({
    queryKey: conversationKeys.audience(conversationId ?? ''),
    queryFn: () =>
      apiRequest<ConversationAudienceMember[]>(`/conversations/${conversationId}/audience`),
    enabled: Boolean(conversationId),
  });
}

/**
 * Who may be mentioned here, searched on the server.
 *
 * Not the audience list filtered locally, and the difference matters now that the send path
 * refuses a message naming somebody outside the conversation: this endpoint and that refusal are
 * the same list, so a name the picker offers is a name the API will accept. It is also the only
 * form that scales — a project channel's audience is the project's staff, and pulling all of them
 * into the browser to filter with `includes` is the query the endpoint exists to avoid.
 *
 * `placeholderData` keeps the previous page on screen while the next term is fetched, so the
 * picker narrows rather than blinking empty between keystrokes.
 */
export function useMentionableQuery(
  conversationId: string | undefined,
  query: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: conversationKeys.mentionable(conversationId ?? '', query),
    queryFn: () =>
      apiRequest<MentionablePage>(`/conversations/${conversationId}/mentionable`, {
        query: { q: query || undefined, limit: DEFAULT_MENTIONABLE_LIMIT },
      }),
    enabled: enabled && Boolean(conversationId),
    placeholderData: (previous) => previous,
    // A roster does not change between two keystrokes, and the picker reopens on every `@`.
    staleTime: 30_000,
  });
}

/**
 * What a message said before it was edited.
 *
 * Not a query with a stable key by accident: like a recording, reading one is an audited access,
 * so it is fetched when somebody asks for it rather than on every render of the thread.
 */
export function useMessageRevisions(conversationId: string | undefined) {
  return useMutation({
    mutationFn: (messageId: string) =>
      apiRequest<MessageRevisionSummary[]>(
        `/conversations/${conversationId}/messages/${messageId}/revisions`,
      ),
  });
}

export function useConversationCallsQuery(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: conversationKeys.calls(conversationId ?? ''),
    queryFn: () => apiRequest<ConversationCallSummary[]>(`/conversations/${conversationId}/calls`),
    enabled: enabled && Boolean(conversationId),
  });
}

export function useContactsQuery(enabled = true) {
  return useQuery({
    queryKey: conversationKeys.contacts,
    queryFn: () => apiRequest<CommunicationContact[]>('/conversations/contacts'),
    enabled,
  });
}

/**
 * Opening a conversation.
 *
 * A mutation rather than a query even though it usually returns something that already exists:
 * the first call creates the thread, and pretending that is a read would mean a screen could
 * create one by being rendered.
 */
export function useOpenConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      apiRequest<ConversationDetail>('/conversations', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

export function useConversationMutations(conversationId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: conversationKeys.all });

  return {
    send: useMutation({
      mutationFn: (input: { body: string; attachmentIds?: string[]; clientMessageId?: string }) =>
        apiRequest<MessageSummary>(`/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    edit: useMutation({
      mutationFn: (input: { messageId: string; body: string }) =>
        apiRequest<MessageSummary>(`/conversations/${conversationId}/messages/${input.messageId}`, {
          method: 'PATCH',
          body: { body: input.body },
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (messageId: string) =>
        apiRequest<MessageSummary>(`/conversations/${conversationId}/messages/${messageId}`, {
          method: 'DELETE',
        }),
      onSuccess: refresh,
    }),
    markRead: useMutation({
      mutationFn: () =>
        apiRequest<void>(`/conversations/${conversationId}/read`, { method: 'POST' }),
      onSuccess: refresh,
    }),
    call: useMutation({
      mutationFn: (input: { withUserId?: string; recordingConsent?: boolean }) =>
        apiRequest<ConversationCallSummary>(`/conversations/${conversationId}/calls`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    /**
     * Asking for a playable recording.
     *
     * Not a query: fetching one is an audited access, and a cached query would replay it on every
     * remount. It happens when somebody presses play, once, deliberately.
     */
    playRecording: useMutation({
      mutationFn: (callId: string) =>
        apiRequest<CallRecordingAccess>(`/conversations/calls/${callId}/recording`),
    }),
  };
}

export function useCommunicationSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: conversationKeys.settings,
    queryFn: () => apiRequest<CommunicationSettingsSummary>('/communication/settings'),
    enabled,
  });
}

export function useCommunicationSettingsMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CommunicationSettingsInput) =>
      apiRequest<CommunicationSettingsSummary>('/communication/settings', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

/** Super-admin oversight. Every call writes an audit row on the server. */
export function useOversightConversationsQuery(projectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: conversationKeys.oversight(projectId),
    queryFn: () =>
      apiRequest<ConversationSummary[]>('/communication/oversight/conversations', {
        query: { projectId },
      }),
    enabled,
  });
}

/**
 * Internal call history across the organization.
 *
 * The route has existed since the communication package with nothing calling it, so the calls half
 * of oversight was reachable only by hand. `enabled` matters more here than usual: the request is
 * audited as an inspection, so it must not fire until somebody has actually asked to inspect.
 */
export function useOversightCallsQuery(projectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: conversationKeys.oversightCalls(projectId),
    queryFn: () =>
      apiRequest<ConversationCallSummary[]>('/communication/oversight/calls', {
        query: { projectId },
      }),
    enabled,
  });
}
