import { UAT_DECISION, type UatRequestSummary } from '@ashniva/types';
import { Alert, Button, Card, FormField, PageHeader, Textarea } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { usePortalUatMutations, usePortalUatQuery } from '../api';
import { UatStatusBadge } from './PortalUatPage';

/**
 * One change, in plain language, with a decision to make.
 *
 * Everything on this page comes from the portal endpoint, which allow-lists its fields. There is
 * deliberately nothing here that reaches for a staging URL, a test login, a pull request or
 * another client's work — not because the page chooses not to show them, but because the response
 * does not contain them.
 */
export function PortalUatDetailPage() {
  const { id } = useParams();
  const query = usePortalUatQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Body request={query.data} /> : null}
    </QueryState>
  );
}

function Body({ request }: { request: UatRequestSummary }) {
  const { decide, comment } = usePortalUatMutations(request.id);
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pending = request.status === UAT_DECISION.PENDING;

  const submit = async (decision: 'APPROVED' | 'CHANGES_REQUESTED') => {
    setError(null);
    try {
      // The note is required when asking for changes: "not yet" without a reason leaves the team
      // guessing, and the guess is usually wrong.
      await decide.mutateAsync({ decision, note: note.trim() || undefined });
      setNote('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const ask = async () => {
    setError(null);
    try {
      await comment.mutateAsync(question.trim());
      setQuestion('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={<Link to="/portal/uat">Sign-off</Link>}
        title="Please check this change"
        subtitle={<UatStatusBadge status={request.status} />}
      />

      <Card title="What changed">
        <p>{request.summaryPlain}</p>
        {request.previewUrl ? (
          <p>
            <a href={request.previewUrl} target="_blank" rel="noreferrer noopener">
              Open the preview
            </a>
          </p>
        ) : null}
      </Card>

      {request.checklist.length > 0 ? (
        <Card title="What to check">
          <ul>
            {request.checklist.map((item, index) => (
              // Positional keys: the checklist is a fixed list of strings rendered in order, and
              // two identical lines are legitimate.
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {pending ? (
        <Card title="Your decision">
          <FormField label="Anything you want to say" hint="Required if you are asking for changes">
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              loading={decide.isPending}
              onClick={() => void submit('APPROVED')}
            >
              Approve
            </Button>
            <Button
              loading={decide.isPending}
              disabled={!note.trim()}
              disabledReason="Tell us what needs changing first"
              onClick={() => void submit('CHANGES_REQUESTED')}
            >
              Request changes
            </Button>
          </div>
        </Card>
      ) : (
        <Card title="Your decision">
          <p>
            <UatStatusBadge status={request.status} />{' '}
            {request.decidedAt ? `on ${formatDateTime(request.decidedAt)}` : null}
            {request.decidedByName ? ` by ${request.decidedByName}` : null}
          </p>
          {request.note ? <p className="muted">{request.note}</p> : null}
        </Card>
      )}

      <Card title="Questions">
        <FormField label="Ask before you decide">
          <Textarea
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </FormField>
        <Button
          loading={comment.isPending}
          disabled={!question.trim()}
          disabledReason="Type a question first"
          onClick={() => void ask()}
        >
          Send
        </Button>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
