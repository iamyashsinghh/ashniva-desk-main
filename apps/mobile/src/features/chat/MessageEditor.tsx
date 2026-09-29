import { MAX_MESSAGE_LENGTH, type MessageSummary } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type MutableRefObject } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Input } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { landOwnMessage } from './chat-api';
import { bodyToDraft, draftToBody } from './mention-draft';

/**
 * Rewriting one's own line, inside the fifteen-minute window the server allows.
 *
 * **Whether it may be edited at all is `message.canEdit`, and nothing here.** The window closes on
 * one line of a thread while the next is still fresh, and being able to post in a conversation
 * says nothing about whose message this is — so the answer is per message, from the server, on
 * every read. This component renders that answer and computes none of its own; the API would
 * refuse anything it drew that the answer did not permit.
 *
 * **Emptying a message is not an edit.** Save stays inert while the trimmed body is empty and the
 * hint says why, because there is no delete for an ordinary person to fall back on — `DELETE`
 * refuses everybody without `conversation:inspect`, the sender included — so blanking a line would
 * be a withdrawal by another name. What is sent is the trimmed text, so padding is never what makes
 * a body look non-empty.
 *
 * That inert button is a courtesy, not the control. Whether an empty edit is allowed is the API's
 * rule and the API enforces it; this screen only declines to ask for something it already knows is
 * not on offer.
 *
 * Mounted only while somebody is editing, which is what keeps the mutation to one per edit rather
 * than one per bubble in a windowed list — and unmounted whenever the list decides to recycle that
 * row, which is why the words being typed are *the thread's*. This keeps its own `useState` for
 * rendering and mirrors every keystroke into `draft`, so a remount reopens on what was typed
 * rather than on what the message said before the edit began.
 *
 * Mentions are shown as `@Name` while editing and written back as ids on save; the names come
 * from the thread's roster when the editor opens, so a rename mid-edit cannot drop a mention.
 */
export function MessageEditor({
  message,
  names,
  draftRef,
  onDone,
}: {
  message: MessageSummary;
  /** Names for the mentions already in the message. */
  names: ReadonlyMap<string, string>;
  /**
   * Where the thread keeps this edit's words, so they outlive the row being unmounted.
   *
   * A ref rather than a value and a setter: the thread does not render it, and putting a keystroke
   * through the thread's state would re-render every bubble in the list.
   */
  draftRef: MutableRefObject<string | null>;
  /** Leaves the editor: after a save that landed, or on Cancel. */
  onDone: () => void;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [opened] = useState(() => bodyToDraft(message.body, names));
  const [draft, setDraft] = useState(opened.draft);

  /**
   * Picks up an edit the list interrupted.
   *
   * In an effect rather than as the initial state, because a ref must not be read while rendering
   * — and because what the thread holds is a *recovery* value wanted exactly once, when this
   * editor mounts. After that this component owns the text and mirrors every keystroke back.
   */
  useEffect(() => {
    if (draftRef.current !== null) {
      setDraft(draftRef.current);
    }
  }, [draftRef]);

  const save = useApiMutation<{ body: string }, MessageSummary>({
    path: `/conversations/${message.conversationId}/messages/${message.id}`,
    method: 'PATCH',
    body: (variables) => ({ body: variables.body }),
    onSuccess: (result) => {
      landOwnMessage(queryClient, message.conversationId, result);
      onDone();
    },
  });

  const body = draftToBody(draft.trim(), opened.names);
  const tooLong = body.length > MAX_MESSAGE_LENGTH;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.primary,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        gap: theme.spacing.sm,
        marginVertical: theme.spacing.xs,
        padding: theme.spacing.sm,
      }}
    >
      <Input
        accessibilityLabel="Edit this message"
        multiline
        autoFocus
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          draftRef.current = text;
        }}
        style={{ maxHeight: 120, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
      />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
      {tooLong ? (
        <AppText tone="danger" size="sm">
          {body.length} of {MAX_MESSAGE_LENGTH} characters. Shorten it to save.
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
        <Button label="Cancel" variant="ghost" size="sm" icon="close" onPress={onDone} />
        <Button
          label="Save"
          size="sm"
          icon="check"
          loading={save.busy}
          disabled={body.length === 0 || tooLong}
          accessibilityHint={
            body.length === 0
              ? 'A message cannot be emptied, and it cannot be withdrawn either'
              : 'Replaces what this message says. What it said before is kept.'
          }
          onPress={() => void save.run({ body })}
        />
      </View>
    </View>
  );
}
