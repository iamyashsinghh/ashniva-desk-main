import {
  INTERNAL_CALL_FALLBACK_LABELS,
  PERMISSIONS,
  RECORDING_PLAYBACK_SCOPE_LABELS,
  RECORDING_POLICY_LABELS,
  type CommunicationSettingsInput,
  type CommunicationSettingsSummary,
  type InternalCallFallback,
  type RecordingPlaybackScope,
  type RecordingPolicy,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { formatDateTime } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import {
  FeedbackBanner,
  NoAccess,
  resourceGate,
  SettingsScroll,
  type Feedback,
} from '../shared/SettingsLayout';
import { SettingSwitch } from '../shared/SettingSwitch';

function options<T extends string>(labels: Record<T, string>) {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

const POLICIES = options<RecordingPolicy>(RECORDING_POLICY_LABELS);
const SCOPES = options<RecordingPlaybackScope>(RECORDING_PLAYBACK_SCOPE_LABELS);
const FALLBACKS = options<InternalCallFallback>(INTERNAL_CALL_FALLBACK_LABELS);

/**
 * Admin → Internal communication: whether chat and calling are on, how calls are recorded and who
 * may listen back, and where an unanswered internal call goes.
 *
 * Behind `conversation:settings-manage`. Chat and calling are separate switches on purpose: an
 * organization may want people talking in Desk without Desk ringing their phones.
 */
export function CommunicationSettingsScreen() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE);
  const query = useResource<CommunicationSettingsSummary>(
    ['conversations', 'settings'],
    '/communication/settings',
    { enabled: canManage },
  );

  if (!canManage) {
    return (
      <NoAccess description="Internal communication settings need the conversation settings permission." />
    );
  }
  const gate = resourceGate(query, 'Loading communication settings');
  if (gate || !query.data) {
    return gate;
  }
  return (
    <CommunicationForm
      settings={query.data}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}

function CommunicationForm({
  settings,
  refreshing,
  onRefresh,
}: {
  settings: CommunicationSettingsSummary;
  refreshing: boolean;
  onRefresh: () => unknown;
}) {
  const [form, setForm] = useState<Required<CommunicationSettingsInput>>({
    chatEnabled: settings.chatEnabled,
    callingEnabled: settings.callingEnabled,
    recordingPolicy: settings.recordingPolicy,
    recordingPlaybackScope: settings.recordingPlaybackScope,
    internalCallFallback: settings.internalCallFallback,
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const save = useApiMutation<CommunicationSettingsInput, CommunicationSettingsSummary>({
    path: '/communication/settings',
    method: 'PUT',
    body: (input) => input,
    invalidate: [['conversations']],
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSave = async () => {
    setFeedback(null);
    if (await save.run(form)) {
      setFeedback({ tone: 'success', message: 'Settings saved.' });
    }
  };

  return (
    <SettingsScroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          label="Save settings"
          icon="checkmark"
          loading={save.busy}
          onPress={() => void onSave()}
          style={{ flex: 1 }}
        />
      }
    >
      <FeedbackBanner feedback={feedback} />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
      <Section title="What is switched on" icon="toggle-outline">
        <SettingSwitch
          label="Internal chat"
          description="Turning this off stops new messages. Existing threads stay readable, because a conversation somebody was part of is a record."
          value={form.chatEnabled}
          onChange={(value) => set('chatEnabled', value)}
        />
        <SettingSwitch
          label="Internal calling"
          description="Off by default: telephony costs money and reaches people’s phones."
          value={form.callingEnabled}
          onChange={(value) => set('callingEnabled', value)}
        />
      </Section>
      <Section title="Recordings" icon="mic-outline">
        <SelectField
          label="When calls are recorded"
          hint="Recording a colleague’s call is a decision about them, not a default."
          options={POLICIES}
          value={[form.recordingPolicy]}
          onChange={(ids) => ids[0] && set('recordingPolicy', ids[0])}
        />
        <SelectField
          label="Who may listen back"
          hint="Having been on a call earns the metadata, never the audio. Every playback is audited."
          options={SCOPES}
          value={[form.recordingPlaybackScope]}
          onChange={(ids) => ids[0] && set('recordingPlaybackScope', ids[0])}
        />
      </Section>
      <Section title="When an internal call reaches nobody" icon="call-outline">
        <SelectField
          label="Fallback"
          hint="Never the support queue. A developer ringing a tester about their own work is a private conversation, and connecting it to an unrelated agent would be a disclosure."
          options={FALLBACKS}
          value={[form.internalCallFallback]}
          onChange={(ids) => ids[0] && set('internalCallFallback', ids[0])}
        />
      </Section>
      <AppText size="xs" tone="faint">
        {settings.updatedAt
          ? `Last changed ${formatDateTime(settings.updatedAt)}`
          : 'Never changed — these are the defaults.'}
      </AppText>
    </SettingsScroll>
  );
}
