import { VISIBILITY, type CommentSummary } from '@ashniva/types';
import { Alert, Button, Card, EmptyState, SegmentedControl, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { CommentRow } from '../../tasks/components/TaskComments';
import { useChangeRequestMutations } from '../api';

type Mode = 'public' | 'internal';

interface ChangeRequestThreadProps {
  changeRequestId: string;
  comments: CommentSummary[];
  /** Staff may switch to an internal-notes mode; the portal only ever sees the public thread. */
  canInternal: boolean;
  canReply: boolean;
  replyBlockedReason?: string;
  portal?: boolean;
}

/** Public discussion between both sides plus, for staff, internal notes the client never sees. */
export function ChangeRequestThread({
  changeRequestId,
  comments,
  canInternal,
  canReply,
  replyBlockedReason,
  portal = false,
}: ChangeRequestThreadProps) {
  const [mode, setMode] = useState<Mode>('public');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();
  const { comment } = useChangeRequestMutations(changeRequestId, portal);
  const isInternal = mode === 'internal';
  const publicComments = comments.filter((entry) => entry.visibility === VISIBILITY.CLIENT);
  const internalComments = comments.filter((entry) => entry.visibility === VISIBILITY.INTERNAL);
  const messages = isInternal ? internalComments : publicComments;

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
      title={isInternal ? 'Internal notes' : 'Discussion'}
      headerAddon={
        canInternal ? (
          <SegmentedControl
            aria-label="Thread"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { key: 'public', label: 'Shared', count: publicComments.length },
              { key: 'internal', label: 'Internal', count: internalComments.length },
            ]}
          />
        ) : undefined
      }
    >
      <div className="comment-list">
        {messages.length === 0 ? (
          <EmptyState title={isInternal ? 'No internal notes' : 'No messages yet'} />
        ) : (
          messages.map((entry) => <CommentRow key={entry.id} comment={entry} />)
        )}
      </div>
      <div className="composer" style={{ marginTop: 12 }}>
        <Textarea
          rows={3}
          aria-label={isInternal ? 'Internal note' : 'Message'}
          placeholder={
            isInternal ? 'Note for the team (never shown to the client)…' : 'Write a message…'
          }
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="composer__row">
          <span className="actions-card__hint">
            {isInternal
              ? 'Internal — the client will not see this.'
              : 'Shared — both sides will see this.'}
          </span>
          <Button
            variant={isInternal ? 'secondary' : 'primary'}
            size="sm"
            loading={comment.isPending}
            disabled={!canReply || body.trim().length === 0}
            disabledReason={canReply ? 'Type a message first' : replyBlockedReason}
            onClick={() => void send()}
          >
            {isInternal ? 'Add internal note' : 'Send'}
          </Button>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Card>
  );
}
