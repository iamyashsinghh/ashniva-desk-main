import {
  ROUTING_ROLE_LABELS,
  ROUTING_SKIP_REASON_LABELS,
  type RoutingTrailRow,
} from '@ashniva/types';
import { Badge } from '@ashniva/ui';

export interface RoutingTrailProps {
  rows: RoutingTrailRow[];
}

/**
 * Every candidate the router considered, in the order it considered them.
 *
 * Grouped by attempt, because a re-route is a second decision and reading the two as one list
 * makes it look as though the chain was walked twice in a single pass. The rows are never edited,
 * so an earlier attempt still shows the reasons that applied at the time — which is the whole
 * point of keeping them.
 */
export function RoutingTrail({ rows }: RoutingTrailProps) {
  if (rows.length === 0) {
    return <p className="muted">No routing decisions have been recorded for this ticket.</p>;
  }

  const attempts = [...new Set(rows.map((row) => row.attempt))].sort((a, b) => a - b);

  return (
    <div className="routing-trail">
      {attempts.map((attempt) => (
        <section key={attempt} className="routing-trail__attempt">
          <h4 className="routing-trail__heading">
            Attempt {attempt}
            <span className="muted">
              {' '}
              · policy v{rows.find((row) => row.attempt === attempt)?.policyVersion}
            </span>
          </h4>
          <ol className="routing-trail__list">
            {rows
              .filter((row) => row.attempt === attempt)
              .map((row) => (
                <li key={row.id} className="routing-trail__row">
                  <span className="routing-trail__role">{ROUTING_ROLE_LABELS[row.role]}</span>
                  <span className="routing-trail__who">
                    {row.user?.name ?? 'Nobody configured'}
                  </span>
                  {row.accepted ? (
                    <Badge tone="success">Chosen</Badge>
                  ) : (
                    <Badge tone="neutral">
                      {row.skipReason ? ROUTING_SKIP_REASON_LABELS[row.skipReason] : 'Skipped'}
                    </Badge>
                  )}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
