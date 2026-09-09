import type { MessageTemplate, WhatsAppSettings } from '@ashniva/types';
import { Alert, Badge, Button, Card, FormField, FormGrid, Input, PageHeader } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useWhatsAppMutations, useWhatsAppSettingsQuery } from '../api';
import { MessageHistory } from '../components/MessageHistory';
import { WhatsAppAccountForm, type WhatsAppForm } from '../components/WhatsAppAccountForm';
import { WhatsAppTemplateMap } from '../components/WhatsAppTemplateMap';

import '../messaging.css';

/** Meta Cloud API configuration, webhook state, template mapping and a test send. */
export function WhatsAppSettingsPage() {
  const query = useWhatsAppSettingsQuery();

  return (
    <div className="messaging-page">
      <PageHeader
        title="WhatsApp"
        subtitle="The business account messages are sent from, and what has gone out"
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Loaded settings={query.data ?? null} />
      </QueryState>
    </div>
  );
}

function Loaded({ settings }: { settings: WhatsAppSettings | null }) {
  const { save, testConnection, sendTest } = useWhatsAppMutations();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [form, setForm] = useState<WhatsAppForm>({
    businessAccountId: settings?.businessAccountId ?? '',
    phoneNumberId: settings?.phoneNumberId ?? '',
    displayPhoneNumber: settings?.displayPhoneNumber ?? '',
    apiVersion: settings?.apiVersion ?? 'v21.0',
    templateLanguage: settings?.templateLanguage ?? 'en',
    templateNames: settings?.templateNames ?? {},
    // Always blank: neither stored secret can be read back, and leaving these empty keeps them.
    accessToken: '',
    appSecret: '',
    verifyToken: '',
    enabled: settings?.enabled ?? true,
  });

  const run = async (work: () => Promise<unknown>, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      await work();
      if (success) {
        setNotice(success);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const onSave = () =>
    void run(
      () =>
        save.mutateAsync({
          businessAccountId: form.businessAccountId.trim(),
          phoneNumberId: form.phoneNumberId.trim(),
          displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
          apiVersion: form.apiVersion.trim() || undefined,
          templateLanguage: form.templateLanguage.trim() || undefined,
          templateNames: form.templateNames,
          // Sent only when filled in, so saving does not clear a stored secret.
          accessToken: form.accessToken || undefined,
          appSecret: form.appSecret || undefined,
          verifyToken: form.verifyToken || undefined,
          enabled: form.enabled,
        }),
      'Settings saved',
    );

  return (
    <>
      <Card title="Connection status">
        <div className="messaging-status">
          <StatusBadge settings={settings} />
          {settings?.lastSuccessAt ? (
            <span className="muted">
              Last successful send {formatDateTime(settings.lastSuccessAt)}
            </span>
          ) : (
            <span className="muted">Nothing has been sent yet.</span>
          )}
          {settings?.lastError ? (
            <p className="messaging-status__error">Last error: {settings.lastError}</p>
          ) : null}
        </div>
        <div className="detail-actions">
          <Button
            loading={testConnection.isPending}
            disabled={!settings?.hasAccessToken}
            disabledReason="Save an access token first"
            onClick={() =>
              void run(async () => {
                const result = await testConnection.mutateAsync();
                if (!result.ok) {
                  throw new Error(result.message);
                }
                setNotice(result.message);
              })
            }
          >
            Test connection
          </Button>
        </div>
        {notice ? <p className="messaging-notice">{notice}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Card>

      <Card title="Webhook">
        <div className="messaging-status">
          {settings?.webhookUrl ? (
            <>
              <p className="muted">Give this URL to Meta as the callback for your app:</p>
              <code className="messaging-webhook-url">{settings.webhookUrl}</code>
            </>
          ) : (
            <p className="muted">Save the business account id to see the callback URL.</p>
          )}
          <div className="messaging-status__flags">
            <Badge tone={settings?.hasVerifyToken ? 'success' : 'warning'}>
              {settings?.hasVerifyToken ? 'Verify token stored' : 'No verify token'}
            </Badge>
            <Badge tone={settings?.hasAppSecret ? 'success' : 'warning'}>
              {settings?.hasAppSecret ? 'App secret stored' : 'No app secret'}
            </Badge>
          </div>
          {settings && !settings.hasAppSecret ? (
            <p className="messaging-status__error">
              Without an app secret every inbound delivery is rejected: the signature is the only
              thing proving a webhook really came from Meta.
            </p>
          ) : null}
        </div>
      </Card>

      <WhatsAppAccountForm
        form={form}
        settings={settings}
        saving={save.isPending}
        onChange={setForm}
        onSave={onSave}
      />

      <WhatsAppTemplateMap
        templateNames={form.templateNames}
        onChange={(templateNames) => setForm({ ...form, templateNames })}
      />

      <Card title="Send a test">
        <p className="muted">
          Sends one approved template, so a mapping can be checked end to end before anyone depends
          on it.
        </p>
        <FormGrid>
          <FormField label="Number" hint="International format, e.g. +441234567890">
            <Input
              value={testPhone}
              placeholder="+441234567890"
              onChange={(event) => setTestPhone(event.target.value)}
            />
          </FormField>
        </FormGrid>
        <div className="detail-actions">
          <Button
            loading={sendTest.isPending}
            disabled={!settings?.hasAccessToken || testPhone.trim().length < 8}
            disabledReason="Save an access token and enter a number"
            onClick={() =>
              void run(async () => {
                const result = await sendTest.mutateAsync({
                  template: 'TEST' as MessageTemplate,
                  toPhone: testPhone.trim(),
                });
                setNotice(result.message);
              })
            }
          >
            Send test message
          </Button>
        </div>
      </Card>

      <MessageHistory channel="WHATSAPP" />
    </>
  );
}

function StatusBadge({ settings }: { settings: WhatsAppSettings | null }) {
  if (!settings) {
    return <Badge tone="neutral">Not set up</Badge>;
  }
  if (!settings.enabled) {
    return <Badge tone="warning">Turned off</Badge>;
  }
  if (!settings.hasAccessToken) {
    return <Badge tone="warning">No access token</Badge>;
  }
  return settings.lastError ? (
    <Badge tone="danger">Last attempt failed</Badge>
  ) : (
    <Badge tone="success">Ready</Badge>
  );
}
