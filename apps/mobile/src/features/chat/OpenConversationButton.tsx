import { type ConversationDetail, type CreateConversationInput } from '@ashniva/types';

import { useApiMutation } from '../../shared/api/mutations';
import { AppText, Button } from '../../shared/components/primitives';

/**
 * The way into a conversation from the thing it is about.
 *
 * `POST /conversations` is idempotent by its anchor: asking for the discussion on a task returns
 * the one that exists, or makes it. So this is a button rather than a "start a discussion" flow —
 * the person is not choosing to create anything, they are asking to talk about what is in front
 * of them, and whether a row already exists is not their problem.
 *
 * Rendered only where `canUseInternalChat` says so. The API refuses a client at the first check
 * of every route on that controller, so this is the app not offering a bolted door.
 */
export function OpenConversationButton({
  anchor,
  label,
  hint,
  onOpened,
}: {
  anchor: CreateConversationInput;
  label: string;
  hint: string;
  onOpened: (conversationId: string) => void;
}) {
  const open = useApiMutation<void, ConversationDetail>({
    path: '/conversations',
    body: () => anchor,
    onSuccess: (conversation) => onOpened(conversation.id),
  });

  return (
    <>
      <Button
        label={label}
        variant="secondary"
        loading={open.busy}
        accessibilityHint={hint}
        onPress={() => void open.run()}
      />
      {open.error ? (
        <AppText tone="danger" size="sm">
          {open.error}
        </AppText>
      ) : null}
    </>
  );
}
