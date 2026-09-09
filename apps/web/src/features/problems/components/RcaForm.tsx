import { PERMISSIONS, type ProblemDetail } from '@ashniva/types';
import { Alert, Button, Card, FormField, Input, StatusPill, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useProblemMutations, type SubmitRcaInput } from '../api';
import { RCA_STATUS_LABELS, RCA_STATUS_TONE } from '../problem-display';

import '../problems.css';

/** The approved form's ten questions, in the order it asks them. */
const QUESTIONS: Array<{
  key: keyof Omit<SubmitRcaInput, 'draft' | 'targetDate'>;
  label: string;
  rows?: number;
}> = [
  { key: 'what', label: 'What happened?' },
  { key: 'why', label: 'Why did it happen?' },
  { key: 'affectedClientsVersions', label: 'Clients and versions affected' },
  { key: 'introducedBy', label: 'Introduced by' },
  { key: 'workaround', label: 'Workaround offered meanwhile' },
  { key: 'permanentFix', label: 'Permanent solution' },
  { key: 'prevention', label: 'Prevention' },
  { key: 'testsAdded', label: 'Tests added' },
];

/** Which of the ten the API insists on. The rest are legitimately empty on plenty of problems. */
const REQUIRED: ReadonlySet<string> = new Set([
  'what',
  'why',
  'affectedClientsVersions',
  'introducedBy',
  'permanentFix',
  'prevention',
]);

type Answers = Record<string, string>;

function initialAnswers(problem: ProblemDetail): Answers {
  const rca = problem.rca;
  return {
    what: rca?.what ?? '',
    why: rca?.why ?? '',
    affectedClientsVersions: rca?.affectedClientsVersions ?? '',
    introducedBy: rca?.introducedBy ?? '',
    workaround: rca?.workaround ?? '',
    permanentFix: rca?.permanentFix ?? '',
    prevention: rca?.prevention ?? '',
    testsAdded: rca?.testsAdded ?? '',
    targetDate: rca?.targetDate ?? '',
  };
}

/**
 * The root-cause analysis: written here, reviewed here.
 *
 * A reader without `rca:submit` sees the answers and cannot change them, which is the common case
 * — most people looking at an RCA are reading somebody else's. Approving is a different
 * permission again, because the person who wrote an analysis is not the person who accepts it.
 */
export function RcaForm({ problem }: { problem: ProblemDetail }) {
  const canSubmit = usePermission(PERMISSIONS.RCA_SUBMIT);
  const canReview = usePermission(PERMISSIONS.PROBLEM_MANAGE);
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(problem));
  const [error, setError] = useState<string | null>(null);
  const { submitRca, reviewRca } = useProblemMutations();
  const rca = problem.rca;

  const missing = QUESTIONS.filter(
    (question) => REQUIRED.has(question.key) && answers[question.key]?.trim().length === 0,
  );

  const save = async (draft: boolean) => {
    setError(null);
    try {
      await submitRca.mutateAsync({
        id: problem.id,
        input: {
          what: answers.what ?? '',
          why: answers.why ?? '',
          affectedClientsVersions: answers.affectedClientsVersions ?? '',
          introducedBy: answers.introducedBy ?? '',
          workaround: answers.workaround || undefined,
          permanentFix: answers.permanentFix ?? '',
          prevention: answers.prevention ?? '',
          testsAdded: answers.testsAdded || undefined,
          targetDate: answers.targetDate || undefined,
          draft,
        },
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const review = async (decision: 'APPROVED' | 'CHANGES_REQUESTED') => {
    if (!rca) {
      return;
    }
    setError(null);
    try {
      await reviewRca.mutateAsync({
        rcaId: rca.id,
        decision,
        note: decision === 'CHANGES_REQUESTED' ? (answers.reviewNote ?? '') : undefined,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <Card
      title="Root-cause analysis"
      headerAddon={
        rca ? (
          <StatusPill tone={RCA_STATUS_TONE[rca.status]} label={RCA_STATUS_LABELS[rca.status]} />
        ) : null
      }
    >
      <div className="rca-form">
        {rca?.reviewNote ? (
          <p className="problem-actions__blocker">Sent back: {rca.reviewNote}</p>
        ) : null}
        {rca?.submittedAt ? (
          <p className="muted">
            Submitted by {rca.submittedBy?.name ?? 'somebody'} on {formatDateTime(rca.submittedAt)}
            {rca.approvedAt
              ? ` · approved by ${rca.approvedBy?.name ?? 'somebody'} on ${formatDateTime(rca.approvedAt)}`
              : ''}
          </p>
        ) : null}

        {QUESTIONS.map((question, index) => (
          <div key={question.key} className="rca-form__question">
            <span className="rca-form__number">{index + 1}.</span>
            <FormField label={question.label} required={REQUIRED.has(question.key)}>
              <Textarea
                rows={question.rows ?? 3}
                value={answers[question.key] ?? ''}
                disabled={!canSubmit}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                }
              />
            </FormField>
          </div>
        ))}

        <div className="rca-form__question">
          <span className="rca-form__number">9. Owner</span>
          <p>{rca?.owner?.name ?? 'Not named'}</p>
        </div>

        <div className="rca-form__question">
          <span className="rca-form__number">10.</span>
          <FormField label="Target date">
            <Input
              type="date"
              value={answers.targetDate ?? ''}
              disabled={!canSubmit}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, targetDate: event.target.value }))
              }
            />
          </FormField>
        </div>

        <div className="problem-actions">
          {canSubmit ? (
            <>
              <Button loading={submitRca.isPending} onClick={() => void save(true)}>
                Save draft
              </Button>
              <Button
                variant="primary"
                loading={submitRca.isPending}
                disabled={missing.length > 0}
                disabledReason={
                  missing.length > 0
                    ? `Still to answer: ${missing.map((question) => question.label).join(', ')}`
                    : undefined
                }
                onClick={() => void save(false)}
              >
                Submit analysis
              </Button>
            </>
          ) : null}

          {canReview && rca?.status === 'SUBMITTED' ? (
            <>
              <Button
                variant="primary"
                loading={reviewRca.isPending}
                onClick={() => void review('APPROVED')}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                loading={reviewRca.isPending}
                disabled={(answers.reviewNote ?? '').trim().length < 3}
                disabledReason="Say what has to be different before sending it back"
                onClick={() => void review('CHANGES_REQUESTED')}
              >
                Request changes
              </Button>
            </>
          ) : null}
        </div>

        {canReview && rca?.status === 'SUBMITTED' ? (
          <FormField label="What has to be different (required to send it back)">
            <Textarea
              rows={2}
              value={answers.reviewNote ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, reviewNote: event.target.value }))
              }
            />
          </FormField>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Card>
  );
}
