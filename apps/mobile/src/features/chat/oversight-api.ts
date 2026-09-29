import type { ConversationCallSummary, ConversationSummary } from '@ashniva/types';

import { useResource } from '../../shared/api/queries';

/**
 * Oversight: conversations and calls somebody with `conversation:inspect` is not part of.
 *
 * Every one of these requests writes an audit row on the server, so both are off until the
 * administrator view is actually opened, and the keys sit outside the `conversations` tree — the
 * realtime provider invalidates that whole tree on every chat event, and each refetch here would
 * be another inspection on the record that nobody asked for.
 */
export const OVERSIGHT_KEYS = {
  conversations: ['conversation-oversight', 'conversations'] as const,
  calls: ['conversation-oversight', 'calls'] as const,
};

export function useOversightConversations(enabled: boolean) {
  return useResource<ConversationSummary[]>(
    OVERSIGHT_KEYS.conversations,
    '/communication/oversight/conversations',
    { enabled },
  );
}

export function useOversightCalls(enabled: boolean) {
  return useResource<ConversationCallSummary[]>(
    OVERSIGHT_KEYS.calls,
    '/communication/oversight/calls',
    { enabled },
  );
}
