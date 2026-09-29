import type {
  ConversationAudienceMember,
  MessageRevisionSummary,
  MessageSummary,
} from '@ashniva/types';

import { PersonAvatar } from '../../../shared/components/PersonAvatar';
import { formatDateTime, formatTime } from '../../../shared/lib/format';

/** Who wrote a line and when, drawn once at the top of a run. */
export function MessageHead({
  message,
  showSender,
}: {
  message: MessageSummary;
  /** False for the viewer's own lines and in a one-to-one thread, where the side says who. */
  showSender: boolean;
}) {
  const sender = message.sender;
  return (
    <div className="chat-message__head">
      {showSender ? (
        <>
          <PersonAvatar
            name={sender?.name ?? 'Somebody'}
            userId={sender?.id}
            avatar={sender?.avatar}
            size="xs"
            className="chat-message__avatar"
          />
          <strong className="chat-message__sender">{sender?.name ?? 'Somebody'}</strong>
        </>
      ) : null}
      <span className="timeline__note">{formatTime(message.createdAt)}</span>
      {message.editedAt ? (
        <span className="timeline__note" title={formatDateTime(message.editedAt)}>
          · edited
        </span>
      ) : null}
    </div>
  );
}

/** The tagged people by name, the viewer as "you", in the order they were tagged. */
export function PrivateLabel({
  userIds,
  viewerId,
  audience,
}: {
  userIds: readonly string[];
  viewerId: string;
  audience: readonly ConversationAudienceMember[];
}) {
  const names = new Map(audience.map((person) => [person.id, person.name]));
  const label = userIds
    .map((userId) => (userId === viewerId ? 'you' : (names.get(userId) ?? 'somebody')))
    .join(', ');
  return (
    <p
      className="chat-message__private"
      title="Only the sender, the people tagged, Super Admins and Project Managers can see this"
    >
      Private · to {label}
    </p>
  );
}

export function Revisions({ revisions }: { revisions: readonly MessageRevisionSummary[] }) {
  return (
    <ul className="chat-message__revisions">
      {revisions.length === 0 ? (
        <li className="muted">No earlier version was recorded.</li>
      ) : (
        revisions.map((revision) => (
          <li key={revision.id}>
            <span className="timeline__note">{formatDateTime(revision.createdAt)} · </span>
            {revision.body}
          </li>
        ))
      )}
    </ul>
  );
}
