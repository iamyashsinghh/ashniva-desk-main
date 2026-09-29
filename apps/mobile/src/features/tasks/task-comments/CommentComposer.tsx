import {
  VISIBILITY,
  type CommentSummary,
  type MentionableUser,
  type Visibility,
} from '@ashniva/types';
import { useState } from 'react';
import {
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Button, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import {
  activeMention,
  draftToBody,
  insertMention,
  mentionSearchTerm,
  type MentionDraft,
} from '../../chat/mention-draft';
import { ToggleRow } from '../ToggleRow';
import { composerVisibility } from './comment-visibility';
import { TaskMentionPicker } from './TaskMentionPicker';
import { useTaskMentionable } from './useTaskMentionable';

const MAX_COMMENT_LENGTH = 5000;

/**
 * Writing a comment: the text, `@` to mention, and who it is for.
 *
 * The field shows a picked person as `@Name`; the comment is posted with `@[<uuid>]` — the grammar
 * `splitMentions` in `@ashniva/types` reads and the API authorizes against. Only picked names are
 * converted, because a typed name is not an identity.
 */
export function CommentComposer({
  taskId,
  canInternal,
  hasClient,
  onPosted,
}: {
  taskId: string;
  canInternal: boolean;
  hasClient: boolean;
  onPosted: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(true);
  const [mentionNames, setMentionNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [clientVisible, setClientVisible] = useState(false);
  const { visibility, canToggle } = composerVisibility({ canInternal, hasClient, clientVisible });

  const mention = mentionOpen ? activeMention(draft, caret) : null;
  const audience = useTaskMentionable(taskId, mentionSearchTerm(mention), mention !== null);

  const post = useApiMutation<{ body: string; visibility: Visibility }, CommentSummary>({
    path: `/tasks/${taskId}/comments`,
    body: (variables) => variables,
    invalidate: [['tasks', taskId]],
    onSuccess: () => {
      setDraft('');
      setCaret(0);
      setMentionNames(new Map());
      onPosted();
    },
  });

  const choose = (person: MentionableUser, at: MentionDraft) => {
    const next = insertMention(draft, at, person.name);
    setMentionNames((current) => new Map(current).set(person.userId, person.name));
    setDraft(next.text);
    setCaret(next.caret);
    setMentionOpen(false);
  };

  const body = draftToBody(draft.trim(), mentionNames);
  // A client writes for the client side and nothing else, so for them it is just a comment.
  const isClient = canInternal && visibility === VISIBILITY.CLIENT;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {mention ? (
        <TaskMentionPicker
          people={audience.items}
          isLoading={audience.isLoading}
          onPick={(person) => choose(person, mention)}
          onDismiss={() => setMentionOpen(false)}
        />
      ) : null}
      <Input
        accessibilityLabel="New comment"
        multiline
        numberOfLines={3}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={composerPlaceholder(canInternal, isClient)}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          // The caret follows the typing; `onSelectionChange` corrects it for a mid-text edit.
          setCaret(text.length);
          setMentionOpen(true);
          post.reset();
        }}
        onSelectionChange={(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
          setCaret(event.nativeEvent.selection.end)
        }
        style={{ minHeight: 88 }}
      />
      {canToggle ? (
        <ToggleRow
          label="Client-visible"
          description={isClient ? 'The client will read this' : 'Only your team sees this'}
          value={clientVisible}
          onChange={setClientVisible}
        />
      ) : null}
      {post.error ? (
        <Banner tone="danger" role="alert">
          {post.error}
        </Banner>
      ) : null}
      <Button
        label={submitLabel(canInternal, isClient)}
        icon={isClient ? 'paper-plane-outline' : 'chatbox-ellipses-outline'}
        variant={isClient || !canInternal ? 'primary' : 'secondary'}
        loading={post.busy}
        disabled={body.length === 0}
        onPress={() => void post.run({ body, visibility })}
      />
    </View>
  );
}

function composerPlaceholder(canInternal: boolean, isClient: boolean): string {
  if (!canInternal) {
    return 'Write a comment… Type @ to mention someone';
  }
  return isClient
    ? 'Write to the client… Type @ to mention someone'
    : 'Internal note… Type @ to mention someone';
}

function submitLabel(canInternal: boolean, isClient: boolean): string {
  if (!canInternal) {
    return 'Post comment';
  }
  return isClient ? 'Send to client' : 'Add note';
}
