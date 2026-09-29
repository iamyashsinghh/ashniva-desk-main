import { PERMISSIONS, type EmailSettings } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { AppText, Button } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import {
  useEmailSettings,
  useSaveEmailSettings,
  useSendEmailTest,
  useTestConnection,
} from '../messaging/api';
import { ConnectionStatus } from '../messaging/ConnectionStatus';
import { MessageHistory } from '../messaging/MessageHistory';
import {
  FeedbackBanner,
  NoAccess,
  resourceGate,
  SettingsScroll,
  type Feedback,
} from '../shared/SettingsLayout';
import { EmailFields } from './EmailFields';
import { emailFormFrom, emailFormValid, emailInput, type EmailForm } from './email-form';
import { EmailTemplateMap } from './EmailTemplateMap';

/**
 * Admin → Email: the SMTP server transactional mail goes through, whether it works, and what has
 * gone out.
 *
 * `integration:read` shows it; `integration:manage` edits it and runs both tests. The password is
 * write-only, as on the web — "Stored" or "Not set", never the value.
 */
export function EmailSettingsScreen() {
  const { can } = useSession();
  const canRead = can(PERMISSIONS.INTEGRATION_READ);
  const query = useEmailSettings(canRead);

  if (!canRead) {
    return <NoAccess description="Email settings need the integrations permission." />;
  }
  const gate = resourceGate(query, 'Loading email settings');
  if (gate || query.data === undefined) {
    return gate;
  }
  return (
    <EmailSettingsForm
      settings={query.data}
      canManage={can(PERMISSIONS.INTEGRATION_MANAGE)}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}

function EmailSettingsForm({
  settings,
  canManage,
  refreshing,
  onRefresh,
}: {
  settings: EmailSettings | null;
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => unknown;
}) {
  const [form, setForm] = useState<EmailForm>(() => emailFormFrom(settings));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const save = useSaveEmailSettings();
  const testConnection = useTestConnection('EMAIL');
  const sendTest = useSendEmailTest();
  const failure = save.error ?? testConnection.error ?? sendTest.error;

  const begin = () => {
    setFeedback(null);
    save.reset();
    testConnection.reset();
    sendTest.reset();
  };

  const onSave = async () => {
    begin();
    if (await save.run(emailInput(form))) {
      setForm((current) => ({ ...current, password: '' }));
      setFeedback({ tone: 'success', message: 'Settings saved.' });
    }
  };

  const onTestConnection = async () => {
    begin();
    const result = await testConnection.run();
    if (result) {
      // A failed test is a failure, so it reads as an error rather than a notice.
      setFeedback({ tone: result.ok ? 'success' : 'danger', message: result.message });
    }
  };

  const onSendTest = async () => {
    begin();
    const result = await sendTest.run();
    if (result) {
      setFeedback({ tone: 'success', message: result.message });
    }
  };

  return (
    <SettingsScroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      {...(canManage
        ? {
            footer: (
              <Button
                label="Save settings"
                icon="checkmark"
                loading={save.busy}
                disabled={!emailFormValid(form)}
                {...(emailFormValid(form)
                  ? {}
                  : { accessibilityHint: 'A server, port and sender address are required' })}
                onPress={() => void onSave()}
                style={{ flex: 1 }}
              />
            ),
          }
        : {})}
    >
      <FeedbackBanner feedback={feedback} />
      {failure ? (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      ) : null}
      <ConnectionStatus settings={settings}>
        {canManage ? (
          <>
            <Button
              label="Test connection"
              icon="pulse-outline"
              size="sm"
              variant="secondary"
              loading={testConnection.busy}
              disabled={!settings}
              accessibilityHint={
                settings
                  ? 'Checks the server accepts the saved settings'
                  : 'Save the settings first'
              }
              onPress={() => void onTestConnection()}
            />
            <Button
              label="Send a test to myself"
              icon="send-outline"
              size="sm"
              variant="secondary"
              loading={sendTest.busy}
              disabled={!settings}
              accessibilityHint={
                settings
                  ? 'Sends to your own address, and nobody else’s'
                  : 'Save the settings first'
              }
              onPress={() => void onSendTest()}
            />
          </>
        ) : null}
      </ConnectionStatus>
      {!canManage ? (
        <AppText size="xs" tone="muted">
          You can see these settings; changing them needs the integrations management permission.
        </AppText>
      ) : null}
      <EmailFields
        form={form}
        hasPassword={settings?.hasPassword ?? false}
        editable={canManage}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
      <EmailTemplateMap />
      <MessageHistory channel="EMAIL" />
    </SettingsScroll>
  );
}
