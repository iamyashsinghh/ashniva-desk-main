import { TESTING_ASSIGNMENT_KIND, TEST_ENVIRONMENT, type TestEnvironment } from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useQaMutations, type CreateAssignmentInput } from '../api';
import { ENVIRONMENT_LABELS } from '../qa-labels';

/** What is being handed over, and who has already been named as its tester. */
export interface TestingSubject {
  projectId: string;
  taskId?: string;
  releaseId?: string;
  ticketId?: string;
  /** The tester already on the work. Empty leaves the assignment for anyone to claim. */
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  /** What the reader is looking at, used in the heading and as the default brief. */
  label: string;
  /** Prefill for "what to test", usually the task or release title. */
  whatToTest?: string;
}

const ENVIRONMENTS: TestEnvironment[] = [
  TEST_ENVIRONMENT.STAGING,
  TEST_ENVIRONMENT.DEVELOPMENT,
  TEST_ENVIRONMENT.PRODUCTION,
];

/**
 * The two kinds of testing a person hands out from a work screen.
 *
 * RETEST is the server's own — it is raised when a failure is fixed, never chosen — and UAT is the
 * client's decision recorded against a `uat_request`, which `testing-assignment-workflow.ts`
 * refuses to let an internal tester pass. Neither belongs on a button, so neither is offerable
 * here: the type is the check.
 */
export type SendableKind =
  typeof TESTING_ASSIGNMENT_KIND.QA | typeof TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION;

/** What each kind is called, where it usually runs, and what the form is asking for. */
const KIND_COPY: Record<
  SendableKind,
  { verb: string; environment: TestEnvironment; whereLabel: string; whereHint: string }
> = {
  [TESTING_ASSIGNMENT_KIND.QA]: {
    verb: 'for testing',
    environment: TEST_ENVIRONMENT.STAGING,
    whereLabel: 'Where to test it',
    whereHint: 'The staging or preview URL',
  },
  [TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION]: {
    verb: 'for live verification',
    environment: TEST_ENVIRONMENT.PRODUCTION,
    whereLabel: 'Where to check it',
    whereHint: 'The production URL somebody should open',
  },
};

/**
 * Hands work to a tester.
 *
 * This is the missing half of the release pipeline rather than a convenience: `requiresQaPass`
 * defaults on, the QA gate is not satisfied by the absence of QA, and until something called
 * `POST /qa/assignments` no release on a default project could ever be published.
 *
 * `requiresLiveVerification` defaults on too, and had the same hole one step later: nothing but
 * this modal calls `POST /qa/assignments`, it hardcoded `kind: QA`, and `PUBLISHED → VERIFIED` is
 * refused unless a *passed LIVE_VERIFICATION* assignment exists for the release. So "Mark verified
 * live" answered 409 on every default project and there was no way to make it stop. The kind is
 * now the caller's, which is all the API ever needed.
 *
 * The tester comes from the work itself — a task already carries one, collected when it was
 * created or when a ticket was converted — and nothing is offered as a picker here, because
 * choosing a different person is a decision about the work, made where the work is edited. With
 * nobody named the assignment goes to the "ready for testing" queue, which is what that view is
 * for; the workflow lets any tester claim an unassigned one.
 */
export function SendToTestingModal({
  subject,
  kind = TESTING_ASSIGNMENT_KIND.QA,
  onClose,
}: {
  subject: TestingSubject;
  kind?: SendableKind;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { createAssignment } = useQaMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const copy = KIND_COPY[kind];

  const [environment, setEnvironment] = useState<TestEnvironment>(copy.environment);
  const [stagingUrl, setStagingUrl] = useState('');
  const [whatDeveloped, setWhatDeveloped] = useState('');
  const [whatToTest, setWhatToTest] = useState(subject.whatToTest ?? subject.label);
  const [notes, setNotes] = useState('');

  const send = async () => {
    const input: CreateAssignmentInput = {
      projectId: subject.projectId,
      kind,
      environment,
      ...(subject.taskId ? { taskId: subject.taskId } : {}),
      ...(subject.ticketId ? { ticketId: subject.ticketId } : {}),
      ...(subject.releaseId ? { releaseId: subject.releaseId } : {}),
      ...(subject.assignedToUserId ? { assignedToUserId: subject.assignedToUserId } : {}),
      ...(stagingUrl.trim() ? { stagingUrl: stagingUrl.trim() } : {}),
      ...(whatDeveloped.trim() ? { whatDeveloped: whatDeveloped.trim() } : {}),
      ...(whatToTest.trim() ? { whatToTest: whatToTest.trim() } : {}),
      ...(notes.trim() ? { developerNotes: notes.trim() } : {}),
    };
    const created = await createAssignment.mutateAsync(input);
    // Straight to the assignment: whoever filed it usually wants to check what the tester will
    // see, and the read routes accept `qa:assign` as well as `qa:record-result` so they can.
    void navigate(`/qa/${created.id}`);
  };

  return (
    <Modal
      open
      title={`Send ${subject.label} ${copy.verb}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={createAssignment.isPending}
            onClick={() => void wrap(send)()}
          >
            Send {copy.verb}
          </Button>
        </>
      }
    >
      <p className="muted">
        {subject.assignedToName
          ? `${subject.assignedToName} is the tester on this, so it goes to them.`
          : 'Nobody is named as the tester, so this goes to the "ready for testing" queue for any tester to pick up.'}
      </p>
      <FormGrid>
        <FormField label="Environment">
          <Select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as TestEnvironment)}
            options={ENVIRONMENTS.map((value) => ({
              value,
              label: ENVIRONMENT_LABELS[value],
            }))}
          />
        </FormField>
        <FormField label={copy.whereLabel} hint={copy.whereHint}>
          <Input
            type="url"
            value={stagingUrl}
            placeholder="https://staging.example.com"
            onChange={(event) => setStagingUrl(event.target.value)}
          />
        </FormField>
        <FormGridFull>
          <FormField label="What was built" hint="What changed, in the developer’s words">
            <Textarea
              rows={2}
              value={whatDeveloped}
              onChange={(event) => setWhatDeveloped(event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="What to test" hint="The tester works from this">
            <Textarea
              rows={3}
              value={whatToTest}
              onChange={(event) => setWhatToTest(event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Anything else they should know">
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
