import {
  CONVERSATION_KIND_LABELS,
  type ConversationSummary,
  type MessagingScopeContact,
} from '@ashniva/types';

import { formatDateTime, formatRelative } from '../../../shared/lib/format';
import { contextLabelOf } from '../conversation-filters';
import { ConversationAvatar } from './ConversationAvatar';

export interface ConversationRowProps {
  row: ConversationSummary;
  isSelected: boolean;
  /** Whether an unread mention names this person here. Comes from their own notifications. */
  isMentioned: boolean;
  /** Corner inbox: name and preview only — the kind label eats the row in 20rem. */
  compact?: boolean;
  onSelect: () => void;
}

/**
 * One line of the conversation list.
 *
 * Everything drawn here is already on the summary the list endpoint returned — name, preview, time,
 * unread count — so a list of any length is one request. Asking `/conversations/:id` per row to
 * fill in a detail would put back exactly the N+1 the API went to the trouble of removing.
 *
 * There is no availability dot, and that is deliberate: the gateway carries no presence, so a
 * green circle here would be decoration asserting something nobody measured.
 */
export function ConversationRow({
  row,
  isSelected,
  isMentioned,
  compact = false,
  onSelect,
}: ConversationRowProps) {
  const name = row.counterpart?.name ?? row.title;
  const context = contextLabelOf(row) ?? CONVERSATION_KIND_LABELS[row.kind];
  const classes = [
    'chat-list__conversation',
    isSelected ? 'chat-list__conversation--selected' : '',
    row.unreadCount > 0 ? 'chat-list__conversation--unread' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li>
      <button type="button" className={classes} aria-current={isSelected} onClick={onSelect}>
        <ConversationAvatar name={name} imageFileId={row.imageFileId} size="md" />
        <span className="chat-list__text">
          <span className="chat-list__title">
            {name}
            {compact ? null : <span className="timeline__note"> · {context}</span>}
          </span>
          <span className="chat-list__preview">{row.lastMessagePreview ?? 'Nothing said yet'}</span>
        </span>
        <span className="chat-list__meta">
          <span className="chat-list__when" title={formatDateTime(row.lastMessageAt)}>
            {formatRelative(row.lastMessageAt)}
          </span>
          <span className="chat-list__badges">
            {isMentioned ? (
              <span className="chat-list__mention" aria-label="You were mentioned">
                <span aria-hidden="true">@</span>
              </span>
            ) : null}
            {row.unreadCount > 0 ? (
              <span className="chat-list__unread" aria-label={`${row.unreadCount} unread`}>
                {row.unreadCount > 99 ? '99+' : row.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** A colleague with no thread yet — listed so anybody can message anybody without hunting. */
export function PersonRow({
  contact,
  opening = false,
  onSelect,
}: {
  contact: MessagingScopeContact;
  opening?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="chat-list__conversation"
        disabled={opening}
        onClick={onSelect}
      >
        <ConversationAvatar name={contact.name} imageFileId={null} size="md" />
        <span className="chat-list__text">
          <span className="chat-list__title">{contact.name}</span>
          <span className="chat-list__preview">{contact.reason}</span>
        </span>
      </button>
    </li>
  );
}
