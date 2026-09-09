import {
  PERMISSIONS,
  SIMILARITY_DECISION,
  SIMILARITY_DECISION_LABELS,
  type SimilarTicketSuggestion,
  type SimilarTicketsResponse,
} from '@ashniva/types';
import { Alert, Badge, Button, Card, StatusPill } from '@ashniva/ui';
import { Link } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useSimilarTicketsQuery, useSimilarityMutations } from '../api';
import { CLIENT_IDENTITY_NOTE, SIMILARITY_DECISION_TONE, similarWarning } from '../problem-display';

import '../problems.css';

/**
 * "Is this the same ticket we already have?" on a ticket's own screen.
 *
 * Everything on this panel is internal, and the note under the warning says so in the approved
 * design's own words: the person reading it can see which companies reported the same fault
 * precisely because no client ever sees this panel. The API refuses it to a client outright;
 * `problem:read` is what gates it here, so a reader who cannot see problems is not sent a request
 * that comes back 403.
 */
export function SimilarIssuesPanel({ ticketId }: { ticketId: string }) {
  const canRead = usePermission(PERMISSIONS.PROBLEM_READ);
  const query = useSimilarTicketsQuery(ticketId, canRead);

  if (!canRead || !query.data || query.data.suggestions.length === 0) {
    return null;
  }
  return <Loaded ticketId={ticketId} data={query.data} />;
}

function Loaded({ ticketId, data }: { ticketId: string; data: SimilarTicketsResponse }) {
  const canConfirm = usePermission(PERMISSIONS.PROBLEM_MANAGE);
  const decide = useSimilarityMutations(ticketId);
  const warning = similarWarning({
    clientCount: data.clientCount,
    versions: data.suggestions.map((suggestion) => suggestion.productVersion),
  });

  return (
    <Card
      title="Similar issues"
      headerAddon={
        <Badge tone={data.thresholdReached ? 'danger' : 'neutral'}>
          {data.clientCount} of {data.duplicateThreshold} clients
        </Badge>
      }
    >
      <div className="similar-panel">
        <div>
          <p className="similar-panel__warning">{warning}</p>
          <p className="similar-panel__note">{CLIENT_IDENTITY_NOTE}</p>
        </div>

        {data.problemId ? (
          <p>
            <Link to={`/problems/${data.problemId}`}>Open the problem these belong to</Link>
          </p>
        ) : null}

        <ul className="similar-panel__list">
          {data.suggestions.map((suggestion) => (
            <li key={suggestion.ticketId} className="similar-panel__row">
              <div className="problem-page__facts">
                <Link to={`/tickets/${suggestion.ticketId}`}>{suggestion.key}</Link>
                <span>{suggestion.title}</span>
                <StatusPill
                  tone={SIMILARITY_DECISION_TONE[suggestion.decision]}
                  label={SIMILARITY_DECISION_LABELS[suggestion.decision]}
                />
              </div>
              <span className="similar-panel__signals">
                {suggestion.clientOrganizationName}
                {suggestion.productVersion ? ` · ${suggestion.productVersion}` : ''}
                {suggestion.signals.length > 0 ? ` · ${suggestion.signals.join(' · ')}` : ''}
              </span>
              {suggestion.decision === SIMILARITY_DECISION.PENDING ? (
                <Actions
                  suggestion={suggestion}
                  canConfirm={canConfirm}
                  pending={decide.isPending}
                  onDecide={(decision) =>
                    decide.mutate({ candidateId: suggestion.ticketId, decision })
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>

        {decide.isError ? <Alert tone="danger">{errorMessage(decide.error)}</Alert> : null}
      </div>
    </Card>
  );
}

/**
 * Confirm and dismiss.
 *
 * Confirm is shown to everybody who can see the panel and disabled for those who may not link,
 * because the approved flow is that a support executive *asks* and somebody senior confirms — a
 * button that is simply absent teaches nobody whose job this is.
 */
function Actions({
  suggestion,
  canConfirm,
  pending,
  onDecide,
}: {
  suggestion: SimilarTicketSuggestion;
  canConfirm: boolean;
  pending: boolean;
  onDecide: (decision: 'LINKED' | 'DISMISSED') => void;
}) {
  return (
    <div className="similar-panel__actions">
      <Button
        size="sm"
        variant="primary"
        loading={pending}
        disabled={!canConfirm}
        disabledReason="Linking two clients’ tickets into one problem needs the problem:manage permission"
        onClick={() => onDecide('LINKED')}
      >
        Confirm duplicate
      </Button>
      <Button
        size="sm"
        loading={pending}
        onClick={() => onDecide('DISMISSED')}
        title={`Dismiss ${suggestion.key}; it will not be suggested again`}
      >
        Not the same
      </Button>
    </div>
  );
}
