import type { TestResultRow } from '@ashniva/types';
import { Badge, Card, EmptyState, StatusPill } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';
import { ENVIRONMENT_LABELS, SEVERITY_LABELS, SEVERITY_TONES } from '../qa-labels';

/**
 * Every result ever recorded against this assignment, newest first.
 *
 * `test_results` is append-only on the server, so this is a history and not a current value: "it
 * failed twice before it passed" is the fact somebody reads this for.
 */
export function TestResultHistory({ results }: { results: TestResultRow[] }) {
  if (results.length === 0) {
    return (
      <Card title="Results">
        <EmptyState title="Nothing recorded yet" description="The first result will show here." />
      </Card>
    );
  }

  return (
    <Card title="Results">
      <ol className="qa-results">
        {results.map((result) => (
          <li key={result.id} className="qa-results__item">
            <div className="qa-results__head">
              <StatusPill
                tone={result.outcome === 'PASS' ? 'success' : 'danger'}
                label={result.outcome === 'PASS' ? 'Passed' : 'Failed'}
              />
              {result.severity ? (
                <Badge tone={SEVERITY_TONES[result.severity]}>
                  {SEVERITY_LABELS[result.severity]}
                </Badge>
              ) : null}
              {result.retestRequired ? <Badge tone="warning">Retest needed</Badge> : null}
              <span className="muted">
                {result.recordedByName} · {formatDateTime(result.createdAt)} ·{' '}
                {ENVIRONMENT_LABELS[result.environment]}
                {result.browserDevice ? ` · ${result.browserDevice}` : ''}
              </span>
            </div>
            <p className="prose">
              <strong>Tested:</strong> {result.whatTested}
            </p>
            <p className="prose">
              <strong>Result:</strong> {result.actualResult}
            </p>
            {result.failureDescription ? (
              <p className="prose">
                <strong>Broken:</strong> {result.failureDescription}
              </p>
            ) : null}
            {result.commentForDeveloper ? (
              <p className="prose">
                <strong>For the developer:</strong> {result.commentForDeveloper}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
