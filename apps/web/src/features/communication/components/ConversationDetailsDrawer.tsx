import {
  CONVERSATION_KIND,
  CONVERSATION_MEMBERSHIP,
  membershipOf,
  type ConversationDetail,
} from '@ashniva/types';
import { Avatar, Drawer } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';
import { GroupPanel } from './GroupPanel';

export interface ConversationDetailsDrawerProps {
  open: boolean;
  conversation: ConversationDetail;
  onClose: () => void;
  onLeft?: () => void;
}

/**
 * Who is in this conversation, in a panel rather than wedged above the thread.
 *
 * What it shows depends on how the conversation decides its membership, because the three answers
 * are genuinely different things and pretending otherwise misleads:
 *
 *  * a **group** lists its members, and its administrators get the controls — that is `GroupPanel`,
 *    unchanged, just no longer collapsed inside the thread;
 *  * a **pair** has one other person and nothing to administer;
 *  * a **derived** thread has no member list at all. The rows the API returns for it are read
 *    cursors, not a roster, so listing them as "members" would name whoever happened to open the
 *    thread and omit everybody on the project who has not.
 */
export function ConversationDetailsDrawer({
  open,
  conversation,
  onClose,
  onLeft,
}: ConversationDetailsDrawerProps) {
  const membership = membershipOf(conversation.kind);
  return (
    <Drawer open={open} title="Conversation details" size="sm" onClose={onClose}>
      {conversation.kind === CONVERSATION_KIND.GROUP ? (
        <GroupPanel conversation={conversation} expanded {...(onLeft ? { onLeft } : {})} />
      ) : null}

      {membership === CONVERSATION_MEMBERSHIP.PAIR ? (
        <ul className="chat-list">
          <li className="chat-list__person">
            <Avatar name={conversation.counterpart?.name ?? 'Somebody'} size="sm" />
            <span>
              <strong>{conversation.counterpart?.name ?? 'Somebody'}</strong>
              <span className="timeline__note"> · {conversation.counterpart?.email}</span>
            </span>
          </li>
        </ul>
      ) : null}

      {membership === CONVERSATION_MEMBERSHIP.DERIVED ? (
        <p className="muted">
          Everybody the project admits can read this thread. There is no list to add somebody to —
          membership follows the project, and the server re-checks it on every request.
        </p>
      ) : null}

      <p className="timeline__note">Started {formatDateTime(conversation.createdAt)}</p>
    </Drawer>
  );
}
