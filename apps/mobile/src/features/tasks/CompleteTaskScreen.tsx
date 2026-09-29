import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { IconTile } from '../../shared/components/Icon';
import {
  Grow,
  Section,
  StickyActionBar,
  useStackKeyboardOffset,
} from '../../shared/components/layout';
import { AppText, Button, Field, Input, Screen } from '../../shared/components/primitives';
import { animateLayout } from '../../shared/theme/motion';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Sending a task for review.
 *
 * The one form on the phone that writes something consequential, so it asks for exactly what the
 * API requires and nothing more: what was completed, how long it took, and optionally where to
 * see the result.
 *
 * Client visibility is a switch with the consequence spelled out rather than a checkbox labelled
 * "visible". Somebody tapping this on a train should know that a client will read what they typed.
 */
export function CompleteTaskScreen({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [clientSummary, setClientSummary] = useState('');

  const parsedMinutes = Number(minutes);
  const validMinutes =
    Number.isInteger(parsedMinutes) && parsedMinutes > 0 && parsedMinutes <= 1440;
  const valid = summary.trim().length >= 3 && validMinutes;

  const submit = useApiMutation({
    path: `/tasks/${taskId}/submit`,
    body: () => ({
      summary: summary.trim(),
      minutes: parsedMinutes,
      ...(proofUrl.trim() ? { proofUrl: proofUrl.trim() } : {}),
      ...(gitRef.trim() ? { gitRef: gitRef.trim() } : {}),
      clientVisible,
      ...(clientVisible && clientSummary.trim() ? { clientSummary: clientSummary.trim() } : {}),
    }),
    // The task has left the assignee's queue and its detail is a status behind.
    invalidate: [['tasks'], ['tasks', taskId]],
    onSuccess: onDone,
  });

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
          <Section title="The work" icon="construct-outline">
            <Field label="What did you complete?" required hint="A reviewer reads this first">
              <Input
                accessibilityLabel="What you completed"
                multiline
                numberOfLines={4}
                onChangeText={setSummary}
                placeholder="Fixed the redirect after SSO sign-in"
                style={{ minHeight: 104 }}
                value={summary}
              />
            </Field>

            <Field label="Time spent (minutes)" required hint="Between 1 and 1440">
              <Input
                accessibilityLabel="Time spent in minutes"
                icon="time-outline"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setMinutes}
                placeholder="90"
                value={minutes}
                invalid={minutes.length > 0 && !validMinutes}
              />
            </Field>
          </Section>

          <Section title="Evidence · optional" icon="attach">
            <Field label="Link to the result" hint="A staging URL or a document. Optional.">
              <Input
                accessibilityLabel="Link to the result"
                icon="link-outline"
                autoCapitalize="none"
                inputMode="url"
                onChangeText={setProofUrl}
                placeholder="https://staging.example.com/checkout"
                value={proofUrl}
              />
            </Field>

            <Field label="Git reference" hint="A branch, commit or pull request. Optional.">
              <Input
                accessibilityLabel="Git reference"
                icon="git-branch-outline"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setGitRef}
                placeholder="feat/sso-redirect"
                value={gitRef}
              />
            </Field>
          </Section>

          <Section title="Client" icon="people-outline">
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.md,
                minHeight: TOUCH_TARGET,
              }}
            >
              <IconTile name="eye-outline" tone={clientVisible ? 'info' : 'neutral'} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="medium">Tell the client about this</AppText>
                <AppText size="xs" tone="muted">
                  Creates a client update for someone to publish. Off by default.
                </AppText>
              </View>
              <Switch
                accessibilityLabel="Tell the client about this"
                onValueChange={(value) => {
                  animateLayout();
                  setClientVisible(value);
                }}
                trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
                value={clientVisible}
              />
            </View>

            {clientVisible ? (
              <Field
                label="What the client will read"
                hint="Plain language. No internal detail, estimates or costs."
              >
                <Input
                  accessibilityLabel="What the client will read"
                  multiline
                  numberOfLines={3}
                  onChangeText={setClientSummary}
                  style={{ minHeight: 80 }}
                  value={clientSummary}
                />
              </Field>
            ) : null}
          </Section>

          {submit.error ? (
            <Banner tone="danger" role="alert">
              {submit.error}
            </Banner>
          ) : null}
        </ScrollView>

        <StickyActionBar
          note={
            !valid ? (
              <AppText size="xs" tone="faint">
                Describe what you completed and how many minutes it took.
              </AppText>
            ) : null
          }
        >
          <Grow>
            <Button
              label="Send for review"
              icon="paper-plane-outline"
              loading={submit.busy}
              disabled={!valid}
              accessibilityHint="Submits the task for someone to review"
              onPress={() => void submit.run()}
            />
          </Grow>
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
