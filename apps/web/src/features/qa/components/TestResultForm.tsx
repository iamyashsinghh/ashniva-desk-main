import {
  TEST_ENVIRONMENT,
  TEST_RESULT,
  type FileSummary,
  type TestEnvironment,
  type TestingAssignmentDetail,
  type TestResult,
  type TestSeverity,
} from '@ashniva/types';
import {
  Alert,
  Button,
  FieldGroup,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useQaMutations } from '../api';
import { ENVIRONMENT_LABELS } from '../qa-labels';
import { EvidenceUpload } from './EvidenceUpload';
import { SeveritySelect } from './SeveritySelect';

interface TestResultFormProps {
  assignment: TestingAssignmentDetail;
  onClose: () => void;
}

interface FormState {
  result: TestResult;
  environment: TestEnvironment;
  whatTested: string;
  actualResult: string;
  failureDescription: string;
  severity: TestSeverity | '';
  browserDevice: string;
  commentForDeveloper: string;
  retestRequired: boolean;
}

/**
 * The pass/fail form (design map 2l).
 *
 * The narrative fields are required on both outcomes and the failure fields on top of them, which
 * is the same rule `RecordTestResultDto` and the workflow service enforce. It is repeated here not
 * as a second authority but so the person typing finds out before they submit — the server's
 * refusal is still what is shown if the two ever disagree.
 */
export function TestResultForm({ assignment, onClose }: TestResultFormProps) {
  const { recordResult } = useQaMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [evidence, setEvidence] = useState<FileSummary | null>(null);
  const [form, setForm] = useState<FormState>({
    result: TEST_RESULT.PASS,
    environment: assignment.environment,
    whatTested: assignment.whatToTest?.slice(0, 500) ?? '',
    actualResult: '',
    failureDescription: '',
    severity: '',
    browserDevice: assignment.browserDevice[0] ?? '',
    commentForDeveloper: '',
    // A failure is worth retesting unless the tester says otherwise; a pass is not.
    retestRequired: false,
  });

  const failing = form.result === TEST_RESULT.FAIL;
  const missing = missingFields(form);

  const save = () =>
    recordResult.mutateAsync({
      id: assignment.id,
      input: {
        result: form.result,
        environment: form.environment,
        whatTested: form.whatTested.trim(),
        actualResult: form.actualResult.trim(),
        failureDescription: failing ? form.failureDescription.trim() : undefined,
        severity: failing && form.severity ? form.severity : undefined,
        browserDevice: form.browserDevice.trim() || undefined,
        commentForDeveloper: form.commentForDeveloper.trim() || undefined,
        retestRequired: failing ? form.retestRequired : false,
        evidenceFileId: evidence?.id,
      },
    });

  return (
    <Modal
      open
      size="lg"
      title="Record a test result"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={failing ? 'danger' : 'primary'}
            loading={recordResult.isPending}
            disabled={missing.length > 0}
            disabledReason={`Still needed: ${missing.join(', ')}`}
            onClick={() => void wrap(save)()}
          >
            {failing ? 'Record failure' : 'Record pass'}
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormGridFull>
          <FieldGroup legend="Outcome" required>
            <SegmentedControl
              aria-label="Outcome"
              value={form.result}
              onChange={(result) => setForm({ ...form, result })}
              options={[
                { key: TEST_RESULT.PASS, label: 'Passed' },
                { key: TEST_RESULT.FAIL, label: 'Failed' },
              ]}
            />
          </FieldGroup>
        </FormGridFull>

        <FormField label="Environment" required>
          <Select
            value={form.environment}
            onChange={(event) =>
              setForm({ ...form, environment: event.target.value as TestEnvironment })
            }
            options={Object.values(TEST_ENVIRONMENT).map((kind) => ({
              value: kind,
              label: ENVIRONMENT_LABELS[kind],
            }))}
          />
        </FormField>

        <FormField label="Browser / device" hint="Where you saw this, e.g. Chrome 131 on Windows">
          <Input
            value={form.browserDevice}
            onChange={(event) => setForm({ ...form, browserDevice: event.target.value })}
          />
        </FormField>

        <FormGridFull>
          <FormField label="What you tested" required>
            <Textarea
              rows={3}
              value={form.whatTested}
              onChange={(event) => setForm({ ...form, whatTested: event.target.value })}
            />
          </FormField>
        </FormGridFull>

        <FormGridFull>
          <FormField label="What actually happened" required>
            <Textarea
              rows={3}
              value={form.actualResult}
              onChange={(event) => setForm({ ...form, actualResult: event.target.value })}
            />
          </FormField>
        </FormGridFull>

        {failing ? (
          <>
            <FormGridFull>
              <FormField
                label="What is broken"
                required
                hint="The developer reads this first — steps, expected, actual"
              >
                <Textarea
                  rows={3}
                  value={form.failureDescription}
                  onChange={(event) => setForm({ ...form, failureDescription: event.target.value })}
                />
              </FormField>
            </FormGridFull>
            <FormField label="Severity" required>
              <SeveritySelect
                value={form.severity}
                onChange={(severity) => setForm({ ...form, severity })}
              />
            </FormField>
            <div className="qa-form__switch">
              <Switch
                checked={form.retestRequired}
                onChange={(retestRequired) => setForm({ ...form, retestRequired })}
                label="Needs a retest once it is fixed"
                description="Keeps this in the retest queue instead of closing it."
              />
            </div>
          </>
        ) : null}

        <FormGridFull>
          <FormField
            label="Comment for the developer"
            hint="Optional. Internal — never shown to a client."
          >
            <Textarea
              rows={2}
              value={form.commentForDeveloper}
              onChange={(event) => setForm({ ...form, commentForDeveloper: event.target.value })}
            />
          </FormField>
        </FormGridFull>

        {/* Not a FormField: the upload is a control of its own, with its own label and errors. */}
        <FormGridFull>
          <FieldGroup
            legend="Evidence"
            hint="A screenshot or log, attached to the work as an internal file."
          >
            <EvidenceUpload
              parent={evidenceParent(assignment)}
              file={evidence}
              onChange={setEvidence}
            />
          </FieldGroup>
        </FormGridFull>

        {error ? (
          <FormGridFull>
            <Alert tone="danger">{error}</Alert>
          </FormGridFull>
        ) : null}
      </FormGrid>
    </Modal>
  );
}

/** What is still missing, in the words the button uses to explain itself. */
function missingFields(form: FormState): string[] {
  const missing: string[] = [];
  if (form.whatTested.trim().length < 3) {
    missing.push('what you tested');
  }
  if (form.actualResult.trim().length < 3) {
    missing.push('what actually happened');
  }
  if (form.result === TEST_RESULT.FAIL) {
    if (form.failureDescription.trim().length < 3) {
      missing.push('what is broken');
    }
    if (!form.severity) {
      missing.push('a severity');
    }
  }
  return missing;
}

function evidenceParent(assignment: TestingAssignmentDetail) {
  if (assignment.taskId) {
    return { taskId: assignment.taskId };
  }
  if (assignment.ticketId) {
    return { ticketId: assignment.ticketId };
  }
  return { projectId: assignment.projectId };
}
