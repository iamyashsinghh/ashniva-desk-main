import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
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
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Field label="What did you complete?" hint="A reviewer reads this first">
              <Input
                accessibilityLabel="What you completed"
                multiline
                numberOfLines={4}
                onChangeText={setSummary}
                placeholder="Fixed the redirect after SSO sign-in"
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                value={summary}
              />
            </Field>

            <Field label="Time spent (minutes)" hint="Between 1 and 1440">
              <Input
                accessibilityLabel="Time spent in minutes"
                inputMode="numeric"
                keyboardType="number-pad"
                onChangeText={setMinutes}
                placeholder="90"
                value={minutes}
              />
            </Field>
          </Card>

          <Card>
            <Field label="Link to the result" hint="A staging URL or a document. Optional.">
              <Input
                accessibilityLabel="Link to the result"
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
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setGitRef}
                placeholder="feat/sso-redirect"
                value={gitRef}
              />
            </Field>
          </Card>

          <Card>
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.md,
                minHeight: TOUCH_TARGET,
              }}
            >
              <Switch
                accessibilityLabel="Tell the client about this"
                onValueChange={setClientVisible}
                value={clientVisible}
              />
              <View style={{ flex: 1 }}>
                <AppText weight="medium">Tell the client about this</AppText>
                <AppText size="xs" tone="muted">
                  Creates a client update for someone to publish. Off by default.
                </AppText>
              </View>
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
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                  value={clientSummary}
                />
              </Field>
            ) : null}
          </Card>

          {submit.error ? (
            <AppText tone="danger" size="sm">
              {submit.error}
            </AppText>
          ) : null}

          <Button
            label="Send for review"
            loading={submit.busy}
            disabled={!valid}
            accessibilityHint="Submits the task for someone to review"
            onPress={() => void submit.run()}
          />
          {!valid ? (
            <AppText size="xs" tone="faint">
              Describe what you completed and how many minutes it took.
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
