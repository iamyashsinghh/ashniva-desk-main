import {
  INTERNAL_CALL_FALLBACK_LABELS,
  RECORDING_PLAYBACK_SCOPE_LABELS,
  RECORDING_POLICY_LABELS,
  type CommunicationSettingsSummary,
  type InternalCallFallback,
  type RecordingPlaybackScope,
  type RecordingPolicy,
} from '@ashniva/types';
import { Alert, Button, Card, FormField, PageHeader, Select, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useCommunicationSettingsMutation, useCommunicationSettingsQuery } from '../api';

import '../communication.css';

/**
 * The organization's internal chat and calling switches.
 *
 * `GET` and `PUT /communication/settings` shipped with package 9b, behind
 * `conversation:settings-manage`, and had no screen — so the only way to turn internal chat off,
 * or to narrow who may play a recording, was to call the API by hand. Every one of these switches
 * is a decision somebody is accountable for, and each save is audited on the server.
 *
 * Chat and calling are separate on purpose: an organization may well want people talking in Desk
 * without Desk ringing their telephones.
 */
export function CommunicationSettingsPage() {
  const query = useCommunicationSettingsQuery();

  return (
    <div className="messaging-page">
      <PageHeader
        title="Internal communication"
        subtitle="Chat, calling and recording for conversations inside your team"
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? <Loaded settings={query.data} /> : null}
      </QueryState>
    </div>
  );
}

function Loaded({ settings }: { settings: CommunicationSettingsSummary }) {
  const save = useCommunicationSettingsMutation();
  const [form, setForm] = useState({
    chatEnabled: settings.chatEnabled,
    callingEnabled: settings.callingEnabled,
    recordingPolicy: settings.recordingPolicy,
    recordingPlaybackScope: settings.recordingPlaybackScope,
    internalCallFallback: settings.internalCallFallback,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onSave = async () => {
    setError(null);
    setNotice(null);
    try {
      await save.mutateAsync(form);
      setNotice('Settings saved');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? (
        <p className="chat-oversight" role="status">
          {notice}
        </p>
      ) : null}

      <Card title="What is switched on">
        <Switch
          checked={form.chatEnabled}
          onChange={(chatEnabled) => setForm({ ...form, chatEnabled })}
          label="Internal chat"
          description="Turning this off stops new messages. Existing threads stay readable, because a conversation somebody was part of is a record."
        />
        <Switch
          checked={form.callingEnabled}
          onChange={(callingEnabled) => setForm({ ...form, callingEnabled })}
          label="Internal calling"
          description="Off by default: telephony costs money and reaches people’s phones."
        />
      </Card>

      <Card title="Recordings">
        <FormField
          label="When calls are recorded"
          hint="Recording a colleague’s call is a decision about them, not a default."
        >
          <Select
            value={form.recordingPolicy}
            options={Object.entries(RECORDING_POLICY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(event) =>
              setForm({ ...form, recordingPolicy: event.target.value as RecordingPolicy })
            }
          />
        </FormField>
        <FormField
          label="Who may listen back"
          hint="Having been on a call earns the metadata, never the audio. Every playback is audited."
        >
          <Select
            value={form.recordingPlaybackScope}
            options={Object.entries(RECORDING_PLAYBACK_SCOPE_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(event) =>
              setForm({
                ...form,
                recordingPlaybackScope: event.target.value as RecordingPlaybackScope,
              })
            }
          />
        </FormField>
      </Card>

      <Card title="When an internal call reaches nobody">
        <FormField
          label="Fallback"
          hint="Never the support queue. A developer ringing a tester about their own work is a private conversation, and connecting it to an unrelated agent would be a disclosure."
        >
          <Select
            value={form.internalCallFallback}
            options={Object.entries(INTERNAL_CALL_FALLBACK_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(event) =>
              setForm({
                ...form,
                internalCallFallback: event.target.value as InternalCallFallback,
              })
            }
          />
        </FormField>
      </Card>

      <div className="detail-actions">
        <Button variant="primary" loading={save.isPending} onClick={() => void onSave()}>
          Save settings
        </Button>
        <span className="muted">
          {settings.updatedAt
            ? `Last changed ${formatDateTime(settings.updatedAt)}`
            : 'Never changed — these are the defaults.'}
        </span>
      </div>
    </>
  );
}
