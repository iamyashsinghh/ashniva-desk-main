import type {
  ConversationAudienceMember,
  MessageRevisionSummary,
  MessageSummary,
} from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime, formatTime } from '../../../shared/lib/format';
import { MessageAttachments } from './MessageAttachments';
import { MessageBody } from './MessageBody';
import { MessageEditor } from './MessageEditor';

export interface MessageItemProps {
  message: MessageSummary;
  /** The viewer, so their own lines can sit on the other side of the thread. */
  viewerId: string;
  audience: readonly ConversationAudienceMember[];
  /** False in a one-to-one thread, where the side of the bubble already says who wrote it. */
  showSenderName?: boolean;
  /** What the in-thread search is looking for, lowercased. */
  highlight?: string;
  /** Whether this is the first line the reader had not seen. Draws the "new" divider above it. */
  startsUnread?: boolean;
  /**
   * Whether the line above is the same person still talking.
   *
   * Presentation only: the name and the time are dropped so a burst of three lines reads as one
   * utterance rather than as the same name printed three times. Nothing about what may be done to
   * the message changes with it.
   */
  continuesRun?: boolean;
  onEdit: (input: { messageId: string; body: string }) => Promise<void>;
  /** Addresses this person in the composer. Absent where the viewer cannot post. */
  onReply?: (message: MessageSummary) => void;
  /** Only offered to an administrator reading somebody else's conversation. */
  onLoadRevisions?: (messageId: string) => Promise<MessageRevisionSummary[]>;
}

/**
 * One line of a thread, as a bubble.
 *
 * `canEdit` and `canDelete` arrive on the message, from the server, per message — because the
 * answer differs between two lines of the same conversation: the edit window closes on one while
 * the next is still fresh, and being able to post here says nothing about whose message that is.
 * This component renders that answer and never computes one of its own; a control it draws is a
 * request the API will accept, and a control it withholds is one the API would refuse.
 *
 * **Messages are not deleted from the thread.** There is no withdraw control here; the conversation
 * keeps every line so people can read what was said.
 *
 * **There is no delivered or read tick**, and there is no data for one: the schema has no delivery
 * state at all, and another person's read cursor is deliberately not broadcast — `conversation.read`
 * goes to that person's own devices and nowhere else. A tick here would be decoration.
 */
export function MessageItem({
  message,
  viewerId,
  audience,
  showSenderName = true,
  highlight = '',
  startsUnread = false,
  continuesRun = false,
  onEdit,
  onReply,
  onLoadRevisions,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [revisions, setRevisions] = useState<MessageRevisionSummary[] | undefined>();

  async function run(work: () => Promise<unknown>) {
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (message.systemKind) {
    return (
      <li className="chat-message chat-message--system">
        <span>{message.body}</span>
        <span className="timeline__note"> · {formatDateTime(message.createdAt)}</span>
      </li>
    );
  }

  if (message.deletedAt) {
    // The row keeps its place so the conversation still reads correctly. The body and the
    // attachments never left the server.
    return (
      <li className="chat-message chat-message--deleted">
        <p className="chat-message__body muted">Message deleted</p>
      </li>
    );
  }

  const isMine = message.sender?.id === viewerId;
  const classes = [
    'chat-message',
    isMine ? 'chat-message--mine' : 'chat-message--theirs',
    continuesRun ? 'chat-message--continued' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={classes}>
      {startsUnread ? (
        <p className="chat-unread-line">
          <span>New messages</span>
        </p>
      ) : null}

      <div className="chat-message__bubble">
        {continuesRun ? null : (
          <div className="chat-message__head">
            {showSenderName && !isMine ? (
              <strong className="chat-message__sender">{message.sender?.name ?? 'Somebody'}</strong>
            ) : null}
            <span className="timeline__note">{formatTime(message.createdAt)}</span>
            {message.editedAt ? (
              <span className="timeline__note" title={formatDateTime(message.editedAt)}>
                · edited
              </span>
            ) : null}
          </div>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {editing ? (
          <MessageEditor
            initialBody={message.body}
            onCancel={() => setEditing(false)}
            onSave={(body) =>
              run(async () => {
                await onEdit({ messageId: message.id, body });
                setEditing(false);
              })
            }
          />
        ) : (
          <MessageBody body={message.body} audience={audience} highlight={highlight} />
        )}

        <MessageAttachments
          files={message.attachments}
          onError={(cause) => setError(errorMessage(cause))}
        />

        {continuesRun ? (
          // The name and the time are already above this line. The timestamp stays reachable
          // rather than lost: a thread where only some lines can be dated is worse than one
          // where none can.
          <span className="chat-message__when" title={formatDateTime(message.createdAt)}>
            {formatTime(message.createdAt)}
            {message.editedAt ? ' · edited' : ''}
          </span>
        ) : null}

        {revisions ? <Revisions revisions={revisions} /> : null}

        {editing ? null : (
          <div className="chat-message__actions">
            {onReply ? (
              <Button variant="ghost" size="sm" onClick={() => onReply(message)}>
                Reply
              </Button>
            ) : null}
            {message.canEdit ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {onLoadRevisions && message.editedAt && !revisions ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void run(async () => setRevisions(await onLoadRevisions(message.id)))
                }
              >
                Earlier versions
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}

function Revisions({ revisions }: { revisions: readonly MessageRevisionSummary[] }) {
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
