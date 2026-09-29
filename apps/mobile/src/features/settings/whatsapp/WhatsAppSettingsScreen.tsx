import { PERMISSIONS, type WhatsAppSettings } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import {
  useSaveWhatsAppSettings,
  useSendWhatsAppTest,
  useTestConnection,
  useWhatsAppSettings,
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
import { WebhookSection } from './WebhookSection';
import { WhatsAppFields } from './WhatsAppFields';
import {
  whatsAppFormFrom,
  whatsAppFormValid,
  whatsAppInput,
  type WhatsAppForm,
} from './whatsapp-form';
import { WhatsAppTemplateFields } from './WhatsAppTemplateFields';

/**
 * Admin → WhatsApp: the Meta business account messages go out from, the webhook, the approved
 * template names, a test send and what has gone out.
 *
 * `integration:read` shows it; `integration:manage` edits it and runs the tests. The access token,
 * app secret and verify token are write-only: "Stored" or "Not set", never the value.
 */
export function WhatsAppSettingsScreen() {
  const { can } = useSession();
  const canRead = can(PERMISSIONS.INTEGRATION_READ);
  const query = useWhatsAppSettings(canRead);

  if (!canRead) {
    return <NoAccess description="WhatsApp settings need the integrations permission." />;
  }
  const gate = resourceGate(query, 'Loading WhatsApp settings');
  if (gate || query.data === undefined) {
    return gate;
  }
  return (
    <WhatsAppSettingsForm
      settings={query.data}
      canManage={can(PERMISSIONS.INTEGRATION_MANAGE)}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}

function WhatsAppSettingsForm({
  settings,
  canManage,
  refreshing,
  onRefresh,
}: {
  settings: WhatsAppSettings | null;
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => unknown;
}) {
  const [form, setForm] = useState<WhatsAppForm>(() => whatsAppFormFrom(settings));
  const [testPhone, setTestPhone] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const save = useSaveWhatsAppSettings();
  const testConnection = useTestConnection('WHATSAPP');
  const sendTest = useSendWhatsAppTest();
  const failure = save.error ?? testConnection.error ?? sendTest.error;
  const hasToken = settings?.hasAccessToken ?? false;
  const valid = whatsAppFormValid(form);

  const begin = () => {
    setFeedback(null);
    save.reset();
    testConnection.reset();
    sendTest.reset();
  };

  const onSave = async () => {
    begin();
    if (await save.run(whatsAppInput(form))) {
      setForm((current) => ({ ...current, accessToken: '', appSecret: '', verifyToken: '' }));
      setFeedback({ tone: 'success', message: 'Settings saved.' });
    }
  };

  const onTestConnection = async () => {
    begin();
    const result = await testConnection.run();
    if (result) {
      setFeedback({ tone: result.ok ? 'success' : 'danger', message: result.message });
    }
  };

  const onSendTest = async () => {
    begin();
    const result = await sendTest.run({ template: 'TEST', toPhone: testPhone.trim() });
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
                disabled={!valid}
                {...(valid
                  ? {}
                  : { accessibilityHint: 'Both Meta ids are required, and are numeric' })}
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
      <ConnectionStatus settings={settings} blocker={hasToken ? null : 'No access token'}>
        {canManage ? (
          <Button
            label="Test connection"
            icon="pulse-outline"
            size="sm"
            variant="secondary"
            loading={testConnection.busy}
            disabled={!hasToken}
            {...(hasToken ? {} : { accessibilityHint: 'Save an access token first' })}
            onPress={() => void onTestConnection()}
          />
        ) : null}
      </ConnectionStatus>
      {!canManage ? (
        <AppText size="xs" tone="muted">
          You can see these settings; changing them needs the integrations management permission.
        </AppText>
      ) : null}
      <WebhookSection settings={settings} />
      <WhatsAppFields
        form={form}
        settings={settings}
        editable={canManage}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />
      <WhatsAppTemplateFields
        templateNames={form.templateNames}
        editable={canManage}
        onChange={(templateNames) => setForm((current) => ({ ...current, templateNames }))}
      />
      {canManage ? (
        <Section title="Send a test" icon="send-outline">
          <AppText size="sm" tone="muted">
            Sends one approved template, so a mapping can be checked end to end before anyone
            depends on it.
          </AppText>
          <Field label="Number" hint="International format, e.g. +441234567890">
            <Input
              accessibilityLabel="Test number"
              value={testPhone}
              onChangeText={setTestPhone}
              placeholder="+441234567890"
              keyboardType="phone-pad"
            />
          </Field>
          <Button
            label="Send test message"
            icon="send-outline"
            size="sm"
            variant="secondary"
            loading={sendTest.busy}
            disabled={!hasToken || testPhone.trim().length < 8}
            accessibilityHint="Needs a saved access token and a number"
            onPress={() => void onSendTest()}
            style={{ alignSelf: 'flex-start' }}
          />
        </Section>
      ) : null}
      <MessageHistory channel="WHATSAPP" />
    </SettingsScroll>
  );
}
