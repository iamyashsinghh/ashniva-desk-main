import { VISIBILITY, type TicketDetail } from '@ashniva/types';
import { Alert, Button, Card, EmptyState, SegmentedControl, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { CommentRow } from '../../tasks/components/TaskComments';
import { useTicketMutations } from '../api';

type Mode = 'public' | 'internal';

interface TicketThreadProps {
  ticket: TicketDetail;
  canInternal: boolean;
}

/**
 * The conversation: a public thread the requester sees and, for staff, a separate internal-notes
 * mode. The composer's button says exactly where the message goes.
 */
export function TicketThread({ ticket, canInternal }: TicketThreadProps) {
  const [mode, setMode] = useState<Mode>('public');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();
  const { comment } = useTicketMutations(ticket.id);
  const isInternal = mode === 'internal';
  const messages = ticket.comments.filter((entry) =>
    isInternal ? entry.visibility === VISIBILITY.INTERNAL : entry.visibility === VISIBILITY.CLIENT,
  );
  const replyState = ticket.actions.find(
    (action) => action.action === (isInternal ? 'note-internal' : 'reply-public'),
  );

  async function send() {
    if (!body.trim()) {
      return;
    }
    setError(undefined);
    try {
      await comment.mutateAsync({
        body: body.trim(),
        visibility: isInternal ? VISIBILITY.INTERNAL : VISIBILITY.CLIENT,
      });
      setBody('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card
      title={isInternal ? 'Internal notes' : 'Conversation with the requester'}
      headerAddon={
        canInternal ? (
          <SegmentedControl
            aria-label="Thread"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              {
                key: 'public',
                label: 'Public',
                count: ticket.comments.filter((entry) => entry.visibility === VISIBILITY.CLIENT)
                  .length,
              },
              {
                key: 'internal',
                label: 'Internal',
                count: ticket.comments.filter((entry) => entry.visibility === VISIBILITY.INTERNAL)
                  .length,
              },
            ]}
          />
        ) : undefined
      }
    >
      <div className="comment-list">
        {messages.length === 0 ? (
          <EmptyState title={isInternal ? 'No internal notes' : 'No replies yet'} />
        ) : (
          messages.map((entry) => <CommentRow key={entry.id} comment={entry} />)
        )}
      </div>
      <div className="composer" style={{ marginTop: 12 }}>
        <Textarea
          rows={3}
          aria-label={isInternal ? 'Internal note' : 'Reply'}
          placeholder={
            isInternal
              ? 'Note for the team (never shown to the requester)…'
              : 'Reply to the requester…'
          }
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="composer__row">
          <span className="actions-card__hint">
            {isInternal
              ? 'Internal — the requester will not see this.'
              : 'Public — the requester will see this.'}
          </span>
          <Button
            variant={isInternal ? 'secondary' : 'primary'}
            size="sm"
            loading={comment.isPending}
            disabled={!replyState?.enabled || body.trim().length === 0}
            disabledReason={replyState?.enabled ? 'Type a message first' : replyState?.reason}
            onClick={() => void send()}
          >
            {isInternal ? 'Add internal note' : 'Send reply'}
          </Button>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Card>
  );
}
