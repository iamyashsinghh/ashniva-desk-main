import {
  CONVERSATION_EVENTS,
  CONVERSATION_KIND,
  PAIR_MEMBERSHIP_KINDS,
  type ConversationKind,
  type CreateConversationInput,
  type MessageSummary,
} from '@ashniva/types';
import { Alert, EmptyState, Skeleton } from '@ashniva/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useRealtimeSocket } from '../../../app/providers/realtime-socket-context';
import { errorMessage } from '../../../shared/lib/api-client';
import { useSession } from '../../auth/session-context';
import {
  useConversationAudienceQuery,
  useConversationMutations,
  useConversationQuery,
  useMessageRevisions,
  useMessagesQuery,
  useOpenConversation,
} from '../api';
import { useFrozenUnreadMarker } from '../unread-divider';
import { ConversationDetailsDrawer } from './ConversationDetailsDrawer';
import { ConversationHeader } from './ConversationHeader';
import { MessageComposer, type SendMessageDraft } from './MessageComposer';
import { MessageThread } from './MessageThread';

import '../communication.css';

export interface ConversationPanelProps {
  /** What this conversation is attached to. The server resolves the project from it. */
  anchor: CreateConversationInput;
  title?: string;
}

/**
 * One conversation, wherever it is attached.
 *
 * The same component serves the project channel, a task thread, a ticket's internal discussion
 * and a direct conversation, because they are the same thing with a different anchor — which is
 * also true of the tables underneath. What differs between them is decided on the server and
 * arrives as `abilities`; this component renders that answer and never computes one of its own.
 *
 * It opens the conversation on mount, which creates it the first time. That is a deliberate
 * side effect of somebody opening the tab, and it is idempotent.
 */
export function ConversationPanel({ anchor, title }: ConversationPanelProps) {
  const open = useOpenConversation();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const opened = useRef(false);

  // The anchor is a stable description of what this panel is for, so the effect runs once per
  // mount rather than on every render that rebuilds the object literal.
  const key = JSON.stringify(anchor);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    open
      .mutateAsync(anchor)
      .then((conversation) => setConversationId(conversation.id))
      .catch((cause) => setError(errorMessage(cause)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the anchor's identity.
  }, [key]);

  if (error) {
    return (
      <section className="chat-room chat-room--embedded">
        <p className="muted">{error}</p>
      </section>
    );
  }
  if (!conversationId) {
    return (
      <section className="chat-room chat-room--embedded" aria-busy="true">
        <Skeleton height="var(--control-height-lg)" />
        <Skeleton height="8rem" />
      </section>
    );
  }
  return (
    <ConversationView conversationId={conversationId} title={title} kind={anchor.kind} embedded />
  );
}

/**
 * A conversation that already exists: header, thread, composer.
 *
 * Split out from `ConversationPanel` so the messages screen can open one by id without opening it
 * by anchor — the anchor is how a thread is *created*, and a list of existing threads has no
 * business creating anything.
 *
 * `embedded` is presentation only. On the messages screen the room fills the column and the
 * composer is pinned to the bottom of the viewport; beside a task or a ticket it is a bounded box
 * on a page that scrolls past it.
 */
export function ConversationView({
  conversationId,
  title,
  kind,
  embedded = false,
  compact = false,
  onLeave,
  onMinimize,
  onClose,
}: {
  conversationId: string;
  title?: string;
  kind: ConversationKind;
  embedded?: boolean;
  /** Corner messenger: shorter header, minimize/close instead of in-thread search. */
  compact?: boolean;
  /** Called once somebody has taken themselves out of a group, so the screen can close it. */
  onLeave?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  const { user } = useSession();
  const socket = useRealtimeSocket();
  const conversation = useConversationQuery(conversationId);
  const messages = useMessagesQuery(conversationId);
  const audience = useConversationAudienceQuery(conversationId);
  const mutations = useConversationMutations(conversationId);
  const revisions = useMessageRevisions(conversationId);

  const [error, setError] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageSummary | null>(null);

  const viewerId = user?.id ?? '';
  const abilities = conversation.data?.abilities;
  const detailKind = conversation.data?.kind ?? kind;
  const isGroup = detailKind === CONVERSATION_KIND.GROUP;

  /**
   * The thread, oldest first.
   *
   * The pages come back newest-page-first — a cursor walks backwards into history — and each page
   * is oldest-first inside itself, so the pages are reversed and their contents are not.
   */
  const items = useMemo(
    () => [...(messages.data?.pages ?? [])].reverse().flatMap((page) => page.items),
    [messages.data],
  );
  const newestId = items.at(-1)?.id;
  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle.length === 0
        ? items
        : items.filter((message) => message.body.toLowerCase().includes(needle)),
    [items, needle],
  );
  const firstUnreadId = useFrozenUnreadMarker(conversationId, items, viewerId, conversation.data);

  /**
   * Say that this conversation is open, and stop saying it on the way out.
   *
   * A subscription is a statement of interest and never a grant: the server delivers to per-user
   * rooms it recomputes from live project membership at send time, so a socket that stays joined
   * after its owner leaves a project receives nothing.
   */
  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    socket.emit(CONVERSATION_EVENTS.SUBSCRIBE, { conversationId });
    return () => {
      socket.emit(CONVERSATION_EVENTS.UNSUBSCRIBE, { conversationId });
    };
  }, [socket, conversationId]);

  // Reading it is what marks it read. Doing this on the server when the messages are fetched
  // would mark a thread read that somebody merely had open in a background tab.
  useEffect(() => {
    if (items.length > 0) {
      mutations.markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the newest message moves.
  }, [newestId]);

  async function send(draft: SendMessageDraft) {
    setError(undefined);
    await mutations.send.mutateAsync({
      body: draft.body,
      ...(draft.attachmentIds.length > 0 ? { attachmentIds: draft.attachmentIds } : {}),
      clientMessageId: draft.clientMessageId,
    });
  }

  return (
    <section
      className={`chat-room${embedded ? ' chat-room--embedded' : ''}${compact ? ' chat-room--dock' : ''}`}
    >
      {conversation.data ? (
        <ConversationHeader
          conversation={{ ...conversation.data, ...(title ? { title } : {}) }}
          search={search}
          onSearchChange={setSearch}
          matchCount={visible.length}
          onOpenDetails={() => setShowDetails(true)}
          compact={compact}
          {...(onMinimize ? { onMinimize } : {})}
          {...(onClose ? { onClose } : {})}
        />
      ) : (
        <Skeleton height="var(--control-height-lg)" />
      )}

      {abilities?.viaOversight ? (
        <p className="chat-oversight" role="status">
          You are reading this as an administrator. This access has been recorded.
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {items.length === 0 ? (
        <div className="chat-room__body chat-room__body--empty">
          <EmptyState
            title="No messages yet"
            description={
              isGroup
                ? 'Everybody in this group can read what is written here.'
                : 'Everyone on this project can read what is written here.'
            }
          />
        </div>
      ) : (
        <MessageThread
          messages={visible}
          viewerId={viewerId}
          audience={audience.data ?? []}
          showSenderNames={!PAIR_MEMBERSHIP_KINDS.includes(detailKind)}
          firstUnreadId={firstUnreadId}
          highlight={needle}
          hasEarlier={messages.hasNextPage}
          isLoadingEarlier={messages.isFetchingNextPage}
          onLoadEarlier={() => void messages.fetchNextPage()}
          onEdit={(input) => mutations.edit.mutateAsync(input).then(() => undefined)}
          {...(abilities?.canPost ? { onReply: setReplyingTo } : {})}
          {...(abilities?.viaOversight
            ? { onLoadRevisions: (id: string) => revisions.mutateAsync(id) }
            : {})}
        />
      )}

      <MessageComposer
        conversationId={conversationId}
        canPost={abilities?.canPost ?? false}
        reason={abilities?.reason ?? null}
        compact={compact}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={send}
      />

      {conversation.data ? (
        <ConversationDetailsDrawer
          open={showDetails}
          conversation={conversation.data}
          onClose={() => setShowDetails(false)}
          {...(onLeave ? { onLeft: onLeave } : {})}
        />
      ) : null}
    </section>
  );
}
