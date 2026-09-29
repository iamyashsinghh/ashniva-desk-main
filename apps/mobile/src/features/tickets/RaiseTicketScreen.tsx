import type { FileSummary } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import {
  Grow,
  Section,
  StickyActionBar,
  useStackKeyboardOffset,
} from '../../shared/components/layout';
import { AppText, Button, Field, Input, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isClientUser } from '../auth/audience';
import { useSession } from '../auth/SessionProvider';
import { RaiseAttachments } from './raise/RaiseAttachments';
import {
  EMPTY_RAISE_FORM,
  raiseBody,
  validateRaise,
  type RaiseErrors,
  type RaiseForm,
} from './raise/raise-form';
import { RaiseDetailsSection, RaiseWhereSection } from './raise/RaiseFormSections';

/**
 * Raising a ticket — the web form's fields, top to bottom in the order people think of them.
 *
 * A client raises through the portal endpoint, which files the ticket under their own company and
 * answers with the client view; staff use `/tickets` and may raise for a client company.
 * Mistakes are shown against the field after the first attempt, not while somebody is still typing.
 */
export function RaiseTicketScreen({ onRaised }: { onRaised: (ticketId: string) => void }) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { user } = useSession();
  const client = isClientUser(user);
  const [form, setForm] = useState<RaiseForm>(EMPTY_RAISE_FORM);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [attempted, setAttempted] = useState(false);
  const errors: RaiseErrors = attempted ? validateRaise(form) : {};

  const raise = useApiMutation<void, { id: string }>({
    path: client ? '/portal/tickets' : '/tickets',
    body: () =>
      raiseBody(
        form,
        files.map((file) => file.id),
      ),
    invalidate: [['tickets'], ['portal'], ['dashboard']],
    onSuccess: (created) => onRaised(created.id),
  });

  const set = <K extends keyof RaiseForm>(key: K, value: RaiseForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    setAttempted(true);
    if (Object.keys(validateRaise(form)).length === 0) {
      void raise.run();
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

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
          <RaiseWhereSection form={form} set={set} />

          <Section title="The problem" icon="create-outline">
            <Field label="Title" required hint="One line" error={errors.title}>
              <Input
                accessibilityLabel="Ticket title"
                onChangeText={(value) => set('title', value)}
                placeholder="Short summary of the problem"
                value={form.title}
              />
            </Field>
            <Field
              label="What is happening?"
              required
              hint="What you did, what happened, what you expected"
              error={errors.description}
            >
              <Input
                accessibilityLabel="Description"
                multiline
                numberOfLines={5}
                onChangeText={(value) => set('description', value)}
                style={{ minHeight: 120, textAlignVertical: 'top' }}
                value={form.description}
              />
            </Field>
            <Field
              label="What can’t you do because of this?"
              hint="Optional, but it helps prioritise"
              error={errors.impact}
            >
              <Input
                accessibilityLabel="Impact"
                multiline
                numberOfLines={2}
                onChangeText={(value) => set('impact', value)}
                style={{ minHeight: 64, textAlignVertical: 'top' }}
                value={form.impact}
              />
            </Field>
          </Section>

          <RaiseDetailsSection form={form} errors={errors} set={set} />
          <RaiseAttachments files={files} onChange={setFiles} />

          {raise.error ? (
            <Banner tone="danger" role="alert">
              {raise.error}
            </Banner>
          ) : null}
        </ScrollView>

        <StickyActionBar
          note={
            hasErrors ? (
              <AppText size="xs" tone="danger">
                Check the highlighted fields.
              </AppText>
            ) : null
          }
        >
          <Grow>
            <Button
              label="Raise the ticket"
              icon="add-circle-outline"
              loading={raise.busy}
              accessibilityHint="Creates the ticket and opens it"
              onPress={submit}
            />
          </Grow>
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
