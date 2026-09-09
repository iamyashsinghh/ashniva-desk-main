import type { EmailEncryption, EmailSettings } from '@ashniva/types';
import { Alert, Badge, Button, Card, PageHeader } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useEmailMutations, useEmailSettingsQuery } from '../api';
import { EmailServerForm, type EmailForm } from '../components/EmailServerForm';
import { EmailTemplateMap } from '../components/EmailTemplateMap';
import { MessageHistory } from '../components/MessageHistory';

import '../messaging.css';

/** SMTP configuration, connection status, a test send, and what each event will email. */
export function EmailSettingsPage() {
  const query = useEmailSettingsQuery();

  return (
    <div className="messaging-page">
      <PageHeader
        title="Email"
        subtitle="The server transactional email is sent through, and what has gone out"
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

function Loaded({ settings }: { settings: EmailSettings | null }) {
  const { save, testConnection, sendTest } = useEmailMutations();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<EmailForm>({
    senderName: settings?.senderName ?? '',
    senderEmail: settings?.senderEmail ?? '',
    replyTo: settings?.replyTo ?? '',
    host: settings?.host ?? '',
    port: String(settings?.port ?? 587),
    encryption: settings?.encryption ?? ('STARTTLS' as EmailEncryption),
    username: settings?.username ?? '',
    // Always blank: the stored password cannot be read back, and leaving it empty keeps it.
    password: '',
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
          senderName: form.senderName.trim(),
          senderEmail: form.senderEmail.trim(),
          replyTo: form.replyTo.trim() || undefined,
          host: form.host.trim(),
          port: Number(form.port),
          encryption: form.encryption,
          username: form.username.trim() || undefined,
          // Sent only when the field was filled in, so saving does not clear a stored password.
          password: form.password || undefined,
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
            <p className="messaging-status__error">
              Last error: {settings.lastError}
              {settings.lastErrorAt ? ` (${formatDateTime(settings.lastErrorAt)})` : ''}
            </p>
          ) : null}
        </div>
        <div className="detail-actions">
          <Button
            loading={testConnection.isPending}
            disabled={!settings}
            disabledReason="Save the settings first"
            onClick={() =>
              void run(async () => {
                const result = await testConnection.mutateAsync();
                if (!result.ok) {
                  // A failed test is a failure, so it reads as an error rather than a notice.
                  throw new Error(result.message);
                }
                setNotice(result.message);
              })
            }
          >
            Test connection
          </Button>
          <Button
            loading={sendTest.isPending}
            disabled={!settings}
            disabledReason="Save the settings first"
            onClick={() =>
              void run(async () => {
                const result = await sendTest.mutateAsync();
                setNotice(result.message);
              })
            }
            title="Sends to your own address, and nobody else’s"
          >
            Send a test to myself
          </Button>
        </div>
        {notice ? <p className="messaging-notice">{notice}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Card>

      <EmailServerForm
        form={form}
        settings={settings}
        saving={save.isPending}
        onChange={setForm}
        onSave={onSave}
      />
      <EmailTemplateMap />
      <MessageHistory channel="EMAIL" />
    </>
  );
}

function StatusBadge({ settings }: { settings: EmailSettings | null }) {
  if (!settings) {
    return <Badge tone="neutral">Not set up</Badge>;
  }
  if (!settings.enabled) {
    return <Badge tone="warning">Turned off</Badge>;
  }
  return settings.lastError ? (
    <Badge tone="danger">Last attempt failed</Badge>
  ) : (
    <Badge tone="success">Ready</Badge>
  );
}
