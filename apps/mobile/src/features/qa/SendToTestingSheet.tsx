import {
  PERMISSIONS,
  TESTING_ASSIGNMENT_KIND,
  TEST_ENVIRONMENT,
  type TestEnvironment,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { SheetFooter } from './qa-controls';
import { ENVIRONMENT_OPTIONS } from './qa-labels';

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

/**
 * The two kinds a person hands out from a work screen. RETEST is raised by the server when a
 * failure is fixed, and UAT is the client's decision — neither is ever chosen, so the type
 * refuses them.
 */
export type SendableKind =
  typeof TESTING_ASSIGNMENT_KIND.QA | typeof TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION;

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

interface SendForm {
  environment: TestEnvironment;
  stagingUrl: string;
  whatDeveloped: string;
  whatToTest: string;
  notes: string;
}

/** The body `POST /qa/assignments` takes: the subject's ids, and only the fields that say something. */
export function assignmentBody(subject: TestingSubject, kind: SendableKind, form: SendForm) {
  const text = (value: string) => value.trim() || undefined;
  return {
    projectId: subject.projectId,
    kind,
    environment: form.environment,
    taskId: subject.taskId,
    ticketId: subject.ticketId,
    releaseId: subject.releaseId,
    assignedToUserId: subject.assignedToUserId ?? undefined,
    stagingUrl: text(form.stagingUrl),
    whatDeveloped: text(form.whatDeveloped),
    whatToTest: text(form.whatToTest),
    developerNotes: text(form.notes),
  };
}

export interface SendToTestingSheetProps {
  /** Defaults to true, so the sheet can be mounted only while it is open. */
  visible?: boolean;
  subject: TestingSubject;
  kind?: SendableKind;
  onClose: () => void;
  /** After the assignment exists — typically to open it with `QaAssignmentScreen`. */
  onSent?: (assignment: TestingAssignmentDetail) => void;
}

/**
 * Hands work to a tester.
 *
 * Without this nothing on a phone could satisfy the QA gate: a release on a default project needs
 * a passed QA assignment before it publishes and a passed live verification before it is
 * verified, and both begin here. The tester comes from the work itself; choosing somebody else is
 * a decision about the work, made where the work is edited. With nobody named it goes to the
 * "ready for testing" queue for any tester to claim.
 */
export function SendToTestingSheet({
  visible = true,
  subject,
  kind = TESTING_ASSIGNMENT_KIND.QA,
  onClose,
  onSent,
}: SendToTestingSheetProps) {
  const theme = useTheme();
  const copy = KIND_COPY[kind];
  const [form, setForm] = useState<SendForm>({
    environment: copy.environment,
    stagingUrl: '',
    whatDeveloped: '',
    whatToTest: subject.whatToTest ?? subject.label,
    notes: '',
  });
  const set = <K extends keyof SendForm>(key: K, value: SendForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const send = useApiMutation<SendForm, TestingAssignmentDetail>({
    path: '/qa/assignments',
    body: (values) => assignmentBody(subject, kind, values),
    invalidate: [['qa'], ['tasks'], ['releases']],
    onSuccess: (created) => {
      onClose();
      onSent?.(created);
    },
  });

  return (
    <Sheet
      visible={visible}
      title={`Send ${copy.verb}`}
      subtitle={subject.label}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetFooter
          confirmLabel={`Send ${copy.verb}`}
          confirmIcon="send-outline"
          cancelLabel="Cancel"
          busy={send.busy}
          onCancel={onClose}
          onConfirm={() => void send.run(form)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {subject.assignedToName
          ? `${subject.assignedToName} is the tester on this, so it goes to them.`
          : 'Nobody is named as the tester, so this goes to the "ready for testing" queue for any tester to pick up.'}
      </AppText>
      <View style={{ gap: theme.spacing.xs }}>
        <AppText size="sm" weight="medium">
          Environment
        </AppText>
        <Segmented
          options={ENVIRONMENT_OPTIONS}
          value={form.environment}
          onChange={(value) => set('environment', value)}
          label="Environment"
        />
      </View>
      <Field label={copy.whereLabel} hint={copy.whereHint}>
        <Input
          accessibilityLabel={copy.whereLabel}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://staging.example.com"
          value={form.stagingUrl}
          onChangeText={(value) => set('stagingUrl', value)}
        />
      </Field>
      <Field label="What was built" hint="What changed, in the developer’s words">
        <Input
          accessibilityLabel="What was built"
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
          value={form.whatDeveloped}
          onChangeText={(value) => set('whatDeveloped', value)}
        />
      </Field>
      <Field label="What to test" hint="The tester works from this">
        <Input
          accessibilityLabel="What to test"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={form.whatToTest}
          onChangeText={(value) => set('whatToTest', value)}
        />
      </Field>
      <Field label="Anything else they should know">
        <Input
          accessibilityLabel="Anything else they should know"
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
          value={form.notes}
          onChangeText={(value) => set('notes', value)}
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

/**
 * A button that opens the sheet. Drawn only for somebody with `qa:assign`, which is what
 * `POST /qa/assignments` checks — a button that can only fail is worse than no button.
 */
export function SendToTestingButton({
  subject,
  kind = TESTING_ASSIGNMENT_KIND.QA,
  label,
  onSent,
}: {
  subject: TestingSubject;
  kind?: SendableKind;
  label?: string;
  onSent?: (assignment: TestingAssignmentDetail) => void;
}) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can(PERMISSIONS.QA_ASSIGN)) {
    return null;
  }
  return (
    <>
      <Button
        label={label ?? `Send ${KIND_COPY[kind].verb}`}
        icon="flask-outline"
        variant="secondary"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <SendToTestingSheet
          subject={subject}
          kind={kind}
          onClose={() => setOpen(false)}
          {...(onSent ? { onSent } : {})}
        />
      ) : null}
    </>
  );
}
