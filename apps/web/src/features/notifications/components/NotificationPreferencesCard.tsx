import {
  ACTIVE_NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TYPE_GROUPS,
  NOTIFICATION_TYPE_LABELS,
  type NotificationChannel,
  type NotificationPreferenceEntry,
  type NotificationPreferences,
  type NotificationType,
} from '@ashniva/types';
import { Button, Card, FormField, Input, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useNotificationMutations, type NotificationPreferencesInput } from '../api';

const CHANNELS = Object.values(NOTIFICATION_CHANNEL);

function isEnabled(
  entries: NotificationPreferenceEntry[],
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  const found = entries.find((entry) => entry.type === type && entry.channel === channel);
  return found ? found.enabled : channel === NOTIFICATION_CHANNEL.IN_APP;
}

/** Every switch the screen shows, in a stable order, over the stored answers. */
function allEntries(stored: NotificationPreferenceEntry[]): NotificationPreferenceEntry[] {
  return NOTIFICATION_TYPE_GROUPS.flatMap((group) =>
    group.types.flatMap((type) =>
      CHANNELS.map((channel) => ({ type, channel, enabled: isEnabled(stored, type, channel) })),
    ),
  );
}

/**
 * What the person actually moved.
 *
 * Both lists come from `allEntries`, so they line up position for position. Saving used to send
 * all eighty-one switches on every click — eighty-one writes to record one toggle.
 */
function changedEntries(
  initial: NotificationPreferenceEntry[],
  current: NotificationPreferenceEntry[],
): NotificationPreferenceEntry[] {
  return current.filter((entry, index) => entry.enabled !== initial[index]?.enabled);
}

/** Per-event, per-channel switches plus quiet hours; only the changes are saved. */
export function NotificationPreferencesCard({
  preferences,
}: {
  preferences: NotificationPreferences;
}) {
  const { savePreferences } = useNotificationMutations();
  const [saved, setSaved] = useState(false);
  const { error, wrap } = useSubmitHandler(() => setSaved(true));
  const [initial] = useState(() => allEntries(preferences.entries));
  const [entries, setEntries] = useState<NotificationPreferenceEntry[]>(initial);
  const [quiet, setQuiet] = useState({
    quietHoursEnabled: preferences.quietHoursEnabled,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    timezone: preferences.timezone,
  });
  /** The save payload: the switches that moved, and the quiet-hours fields that changed. */
  const changes = (): NotificationPreferencesInput => {
    const payload: NotificationPreferencesInput = { entries: changedEntries(initial, entries) };
    if (quiet.quietHoursEnabled !== preferences.quietHoursEnabled) {
      payload.quietHoursEnabled = quiet.quietHoursEnabled;
    }
    if (quiet.quietHoursStart !== preferences.quietHoursStart) {
      payload.quietHoursStart = quiet.quietHoursStart;
    }
    if (quiet.quietHoursEnd !== preferences.quietHoursEnd) {
      payload.quietHoursEnd = quiet.quietHoursEnd;
    }
    if (quiet.timezone !== preferences.timezone) {
      payload.timezone = quiet.timezone;
    }
    return payload;
  };

  const setEntry = (type: NotificationType, channel: NotificationChannel, enabled: boolean) => {
    setSaved(false);
    setEntries((current) =>
      current.map((entry) =>
        entry.type === type && entry.channel === channel ? { ...entry, enabled } : entry,
      ),
    );
  };

  return (
    <div className="dashboard__grid">
      <Card title="What to tell me about">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                {CHANNELS.map((channel) => (
                  <th key={channel}>{NOTIFICATION_CHANNEL_LABELS[channel]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPE_GROUPS.map((group) => (
                <GroupRows
                  key={group.label}
                  label={group.label}
                  types={group.types}
                  entries={entries}
                  onChange={setEntry}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Email and WhatsApp are not switched on for this deployment, so those columns cannot be
          changed. In-app is what reaches you today.
        </p>
      </Card>
      <Card title="Quiet hours">
        <Switch
          checked={quiet.quietHoursEnabled}
          onChange={(quietHoursEnabled) => {
            setSaved(false);
            setQuiet({ ...quiet, quietHoursEnabled });
          }}
          label="Hold non-urgent notifications overnight"
          description="They are delivered when quiet hours end. SLA breaches are never held."
        />
        <div className="form-grid" style={{ marginTop: 12 }}>
          <FormField label="From">
            <Input
              type="time"
              value={quiet.quietHoursStart}
              onChange={(event) => setQuiet({ ...quiet, quietHoursStart: event.target.value })}
            />
          </FormField>
          <FormField label="Until">
            <Input
              type="time"
              value={quiet.quietHoursEnd}
              onChange={(event) => setQuiet({ ...quiet, quietHoursEnd: event.target.value })}
            />
          </FormField>
          <div className="form-grid__full">
            <FormField label="Timezone" hint="IANA name, e.g. Asia/Kolkata">
              <Input
                value={quiet.timezone}
                onChange={(event) => setQuiet({ ...quiet, timezone: event.target.value })}
              />
            </FormField>
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          {saved ? <span className="muted">Saved</span> : null}
          <Button
            variant="primary"
            loading={savePreferences.isPending}
            onClick={() => void wrap(() => savePreferences.mutateAsync(changes()))()}
          >
            Save preferences
          </Button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

interface GroupRowsProps {
  label: string;
  types: readonly NotificationType[];
  entries: NotificationPreferenceEntry[];
  onChange: (type: NotificationType, channel: NotificationChannel, enabled: boolean) => void;
}

function GroupRows({ label, types, entries, onChange }: GroupRowsProps) {
  return (
    <>
      <tr>
        <th colSpan={CHANNELS.length + 1} style={{ paddingTop: 12 }}>
          {label}
        </th>
      </tr>
      {types.map((type) => (
        <tr key={type}>
          <td>{NOTIFICATION_TYPE_LABELS[type]}</td>
          {CHANNELS.map((channel) => {
            const active = ACTIVE_NOTIFICATION_CHANNELS.includes(channel);
            return (
              <td key={channel}>
                <input
                  type="checkbox"
                  aria-label={`${NOTIFICATION_TYPE_LABELS[type]} via ${NOTIFICATION_CHANNEL_LABELS[channel]}`}
                  checked={isEnabled(entries, type, channel)}
                  disabled={!active}
                  onChange={(event) => onChange(type, channel, event.target.checked)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
