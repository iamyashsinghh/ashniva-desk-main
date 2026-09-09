import {
  CONVERSATION_KIND,
  CONVERSATION_KIND_LABELS,
  PAIR_MEMBERSHIP_KINDS,
  type ConversationDetail,
} from '@ashniva/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { Avatar } from './Avatar';
import { useThread } from './chat-api';
import { conversationLabel } from './conversation-filters';
import { ConversationCalls } from './ConversationCalls';
import { MessageComposer } from './MessageComposer';
import { MessageThread } from './MessageThread';

/**
 * One internal conversation.
 *
 * One column: a title bar, the thread filling everything between, and the composer pinned to the
 * bottom above the home indicator. The keyboard lifts the composer rather than covering it, and
 * the thread is a list of its own rather than a page that scrolls as a whole — a composer that
 * scrolls away with the messages is a composer somebody has to hunt for.
 *
 * What may be done here is `abilities`, and it comes from the server on every read. A thread
 * somebody has left the project of still loads — they were a participant — and the composer is
 * replaced by the API's own reason rather than a silence.
 *
 * **A 404 is not an error worth shouting about.** A task conversation is visible only to somebody
 * with a real relationship to the task, and the API answers an unrelated caller with 404 rather
 * than 403 deliberately: a 403 would confirm that the task *has* a discussion. So a 404 is drawn
 * as "not here", plainly, and without a retry button that would only ask again.
 */
export function ConversationScreen({
  conversationId,
  onOpenGroup,
}: {
  conversationId: string;
  /** Opens the group's own screen. Absent where the caller has nowhere to send somebody. */
  onOpenGroup?: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [focused, setFocused] = useState(true);

  const detail = useResource<ConversationDetail>(
    ['conversations', conversationId],
    `/conversations/${conversationId}`,
  );
  const thread = useThread(conversationId, focused);
  const conversation = detail.data ?? null;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  /**
   * How many were unread when the thread was opened.
   *
   * Frozen on the first load and kept for the life of the screen, because the read cursor is
   * moved a moment later: without freezing it, the divider would appear and then vanish on the
   * next read of the conversation, which is the one thing a "you were here" line must not do. It
   * must not move while somebody reads either — a divider that walks down the screen as messages
   * arrive is worse than no divider.
   *
   * Adjusted during render rather than in an effect, which is the React documentation's pattern
   * for state derived from something that has just arrived: the divider is then drawn on the same
   * pass as the first messages instead of one frame later.
   */
  const [openedWithUnread, setOpenedWithUnread] = useState<number | null>(null);
  if (openedWithUnread === null && conversation) {
    setOpenedWithUnread(conversation.unreadCount);
  }

  // The read cursor moves once the thread has actually been shown, not when the screen mounted:
  // a request that failed to load anything has not been read.
  const messageCount = thread.messages.length;
  useEffect(() => {
    if (messageCount === 0) {
      return;
    }
    // A failure is swallowed. An unread badge that is one refresh out of date is not worth an
    // error dialog over something the person did not ask for.
    void apiRequest(`/conversations/${conversationId}/read`, { method: 'POST' }).catch(
      () => undefined,
    );
  }, [conversationId, messageCount]);

  if (!conversation && detail.error) {
    return <ConversationUnavailable error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  if (!conversation) {
    return (
      <Screen>
        <LoadingState label="Loading the conversation" />
      </Screen>
    );
  }

  const isGroup = conversation.kind === CONVERSATION_KIND.GROUP;
  // A pair has exactly one other person, named at the top of the screen; anywhere else the name
  // over a bubble is the only thing that says who wrote it.
  const showSenderNames = !PAIR_MEMBERSHIP_KINDS.includes(conversation.kind);

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // The stack header already occupies the top inset; without this the keyboard lifts the
        // composer by that much too far and leaves a gap above it.
        keyboardVerticalOffset={insets.top + TOUCH_TARGET}
        style={{ flex: 1 }}
      >
        <ConversationHeader
          conversation={conversation}
          onOpenGroup={isGroup && onOpenGroup ? () => onOpenGroup(conversationId) : undefined}
        />

        {thread.isLoading ? <LoadingState label="Loading messages" /> : null}
        {!thread.isLoading && thread.messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl }}>
            <AppText tone="muted">
              {thread.error
                ? errorMessage(thread.error)
                : 'Nothing said yet. The first message is yours.'}
            </AppText>
          </View>
        ) : null}
        {thread.messages.length > 0 ? (
          <View style={{ flex: 1 }}>
            <MessageThread
              messages={thread.messages}
              viewerId={user?.id ?? null}
              participants={conversation.participants}
              showSenderNames={showSenderNames}
              unreadCount={openedWithUnread ?? 0}
              hasEarlier={thread.hasEarlier}
              isLoadingEarlier={thread.isLoadingEarlier}
              onLoadEarlier={thread.loadEarlier}
              bottomSlot={<ConversationCalls conversation={conversation} />}
            />
          </View>
        ) : null}

        <View style={{ paddingBottom: insets.bottom }}>
          <MessageComposer
            conversationId={conversationId}
            canPost={conversation.abilities.canPost}
            reason={conversation.abilities.reason}
            onSent={thread.refresh}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The title bar: who or what this is, and the one place a group's own screen is reached from. */
function ConversationHeader({
  conversation,
  onOpenGroup,
}: {
  conversation: ConversationDetail;
  onOpenGroup?: () => void;
}) {
  const theme = useTheme();
  const name = conversationLabel(conversation);

  const content = (
    <View
      style={{
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Avatar name={name} size={36} />
      <View style={{ flex: 1 }}>
        <AppText weight="bold" numberOfLines={1}>
          {name}
        </AppText>
        <AppText size="xs" tone="faint" numberOfLines={1}>
          {conversation.project ? `${conversation.project.code} · ` : ''}
          {CONVERSATION_KIND_LABELS[conversation.kind]}
          {onOpenGroup ? ` · ${conversation.participants.length} people` : ''}
        </AppText>
        {conversation.abilities.viaOversight ? (
          <AppText size="xs" tone="danger">
            You are reading this on oversight. Every view is recorded in the audit log.
          </AppText>
        ) : null}
      </View>
    </View>
  );

  if (!onOpenGroup) {
    return content;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, group and members`}
      accessibilityHint="Who is in this group, and what it is called"
      onPress={onOpenGroup}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/**
 * The conversation did not load.
 *
 * A 404 gets its own words and no retry. It is the API's deliberate answer to somebody with no
 * relationship to the task or the thread — chosen over a 403 so that a refusal does not confirm a
 * discussion exists — and "try again" would only ask the same question twice.
 */
function ConversationUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notThere = error instanceof Error && (error as { status?: number }).status === 404;
  if (notThere) {
    return (
      <Screen>
        <ErrorState message="This conversation is not available to you." />
      </Screen>
    );
  }
  return (
    <Screen>
      <ErrorState
        message={errorMessage(error)}
        offline={error instanceof Error && error.name === 'NetworkError'}
        onRetry={onRetry}
      />
    </Screen>
  );
}
