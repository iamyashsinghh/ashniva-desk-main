import {
  CONVERSATION_KIND,
  PAIR_MEMBERSHIP_KINDS,
  TAGGED_PRIVATE_KINDS,
  type ConversationDetail,
  type MessageSummary,
} from '@ashniva/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResource } from '../../shared/api/queries';
import { Screen } from '../../shared/components/primitives';
import { LoadingState } from '../../shared/components/states';
import { useSession } from '../auth/SessionProvider';
import { useChatWallpaper, WallpaperBackground } from '../chat-wallpaper';
import { useConversationAudience, useThread } from './chat-api';
import {
  ConversationDetailsSheet,
  type ConversationDestinations,
} from './ConversationDetailsSheet';
import { ConversationHeader, PlainConversationBar } from './ConversationHeader';
import { ConversationUnavailable, EmptyThread } from './ConversationStates';
import { namesOf } from './MessageBody';
import { MessageComposer } from './MessageComposer';
import { MessageThread } from './MessageThread';
import { ThreadSearchBar } from './ThreadSearchBar';
import { useFrozenUnreadMarker } from './unread-divider';
import { useKeyboardVisible, useWindowTop } from './use-keyboard';
import { useLiveConversation } from './use-live-conversation';
import { useMarkRead } from './use-mark-read';

export interface ConversationScreenProps extends ConversationDestinations {
  conversationId: string;
  /** Opens the group's own screen. Absent: a group's members open in the details sheet instead. */
  onOpenGroup?: (conversationId: string) => void;
  /** Leaves the conversation. The screen draws its own top bar, so the back arrow is its own. */
  onBack?: () => void;
  /** Opens the wallpaper picker for this conversation. */
  onOpenWallpaper?: (conversationId: string) => void;
}

/**
 * One internal conversation.
 *
 * One column: the brand-coloured top bar, the thread over the conversation's wallpaper, and the
 * composer pinned to the bottom above the home indicator. The keyboard lifts the composer rather
 * than covering it.
 *
 * **Live while the socket is up.** The thread subscribes to its conversation, arriving lines are
 * spliced in, and the poll is switched off; without a socket it polls. Reading marks read — each
 * time the newest message changes while this screen is the one in front, never from a screen left
 * open underneath another.
 *
 * What may be done here is `abilities`, and it comes from the server on every read.
 *
 * **A 404 is not an error worth shouting about.** A task conversation is visible only to somebody
 * with a real relationship to the task, and the API answers an unrelated caller with 404 rather
 * than 403 deliberately: a 403 would confirm that the task *has* a discussion.
 *
 * **Everything on screen belongs to one conversation.** Opening another from a toast while this
 * screen is in front re-uses the route with a new id rather than pushing a new one, so the view is
 * keyed by the id: the reply being written, the search, the details sheet and the frozen unread
 * divider are the old thread's, and carrying them across answered the wrong person.
 */
export function ConversationScreen(props: ConversationScreenProps) {
  return <ConversationView key={props.conversationId} {...props} />;
}

function ConversationView({
  conversationId,
  onOpenGroup,
  onBack,
  onOpenWallpaper,
  onOpenProject,
  onOpenTask,
  onOpenTicket,
}: ConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const frame = useWindowTop();
  const wallpaper = useChatWallpaper(conversationId);
  const { user } = useSession();
  const viewerId = user?.id ?? null;
  const [focused, setFocused] = useState(true);
  const [search, setSearch] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageSummary | null>(null);

  const detail = useResource<ConversationDetail>(
    ['conversations', conversationId],
    `/conversations/${conversationId}`,
  );
  const live = useLiveConversation(conversationId, focused);
  const thread = useThread(conversationId, focused && !live);
  const audience = useConversationAudience(conversationId);
  const conversation = detail.data ?? null;
  const marker = useFrozenUnreadMarker(thread.messages, viewerId, conversation);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useMarkRead(conversationId, thread.messages.at(-1)?.id ?? null, focused);

  const needle = (search ?? '').trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? thread.messages.filter((message) => message.body.toLowerCase().includes(needle))
        : thread.messages,
    [thread.messages, needle],
  );
  const names = useMemo(
    () => namesOf([...audience, ...(conversation?.participants ?? [])]),
    [audience, conversation],
  );

  if (!conversation) {
    return (
      <Screen>
        <PlainConversationBar onBack={onBack} />
        {detail.error ? (
          <ConversationUnavailable error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <LoadingState label="Loading the conversation" />
        )}
      </Screen>
    );
  }

  const isGroup = conversation.kind === CONVERSATION_KIND.GROUP;
  const openDetails =
    isGroup && onOpenGroup ? () => onOpenGroup(conversationId) : () => setShowDetails(true);
  const canPost = conversation.abilities.canPost;

  return (
    <View onLayout={frame.onLayout} style={{ flex: 1 }}>
      <Screen>
        {/* No stack header above this screen, so the measured top is where the screen begins and
            the offset follows whatever the navigator puts above it. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={frame.top}
          style={{ flex: 1 }}
        >
          <ConversationHeader
            conversation={conversation}
            viewerId={viewerId}
            onBack={onBack}
            onOpenDetails={openDetails}
            onSearch={() => setSearch((current) => current ?? '')}
            onOpenWallpaper={onOpenWallpaper ? () => onOpenWallpaper(conversationId) : undefined}
          />
          {search !== null ? (
            <ThreadSearchBar
              value={search}
              onChange={setSearch}
              matches={visible.length}
              onClose={() => setSearch(null)}
            />
          ) : null}

          <WallpaperBackground wallpaper={wallpaper}>
            {thread.isLoading ? <LoadingState label="Loading messages" /> : null}
            {!thread.isLoading && visible.length === 0 ? (
              <EmptyThread
                kind={conversation.kind}
                error={thread.error}
                searching={needle.length > 0 && thread.messages.length > 0}
              />
            ) : null}
            {visible.length > 0 ? (
              <MessageThread
                messages={visible}
                viewerId={viewerId}
                participants={conversation.participants}
                audience={audience}
                // A pair has exactly one other person, named in the top bar; anywhere else the
                // name over a bubble is the only thing that says who wrote it.
                showSenderNames={!PAIR_MEMBERSHIP_KINDS.includes(conversation.kind)}
                unreadCount={marker.count}
                firstUnreadId={marker.messageId}
                highlight={needle}
                hasEarlier={thread.hasEarlier}
                isLoadingEarlier={thread.isLoadingEarlier}
                onLoadEarlier={thread.loadEarlier}
                {...(canPost ? { onReply: setReplyingTo } : {})}
                canSeeRevisions={conversation.abilities.viaOversight}
              />
            ) : null}

            <MessageComposer
              conversationId={conversationId}
              canPost={canPost}
              reason={conversation.abilities.reason}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              tagsArePrivate={TAGGED_PRIVATE_KINDS.includes(conversation.kind)}
              names={names}
              viewerId={viewerId}
              // The keyboard covers the home indicator, so its inset would only be a gap between
              // the composer and the keyboard while the keyboard is up.
              bottomInset={keyboardUp ? 0 : insets.bottom}
            />
          </WallpaperBackground>
        </KeyboardAvoidingView>

        {showDetails ? (
          <ConversationDetailsSheet
            conversation={conversation}
            onClose={() => setShowDetails(false)}
            destinations={{ onOpenProject, onOpenTask, onOpenTicket }}
          />
        ) : null}
      </Screen>
    </View>
  );
}
