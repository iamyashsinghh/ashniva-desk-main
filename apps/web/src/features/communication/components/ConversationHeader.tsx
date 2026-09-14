import {
  CONVERSATION_KIND,
  CONVERSATION_KIND_LABELS,
  type ConversationDetail,
} from '@ashniva/types';
import { Button, Input } from '@ashniva/ui';
import { Link } from 'react-router';

import { ConversationAvatar } from './ConversationAvatar';
import { ConversationCalls } from './ConversationCalls';

export interface ConversationHeaderProps {
  conversation: ConversationDetail;
  /** What the in-thread search is looking for. */
  search: string;
  onSearchChange: (value: string) => void;
  /** How many of the loaded messages match, so an empty search reads as empty rather than broken. */
  matchCount: number;
  onOpenDetails: () => void;
  /** Corner messenger: drop the search field and add minimize/close. */
  compact?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
}

/**
 * Who this conversation is with, what it is attached to, and the two things to do with it.
 *
 * The context is a link rather than a label: a task discussion is *about* a task, and somebody
 * reading it usually wants the task next. The same is true of a ticket and of a project channel.
 *
 * **The call affordance is the server's answer, and so is its refusal.** `abilities.canCall` is
 * made to agree with `POST /conversations/:id/calls`, and where that endpoint refuses outright —
 * a group or a scope direct message, which have no project and therefore no destination, no
 * fallback and no recording scope — `ConversationCalls` prints why instead of offering a button
 * that always answers 400.
 */
export function ConversationHeader({
  conversation,
  search,
  onSearchChange,
  matchCount,
  onOpenDetails,
  compact = false,
  onMinimize,
  onClose,
}: ConversationHeaderProps) {
  const name = conversation.counterpart?.name ?? conversation.title;
  const isGroup = conversation.kind === CONVERSATION_KIND.GROUP;
  const members = conversation.participants.filter((person) => person.leftAt === null).length;

  return (
    <header className="chat-room__header">
      <ConversationAvatar name={name} imageFileId={conversation.imageFileId} size="md" />

      <div className="chat-room__identity">
        <h2 className="chat-room__title">{name}</h2>
        <p className="chat-room__context">
          {compact ? (
            <span>{CONVERSATION_KIND_LABELS[conversation.kind]}</span>
          ) : (
            <>
              <span>{CONVERSATION_KIND_LABELS[conversation.kind]}</span>
              {conversation.project ? (
                <Link to={`/projects/${conversation.project.id}`}>
                  {conversation.project.code} · {conversation.project.name}
                </Link>
              ) : null}
              {conversation.task ? (
                <Link to={`/tasks/${conversation.task.id}`}>
                  {conversation.task.key} · {conversation.task.title}
                </Link>
              ) : null}
              {conversation.ticket ? (
                <Link to={`/tickets/${conversation.ticket.id}`}>
                  {conversation.ticket.key} · {conversation.ticket.title}
                </Link>
              ) : null}
              {isGroup ? <span>{members} members</span> : null}
            </>
          )}
        </p>
      </div>

      <div className="chat-room__tools">
        {compact ? null : (
          <>
            <div className="chat-room__search">
              <Input
                type="search"
                value={search}
                aria-label="Search this conversation"
                placeholder="Search this conversation"
                onChange={(event) => onSearchChange(event.target.value)}
              />
              {search.trim().length > 0 ? (
                <span className="timeline__note" role="status">
                  {matchCount} in view
                </span>
              ) : null}
            </div>
            <ConversationCalls
              conversationId={conversation.id}
              kind={conversation.kind}
              canCall={conversation.abilities.canCall}
              canPlayRecording={conversation.abilities.canPlayRecording}
              {...(conversation.counterpart ? { counterpartId: conversation.counterpart.id } : {})}
            />
            <Button variant="ghost" size="sm" onClick={onOpenDetails}>
              Details
            </Button>
          </>
        )}
        {onMinimize ? (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Minimize conversation"
            onClick={onMinimize}
          >
            –
          </Button>
        ) : null}
        {onClose ? (
          <Button variant="ghost" size="sm" iconOnly aria-label="Close conversation" onClick={onClose}>
            ×
          </Button>
        ) : null}
      </div>
    </header>
  );
}
