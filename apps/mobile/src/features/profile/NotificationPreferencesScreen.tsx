import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE_GROUPS,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPreferenceEntry,
  type NotificationPreferences,
  type NotificationType,
} from '@ashniva/types';
import { useState } from 'react';
import { RefreshControl, ScrollView, Switch, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Divider, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What you receive, and switching it off.
 *
 * In-app only, on purpose: in-app is the one channel this deployment sends on, so a phone screen
 * offering email and WhatsApp switches would be offering settings that change nothing. Each switch
 * saves on its own — a phone has no room for a form with a Save button at the bottom of
 * twenty-seven rows, and the endpoint takes exactly the entries that changed.
 */

const PREFERENCES_KEY = ['notifications', 'preferences'] as const;

interface PreferencesInput {
  entries?: NotificationPreferenceEntry[];
  quietHoursEnabled?: boolean;
}

function isEnabled(entries: NotificationPreferenceEntry[], type: NotificationType): boolean {
  const found = entries.find(
    (entry) => entry.type === type && entry.channel === NOTIFICATION_CHANNEL.IN_APP,
  );
  return found ? found.enabled : true;
}

export function NotificationPreferencesScreen() {
  const theme = useTheme();
  const query = useResource<NotificationPreferences>(PREFERENCES_KEY, '/notifications/preferences');
  const save = useApiMutation<PreferencesInput, NotificationPreferences>({
    path: '/notifications/preferences',
    method: 'PUT',
    body: (input) => input,
    // Only the preferences: what is already in the inbox does not change because a switch moved,
    // and re-fetching every page of it on each toggle would be a lot of network for nothing.
    invalidate: [PREFERENCES_KEY],
  });
  // What this screen has just changed, over what the server last said. A failed save takes its
  // entry back out, so the switch returns to the truth rather than lying about a saved setting.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const preferences = query.data ?? null;
  const error = query.error;

  const revert = (key: string) =>
    setLocal((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

  const setType = async (type: NotificationType, enabled: boolean) => {
    setLocal((current) => ({ ...current, [type]: enabled }));
    const saved = await save.run({
      entries: [{ type, channel: NOTIFICATION_CHANNEL.IN_APP, enabled }],
    });
    if (!saved) {
      revert(type);
    }
  };

  const setQuietHours = async (enabled: boolean) => {
    setLocal((current) => ({ ...current, quietHours: enabled }));
    const saved = await save.run({ quietHoursEnabled: enabled });
    if (!saved) {
      revert('quietHours');
    }
  };

  if (!preferences && error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(error)}
          offline={error instanceof Error && error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!preferences) {
    return (
      <Screen>
        <LoadingState label="Loading your settings" />
      </Screen>
    );
  }

  const quietHoursEnabled = local.quietHours ?? preferences.quietHoursEnabled;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {save.error ? (
          <Card>
            <AppText size="sm" tone="danger">
              {save.error}
            </AppText>
          </Card>
        ) : null}

        <Card>
          <SwitchRow
            label="Quiet hours"
            value={quietHoursEnabled}
            disabled={save.busy}
            onChange={(next) => void setQuietHours(next)}
          />
          {quietHoursEnabled ? (
            <AppText size="sm" tone="muted">
              Notifications raised between {preferences.quietHoursStart} and{' '}
              {preferences.quietHoursEnd} ({preferences.timezone}) wait until afterwards rather than
              being dropped. Five kinds do not wait at all: an SLA breach, a ticket escalated to
              you, a ticket with nobody to route it to, and a support call ringing or missed. Those
              reach you at any hour.
            </AppText>
          ) : (
            <AppText size="sm" tone="muted">
              Off — you can be notified at any hour.
            </AppText>
          )}
          <AppText size="xs" tone="faint">
            The window itself is set on the web, along with its timezone.
          </AppText>
        </Card>

        {NOTIFICATION_TYPE_GROUPS.map((group) => (
          <Card key={group.label}>
            <AppText weight="medium">{group.label}</AppText>
            {group.types.map((type) => (
              <View key={type} style={{ gap: theme.spacing.xs }}>
                <Divider />
                <SwitchRow
                  label={NOTIFICATION_TYPE_LABELS[type]}
                  value={local[type] ?? isEnabled(preferences.entries, type)}
                  disabled={save.busy}
                  onChange={(next) => void setType(type, next)}
                />
              </View>
            ))}
          </Card>
        ))}

        <AppText size="xs" tone="faint">
          These settings apply to every device you use.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function SwitchRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText size="sm">{label}</AppText>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        value={value}
      />
    </View>
  );
}
