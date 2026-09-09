import { INCIDENT_STATUS_LABELS, PROBLEM_STATUS_LABELS, type ProblemDetail } from '@ashniva/types';
import { Badge, Card, EmptyState, PageHeader, PriorityDot, StatusPill } from '@ashniva/ui';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { useProblemQuery } from '../api';
import { ProblemActions } from '../components/ProblemActions';
import { RcaForm } from '../components/RcaForm';
import { RelatedTicketsCard } from '../components/RelatedTicketsCard';
import { ResolutionCard } from '../components/ResolutionCard';
import { incidentTone, problemTone, reportedByLabel } from '../problem-display';

import '../problems.css';

/**
 * One problem: who reported it, what is being done, the analysis, and whether it may be closed.
 *
 * Everything on this screen that decides whether the problem may be closed comes from the
 * server's `closure` block. The page prints it; it never works it out again.
 */
export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useProblemQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded problem={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ problem }: { problem: ProblemDetail }) {
  return (
    <div className="problem-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/problems">Problems</Link> / {problem.key}
          </>
        }
        title={problem.title}
        subtitle={
          <span className="problem-page__facts">
            <StatusPill
              tone={problemTone(problem.status)}
              label={PROBLEM_STATUS_LABELS[problem.status]}
            />
            <PriorityDot priority={problem.severity} showLabel />
            {problem.project ? <span>{problem.project.name}</span> : null}
            {problem.module ? <Badge tone="neutral">{problem.module}</Badge> : null}
            <span className="muted">· internal — no client sees a problem</span>
          </span>
        }
        actions={<ProblemActions problem={problem} />}
      />

      <p className="problem-banner">
        {reportedByLabel(problem.clientCount, problem.versions)}
        {problem.thresholdHitAt
          ? ` · threshold crossed ${formatDateTime(problem.thresholdHitAt)}`
          : ''}
      </p>

      <div className="problem-page__columns">
        <div className="problem-page__main">
          {problem.description ? (
            <Card title="Description">
              <p className="prose">{problem.description}</p>
            </Card>
          ) : null}
          <RelatedTicketsCard problem={problem} />
          <RcaForm problem={problem} />
        </div>

        <div className="problem-page__aside">
          <ResolutionCard problem={problem} />
          <Questions problem={problem} />
          <Incidents problem={problem} />
        </div>
      </div>
    </div>
  );
}

/** The thread with whoever owns the problem: a question, and the answer if one came. */
function Questions({ problem }: { problem: ProblemDetail }) {
  return (
    <Card title={`Questions (${problem.questions.length})`}>
      {problem.questions.length === 0 ? (
        <p className="muted">Nobody has asked anything yet.</p>
      ) : (
        <ul className="incident-timeline">
          {problem.questions.map((question) => (
            <li key={question.id} className="incident-timeline__entry">
              <strong>{question.body}</strong>
              <span className="incident-timeline__meta">
                {question.askedBy?.name ?? 'somebody'} · {formatDateTime(question.askedAt)}
              </span>
              {question.answer ? (
                <span>
                  {question.answer}
                  <span className="incident-timeline__meta">
                    {' '}
                    — {question.answeredBy?.name ?? 'somebody'}
                  </span>
                </span>
              ) : (
                <span className="muted">No answer yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Incidents this problem caused. A problem is investigated over days; an incident is now. */
function Incidents({ problem }: { problem: ProblemDetail }) {
  return (
    <Card title="Incidents">
      {problem.incidents.length === 0 ? (
        <EmptyState
          title="No incidents"
          description="An incident is opened when this fault is breaking something right now."
        />
      ) : (
        <ul className="problem-tickets">
          {problem.incidents.map((incident) => (
            <li key={incident.id} className="problem-tickets__row">
              <Link to={`/incidents/${incident.id}`}>{incident.key}</Link>
              <span>{incident.title}</span>
              <StatusPill
                tone={incidentTone(incident.status)}
                label={INCIDENT_STATUS_LABELS[incident.status]}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
