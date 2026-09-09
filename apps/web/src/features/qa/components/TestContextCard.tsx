import type { TestingAssignmentDetail } from '@ashniva/types';
import { Badge, Card, DescriptionList } from '@ashniva/ui';
import { formatDateTime } from '../../../shared/lib/format';
import { ENVIRONMENT_LABELS } from '../qa-labels';
import { BuildStatus } from './BuildStatus';

/**
 * Everything the developer wrote down when they handed the work over.
 *
 * A tester should never have to go and ask what changed, so each part is shown even when it is
 * empty — an unanswered "what to test" is a fact about the handover, not a section to hide.
 */
export function TestContextCard({ assignment }: { assignment: TestingAssignmentDetail }) {
  return (
    <Card title="What to test" headerAddon={<BuildStatus status={assignment.checksStatus} />}>
      <div className="qa-context">
        <Section title="What was developed" body={assignment.whatDeveloped} />
        <Section title="What to test" body={assignment.whatToTest} />
        <Section title="Acceptance criteria" body={assignment.acceptanceCriteria} />
        <Section title="Notes from the developer" body={assignment.developerNotes} />
      </div>

      <DescriptionList
        items={[
          {
            key: 'environment',
            term: 'Environment',
            description: ENVIRONMENT_LABELS[assignment.environment],
          },
          {
            key: 'where',
            term: 'Where',
            description: assignment.stagingUrl ? (
              <a href={assignment.stagingUrl} target="_blank" rel="noreferrer noopener">
                {assignment.stagingUrl}
              </a>
            ) : (
              <span className="muted">No URL given</span>
            ),
          },
          {
            key: 'browsers-devices',
            term: 'Browsers / devices',
            description:
              assignment.browserDevice.length > 0 ? (
                <span className="chip-row">
                  {assignment.browserDevice.map((item) => (
                    <Badge key={item} tone="neutral">
                      {item}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="muted">Anything you have</span>
              ),
          },
          {
            key: 'handed-over',
            term: 'Handed over',
            description: `${assignment.assignedByName} · ${formatDateTime(assignment.createdAt)}`,
          },
        ]}
      />

      {assignment.clarificationQuestion ? (
        <div className="qa-clarification">
          <p>
            <strong>You asked:</strong> {assignment.clarificationQuestion}
          </p>
          <p>
            <strong>Answer:</strong>{' '}
            {assignment.clarificationAnswer ?? (
              <span className="muted">Still waiting on the developer.</span>
            )}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  return (
    <div className="qa-context__section">
      <h3 className="qa-context__heading">{title}</h3>
      <p className="prose">
        {body?.trim() || <span className="muted">Nothing written down.</span>}
      </p>
    </div>
  );
}
