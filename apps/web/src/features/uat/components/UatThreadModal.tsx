import { UAT_DECISION, type UatRequestDetail } from '@ashniva/types';
import { Alert, Badge, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useUatReply, useUatRequestQuery } from '../api';

/**
 * The conversation on one sign-off request, and the provider's reply.
 *
 * `GET /uat/:id` and `POST /uat/:id/comments` shipped with nothing calling them, so a client who
 * asked a question before approving was asking nobody: the release page showed a status and a
 * note, and the thread the portal wrote into was invisible on this side. A question nobody can
 * see is a sign-off that never comes.
 */
export function UatThreadModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const query = useUatRequestQuery(requestId);

  return (
    <Modal
      open
      title="Client sign-off"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? <Thread request={query.data} /> : null}
      </QueryState>
    </Modal>
  );
}

function Thread({ request }: { request: UatRequestDetail }) {
  const reply = useUatReply(request.id);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();

  const send = async () => {
    setError(undefined);
    try {
      await reply.mutateAsync(body.trim());
      setBody('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <p className="muted">
        {request.clientName} · asked {formatDateTime(request.createdAt)} by {request.createdByName}
      </p>
      <p className="prose">{request.summaryPlain}</p>
      {request.status !== UAT_DECISION.PENDING ? (
        <p>
          <Badge tone={request.status === UAT_DECISION.APPROVED ? 'success' : 'danger'}>
            {request.status === UAT_DECISION.APPROVED ? 'Signed off' : 'Changes requested'}
          </Badge>{' '}
          {request.note ? <span className="prose">“{request.note}”</span> : null}
        </p>
      ) : null}

      {request.comments.length === 0 ? (
        <p className="muted">Nothing has been said on this yet.</p>
      ) : (
        <ul className="release-history">
          {request.comments.map((comment) => (
            <li key={comment.id}>
              <strong>{comment.authorName}</strong>{' '}
              <Badge tone={comment.fromClient ? 'warning' : 'neutral'}>
                {comment.fromClient ? 'Client' : 'Us'}
              </Badge>
              <p className="prose">{comment.body}</p>
              <span className="muted">{formatDateTime(comment.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <FormField label="Reply" hint="The client reads this in their portal, where they asked">
        <Textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
      </FormField>
      <Button
        variant="primary"
        loading={reply.isPending}
        disabled={body.trim().length < 2}
        disabledReason="Write a reply first"
        onClick={() => void send()}
      >
        Send reply
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </>
  );
}
