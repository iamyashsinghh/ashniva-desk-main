import { PERMISSIONS, type ConversationSummary } from '@ashniva/types';
import { Button, EmptyState, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission, useCurrentUser } from '../../auth/session-context';
import { useOversightConversationsQuery } from '../api';
import { useMentionedConversationIds } from '../mention-badges';
import { CallOversightCard } from '../components/CallOversightCard';
import { ConversationListPanel } from '../components/ConversationListPanel';
import { ConversationView } from '../components/ConversationPanel';
import { NewConversation } from '../components/NewConversation';
import { OversightCalls } from '../components/OversightCalls';
import { isPeopleInboxKind, inboxAllowsPersonalChat } from '../conversation-filters';

import '../communication.css';

/**
 * The messaging screen: the list on the left, the thread on the right, both full height.
 *
 * **The open conversation is in the URL.** `/messages/:conversationId` is where the notification
 * path has always pointed a direct message and a group — `conversationLink` builds it — and it
 * makes a thread something somebody can bookmark or paste to a colleague, which is the ordinary
 * expectation of anything with a list and a detail.
 *
 * **Oversight is a separate mode, and says so.** An administrator reading conversations they are
 * not part of sees the banner and the call history beside it, and every one of those reads writes
 * an audit row on the server.
 */
export function MessagesPage() {
  const canInspect = usePermission(PERMISSIONS.CONVERSATION_INSPECT);
  const personalChat = inboxAllowsPersonalChat(useCurrentUser());
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();

  const [oversight, setOversight] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<ConversationSummary | undefined>();

  const mentioned = useMentionedConversationIds();

  function open(conversation: ConversationSummary) {
    setSelected(conversation);
    void navigate(`/messages/${conversation.id}`);
  }

  return (
    <div className="chat-page">
      <PageHeader
        title="Messages"
        subtitle={
          personalChat
            ? 'Message the people on your projects and teams. Each project has a group named after it.'
            : 'Write in your project team group. Private chats are for managers and team leads.'
        }
        actions={
          <>
            {personalChat ? (
              <Button variant="primary" onClick={() => setStarting(true)}>
                New conversation
              </Button>
            ) : null}
            {canInspect ? (
              <Button
                variant={oversight ? 'primary' : 'ghost'}
                onClick={() => setOversight(!oversight)}
              >
                {oversight ? 'Viewing as administrator' : 'Administrator view'}
              </Button>
            ) : null}
          </>
        }
      />

      {personalChat ? (
        <NewConversation
          open={starting}
          onClose={() => setStarting(false)}
          onOpened={(id) => void navigate(`/messages/${id}`)}
        />
      ) : null}

      {oversight ? (
        <p className="chat-oversight" role="status">
          You are looking at conversations you are not part of. Every one of these views is recorded
          in the audit log.
        </p>
      ) : null}

      <div className="chat-workspace">
        <aside className="chat-workspace__aside" aria-label="Conversations">
          {oversight ? (
            <OversightList enabled={canInspect} onSelect={open} />
          ) : (
            <ConversationListPanel
              {...(conversationId ? { selectedId: conversationId } : {})}
              mentioned={mentioned}
              onSelect={open}
            />
          )}
        </aside>

        <div className="chat-workspace__main">
          <SecondColumn
            oversight={oversight}
            canInspect={canInspect}
            {...(conversationId ? { conversationId } : {})}
            {...(selected ? { selected } : {})}
            onLeave={() => {
              setSelected(undefined);
              void navigate('/messages');
            }}
          />
        </div>
      </div>

      {/* The call half of oversight. Threads and calls are two halves of one answer to "what
          happened here", and only the first of them had ever been rendered. */}
      {canInspect && oversight ? (
        <OversightCalls enabled />
      ) : null}
    </div>
  );
}

/**
 * What sits beside the list: the call history in the administrator view, the open thread
 * otherwise, and an invitation to start one when nothing is open.
 *
 * The kind comes from the summary the list already holds when there is one, and falls back to a
 * direct message's shape when somebody has arrived on a deep link. Nothing turns on the guess:
 * `ConversationView` reads the conversation itself and renders the server's abilities.
 */
function SecondColumn({
  oversight,
  canInspect,
  conversationId,
  selected,
  onLeave,
}: {
  oversight: boolean;
  canInspect: boolean;
  conversationId?: string;
  selected?: ConversationSummary;
  onLeave: () => void;
}) {
  if (oversight) {
    return <CallOversightCard enabled={canInspect} />;
  }
  if (conversationId) {
    return (
      <ConversationView
        key={conversationId}
        conversationId={conversationId}
        kind={selected?.id === conversationId ? selected.kind : 'SCOPE_DIRECT'}
        onLeave={onLeave}
      />
    );
  }
  return (
    <div className="chat-room chat-room--empty">
      <EmptyState
        icon="✉"
        title="Pick a conversation"
        description="Choose one on the left, or start a direct message or a group."
      />
    </div>
  );
}

/**
 * Conversations somebody with `conversation:inspect` is not part of.
 *
 * A plainer list than the member's own: there is no unread state to show for a thread the reader
 * was never in, and offering a search over other people's conversations invites browsing rather
 * than looking something up.
 */
function OversightList({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  const list = useOversightConversationsQuery(undefined, enabled);
  const rows = (list.data ?? []).filter((row) => isPeopleInboxKind(row.kind));
  return (
    <QueryState
      isLoading={list.isLoading}
      isError={list.isError}
      error={list.error}
      onRetry={() => void list.refetch()}
    >
      {rows.length === 0 ? (
        <EmptyState title="No conversations" description="Nothing matches this filter." />
      ) : (
        <ul className="chat-list">
          {rows.map((row) => (
            <li key={row.id} className="chat-list__item">
              <span>
                <button type="button" className="link-button" onClick={() => onSelect(row)}>
                  {row.title}
                </button>
              </span>
              <span className="timeline__note">
                {row.lastMessageAt ? formatDateTime(row.lastMessageAt) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
