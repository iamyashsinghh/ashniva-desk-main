import {
  TESTING_ASSIGNMENT_KIND,
  TEST_ENVIRONMENT,
  type TaskDetail,
  type TestEnvironment,
  type TestingAssignmentSummary,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { Sheet } from '../../../shared/components/Sheet';
import { isTester } from '../task-people';
import { SheetButtons } from './SheetButtons';

/** The part of `CreateTestingAssignmentDto` a task hand-over fills in. */
interface TestingHandOver {
  projectId: string;
  kind: typeof TESTING_ASSIGNMENT_KIND.QA;
  environment: TestEnvironment;
  taskId: string;
  assignedToUserId?: string;
  stagingUrl?: string;
  whatDeveloped?: string;
  whatToTest?: string;
  developerNotes?: string;
}

const ENVIRONMENTS: SelectOption<TestEnvironment>[] = [
  { value: TEST_ENVIRONMENT.STAGING, label: 'Staging', icon: 'cloud-outline' },
  { value: TEST_ENVIRONMENT.DEVELOPMENT, label: 'Development', icon: 'code-slash-outline' },
  { value: TEST_ENVIRONMENT.PRODUCTION, label: 'Production', icon: 'globe-outline' },
];

/**
 * Handing the task to a tester: `POST /qa/assignments` with kind QA.
 *
 * The tester starts as the one named on the task, as on the web; changing it here names somebody
 * for this hand-over only. Nobody chosen sends it to the "ready for testing" queue for any tester
 * to claim. What to test starts from the acceptance criteria, which is what the tester checks
 * against anyway.
 */
export function SendToTestingSheet({
  task,
  onClose,
  onDone,
}: {
  task: TaskDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [environment, setEnvironment] = useState<TestEnvironment>(TEST_ENVIRONMENT.STAGING);
  const [tester, setTester] = useState<string[]>(task.tester ? [task.tester.id] : []);
  const [stagingUrl, setStagingUrl] = useState('');
  const [whatDeveloped, setWhatDeveloped] = useState('');
  const [whatToTest, setWhatToTest] = useState(task.acceptanceCriteria ?? task.title);
  const [notes, setNotes] = useState('');

  const send = useApiMutation<TestingHandOver, TestingAssignmentSummary>({
    path: '/qa/assignments',
    body: (variables) => variables,
    invalidate: [['tasks'], ['qa']],
    onSuccess: onDone,
  });

  const submit = () => {
    const testerId = tester[0];
    void send.run({
      projectId: task.project.id,
      kind: TESTING_ASSIGNMENT_KIND.QA,
      environment,
      taskId: task.id,
      ...(testerId ? { assignedToUserId: testerId } : {}),
      ...(stagingUrl.trim() ? { stagingUrl: stagingUrl.trim() } : {}),
      ...(whatDeveloped.trim() ? { whatDeveloped: whatDeveloped.trim() } : {}),
      ...(whatToTest.trim() ? { whatToTest: whatToTest.trim() } : {}),
      ...(notes.trim() ? { developerNotes: notes.trim() } : {}),
    });
  };

  return (
    <Sheet
      visible
      title={`Send ${task.key} for testing`}
      subtitle="A tester gets everything they need to start"
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel="Send for testing"
          confirmIcon="flask-outline"
          onConfirm={submit}
          onCancel={onClose}
          busy={send.busy}
        />
      }
    >
      <UserPicker
        label="Tester"
        value={tester}
        onChange={setTester}
        filter={isTester}
        placeholder="Any tester (ready queue)"
        hint={
          tester.length > 0
            ? 'It goes straight to this person'
            : 'Nobody named: any tester can pick it up'
        }
      />
      <SelectField
        label="Environment"
        icon="server-outline"
        options={ENVIRONMENTS}
        value={[environment]}
        onChange={(values) => setEnvironment(values[0] ?? TEST_ENVIRONMENT.STAGING)}
      />
      <Field label="Where to test it" hint="The staging or preview URL">
        <Input
          accessibilityLabel="Where to test it"
          icon="link-outline"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://staging.example.com"
          onChangeText={setStagingUrl}
          value={stagingUrl}
        />
      </Field>
      <Field label="What was built" hint="What changed, in the developer's words">
        <Input
          accessibilityLabel="What was built"
          multiline
          numberOfLines={2}
          maxLength={5000}
          onChangeText={setWhatDeveloped}
          style={{ minHeight: 64 }}
          value={whatDeveloped}
        />
      </Field>
      <Field label="What to test" hint="The tester works from this">
        <Input
          accessibilityLabel="What to test"
          multiline
          numberOfLines={3}
          maxLength={5000}
          onChangeText={setWhatToTest}
          style={{ minHeight: 80 }}
          value={whatToTest}
        />
      </Field>
      <Field label="Note for the tester">
        <Input
          accessibilityLabel="Note for the tester"
          multiline
          numberOfLines={2}
          maxLength={5000}
          onChangeText={setNotes}
          style={{ minHeight: 64 }}
          value={notes}
        />
      </Field>
      {send.error ? (
        <Banner tone="danger" role="alert">
          {send.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
