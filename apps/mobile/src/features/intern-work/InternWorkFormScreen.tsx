import type { TaskDetail } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { EmptyState, LoadingState } from '../../shared/components/states';
import { todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { InternWorkFormFields } from './InternWorkFormFields';
import {
  emptyInternWork,
  mayAssignInternWork,
  toInternTaskBody,
  validateInternWork,
  type CreateInternTaskBody,
  type InternWorkErrors,
  type InternWorkValues,
} from './intern-work';

/**
 * Assigning learning work to an intern (`POST /tasks` with `isInternTask`).
 *
 * Separate from the ordinary task form, as on the web: one purpose, one audience, and none of the
 * review, testing or client-visibility choices that do not apply to learning work.
 *
 * On success the new task is opened when `onOpenTask` is given — that is where the intern will
 * reply — and otherwise the form simply closes.
 */
export function InternWorkFormScreen({
  onDone,
  onOpenTask,
}: {
  onDone: () => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const { status, user, can } = useSession();

  if (status === 'restoring') {
    return (
      <Screen>
        <LoadingState variant="spinner" />
      </Screen>
    );
  }
  if (!mayAssignInternWork(user, can)) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          iconTone="neutral"
          title="Assign intern work"
          description="Only a director, project manager or team lead can assign work to interns."
          action={{ label: 'Back', onPress: onDone }}
        />
      </Screen>
    );
  }
  return (
    <InternWorkForm
      onSaved={(taskId) => (onOpenTask ? onOpenTask(taskId) : onDone())}
      initial={emptyInternWork(todayIsoDate())}
    />
  );
}

function InternWorkForm({
  initial,
  onSaved,
}: {
  initial: InternWorkValues;
  onSaved: (taskId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<InternWorkErrors>({});

  const create = useApiMutation<CreateInternTaskBody, TaskDetail>({
    path: '/tasks',
    body: (body) => body,
    invalidate: [['tasks'], ['dashboard']],
    onSuccess: (task) => onSaved(task.id),
  });

  const submit = () => {
    const found = validateInternWork(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    void create.run(toInternTaskBody(values));
  };

  const change = (patch: Partial<InternWorkValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
          keyboardShouldPersistTaps="handled"
        >
          <Banner tone="info">
            The intern sees this under Intern work, replies in comments, and uploads attachments
            with a short note on what each file is for. Only you and Super Admin see it besides the
            intern.
          </Banner>
          <InternWorkFormFields values={values} onChange={change} errors={errors} />
          {Object.keys(errors).length > 0 ? (
            <Banner tone="warning" title="Check the form">
              Fix the fields marked above, then assign again.
            </Banner>
          ) : null}
          {create.error ? (
            <Banner tone="danger" role="alert" title="Not assigned">
              {create.error}
            </Banner>
          ) : null}
        </ScrollView>
        <StickyActionBar>
          <Grow>
            <Button
              label="Assign work"
              icon="send-outline"
              loading={create.busy}
              onPress={submit}
            />
          </Grow>
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
