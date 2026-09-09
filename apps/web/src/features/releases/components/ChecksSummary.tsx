import type { ReleaseReadiness } from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';

import { GATE_LABELS } from '../release-display';

/**
 * The readiness checklist, as the server computed it.
 *
 * Nothing here is worked out in the browser: `publishable` and every gate's `satisfied` and
 * `reason` arrive on the release and are printed. The unsatisfied gates are the unresolved
 * blockers, listed first so the person who has to clear them does not have to read the whole
 * checklist to find them.
 */
export function ChecksSummary({ readiness }: { readiness: ReleaseReadiness }) {
  const blockers = readiness.gates.filter((gate) => !gate.satisfied);

  return (
    <Card
      title="Readiness"
      headerAddon={
        readiness.publishable ? (
          <Badge tone="success">Ready to publish</Badge>
        ) : (
          <Badge tone="danger">
            {blockers.length === 1 ? '1 unresolved blocker' : `${blockers.length} unresolved`}
          </Badge>
        )
      }
    >
      {blockers.length > 0 ? (
        <div className="release-blockers" role="status">
          <strong>Unresolved blockers</strong>
          <ul>
            {blockers.map((gate) => (
              <li key={gate.key}>{gate.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="release-gates">
        {readiness.gates.map((gate) => (
          <li key={gate.key} className="release-gates__row">
            <span
              className={`release-gates__mark ${
                gate.satisfied ? 'release-gates__mark--satisfied' : 'release-gates__mark--blocked'
              }`}
            >
              {gate.satisfied ? '✓' : '✗'}
              <span className="sr-only">{gate.satisfied ? ' Satisfied: ' : ' Blocked: '}</span>
            </span>
            <span>{GATE_LABELS[gate.key]}</span>
            <p className="release-gates__reason">{gate.reason}</p>
          </li>
        ))}
      </ul>

      {readiness.publishable && readiness.requiresTypedConfirmation ? (
        <p className="muted">
          Publishing this project’s releases asks for the version, typed back.
        </p>
      ) : null}
    </Card>
  );
}
