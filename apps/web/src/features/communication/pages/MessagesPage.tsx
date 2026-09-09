import { PERMISSIONS, type ConversationSummary } from '@ashniva/types';
import { Button, EmptyState, PageHeader, Select } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useConversationsQuery, useOversightConversationsQuery } from '../api';
import { useMentionedConversationIds } from '../mention-badges';
import { CallOversightCard } from '../components/CallOversightCard';
import { ConversationListPanel } from '../components/ConversationListPanel';
import { ConversationView } from '../components/ConversationPanel';
import { NewConversation } from '../components/NewConversation';
import { OversightCalls } from '../components/OversightCalls';

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
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();

  const [projectFilter, setProjectFilter] = useState('');
  const [oversight, setOversight] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<ConversationSummary | undefined>();

  // Only for the project filter's options; the list panel fetches its own page. One extra request,
  // not one per conversation.
  const mine = useConversationsQuery({ limit: 100 });
  const mentioned = useMentionedConversationIds();
  const projects = new Map<string, string>();
  for (const row of mine.data ?? []) {
    // A scope conversation has no project, so it contributes nothing to the project filter.
    if (row.project) {
      projects.set(row.project.id, `${row.project.code} · ${row.project.name}`);
    }
  }

  function open(conversation: ConversationSummary) {
    setSelected(conversation);
    void navigate(`/messages/${conversation.id}`);
  }

  return (
    <div className="chat-page">
      <PageHeader
        title="Messages"
        subtitle="Your project threads, direct messages and groups."
        actions={
          <>
            <Button variant="primary" onClick={() => setStarting(true)}>
              New conversation
            </Button>
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

      <NewConversation
        open={starting}
        onClose={() => setStarting(false)}
        onOpened={(id) => void navigate(`/messages/${id}`)}
      />

      {oversight ? (
        <p className="chat-oversight" role="status">
          You are looking at conversations you are not part of. Every one of these views is recorded
          in the audit log.
        </p>
      ) : null}

      <div className="chat-workspace">
        <aside className="chat-workspace__aside" aria-label="Conversations">
          {oversight ? (
            <OversightList
              projectId={projectFilter || undefined}
              enabled={canInspect}
              onSelect={open}
            />
          ) : (
            <ConversationListPanel
              {...(projectFilter ? { projectId: projectFilter } : {})}
              {...(conversationId ? { selectedId: conversationId } : {})}
              mentioned={mentioned}
              header={
                projects.size > 0 ? (
                  <Select
                    options={[...projects].map(([id, label]) => ({ value: id, label }))}
                    placeholder="Every project"
                    value={projectFilter}
                    aria-label="Filter by project"
                    onChange={(event) => setProjectFilter(event.target.value)}
                  />
                ) : undefined
              }
              onSelect={open}
            />
          )}
        </aside>

        <div className="chat-workspace__main">
          <SecondColumn
            oversight={oversight}
            canInspect={canInspect}
            {...(projectFilter ? { projectId: projectFilter } : {})}
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
        <OversightCalls projectId={projectFilter || undefined} enabled />
      ) : null}
    </div>
  );
}

/**
 * What sits beside the list: the call history in the administrator view, the open thread
 * otherwise, and an invitation to start one when nothing is open.
 *
 * The kind comes from the summary the list already holds when there is one, and falls back to a
 * project thread's shape when somebody has arrived on a deep link. Nothing turns on the guess:
 * `ConversationView` reads the conversation itself and renders the server's abilities.
 */
function SecondColumn({
  oversight,
  canInspect,
  projectId,
  conversationId,
  selected,
  onLeave,
}: {
  oversight: boolean;
  canInspect: boolean;
  projectId?: string;
  conversationId?: string;
  selected?: ConversationSummary;
  onLeave: () => void;
}) {
  if (oversight) {
    return <CallOversightCard projectId={projectId} enabled={canInspect} />;
  }
  if (conversationId) {
    return (
      <ConversationView
        key={conversationId}
        conversationId={conversationId}
        kind={selected?.id === conversationId ? selected.kind : 'PROJECT'}
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
  projectId,
  enabled,
  onSelect,
}: {
  projectId?: string;
  enabled: boolean;
  onSelect: (conversation: ConversationSummary) => void;
}) {
  const list = useOversightConversationsQuery(projectId, enabled);
  return (
    <QueryState
      isLoading={list.isLoading}
      isError={list.isError}
      error={list.error}
      onRetry={() => void list.refetch()}
    >
      {(list.data ?? []).length === 0 ? (
        <EmptyState title="No conversations" description="Nothing matches this filter." />
      ) : (
        <ul className="chat-list">
          {(list.data ?? []).map((row) => (
            <li key={row.id} className="chat-list__item">
              <span>
                <button type="button" className="link-button" onClick={() => onSelect(row)}>
                  {row.title}
                </button>
                {row.project ? <span className="timeline__note"> · {row.project.code}</span> : null}
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
