import {
  NOTIFICATION_TYPE_GROUPS,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationType,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage, isOffline } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import type { IconName } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  isChannelEnabled,
  toggleKey,
  type PreferencesInput,
  type QuietHours,
} from './preference-options';
import { ChannelHeader, TypeRow } from './PreferenceRows';
import { QuietHoursSection } from './QuietHoursSection';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * What you are told about, on which channel, and when.
 *
 * The same settings as the web's preferences card, for the channels this deployment delivers on.
 * Each change saves on its own — a phone has no room for a form with a Save button below
 * twenty-seven rows, and the endpoint takes exactly the entries that changed.
 */

export const PREFERENCES_KEY = ['notifications', 'preferences'] as const;

const GROUP_ICONS: Record<string, IconName> = {
  Tasks: 'checkbox-outline',
  'Tickets and SLA': 'ticket-outline',
  'Support routing': 'git-network-outline',
  'Internal communication': 'chatbubbles-outline',
  'Approvals and change requests': 'thumbs-up-outline',
  Contracts: 'document-text-outline',
};

function without<T extends object>(record: T, keys: readonly string[]): T {
  const next = { ...record };
  for (const key of keys) {
    delete next[key as keyof T];
  }
  return next;
}

export function NotificationPreferencesScreen() {
  const theme = useTheme();
  const query = useResource<NotificationPreferences>(PREFERENCES_KEY, '/notifications/preferences');
  const save = useApiMutation<PreferencesInput, NotificationPreferences>({
    path: '/notifications/preferences',
    method: 'PUT',
    body: (input) => input,
    // Only the preferences: the inbox does not change because a switch moved.
    invalidate: [PREFERENCES_KEY],
  });
  // What this screen has just changed, over what the server last said. A failed save takes its
  // entry back out, so the control returns to the truth rather than showing an unsaved setting.
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [quiet, setQuiet] = useState<Partial<QuietHours>>({});
  const preferences = query.data ?? null;

  const setEntry = async (type: NotificationType, channel: NotificationChannel, on: boolean) => {
    const key = toggleKey(type, channel);
    setToggles((current) => ({ ...current, [key]: on }));
    if (!(await save.run({ entries: [{ type, channel, enabled: on }] }))) {
      setToggles((current) => without(current, [key]));
    }
  };

  const setQuietHours = async (patch: Partial<QuietHours>) => {
    setQuiet((current) => ({ ...current, ...patch }));
    if (!(await save.run(patch))) {
      setQuiet((current) => without(current, Object.keys(patch)));
    }
  };

  if (!preferences && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={isOffline(query.error)}
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

  const quietHours: QuietHours = {
    quietHoursEnabled: quiet.quietHoursEnabled ?? preferences.quietHoursEnabled,
    quietHoursStart: quiet.quietHoursStart ?? preferences.quietHoursStart,
    quietHoursEnd: quiet.quietHoursEnd ?? preferences.quietHoursEnd,
    timezone: quiet.timezone ?? preferences.timezone,
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {save.error ? (
          <Banner tone="danger" role="alert">
            {save.error}
          </Banner>
        ) : null}

        <QuietHoursSection
          value={quietHours}
          disabled={save.busy}
          onChange={(patch) => void setQuietHours(patch)}
        />

        {NOTIFICATION_TYPE_GROUPS.map((group) => (
          <Section
            key={group.label}
            title={group.label}
            icon={GROUP_ICONS[group.label] ?? 'notifications-outline'}
          >
            <View>
              <ChannelHeader />
              {group.types.map((type) => (
                <View key={type}>
                  <Divider />
                  <TypeRow
                    type={type}
                    disabled={save.busy}
                    isOn={(channel) =>
                      toggles[toggleKey(type, channel)] ??
                      isChannelEnabled(preferences.entries, type, channel)
                    }
                    onChange={(channel, on) => void setEntry(type, channel, on)}
                  />
                </View>
              ))}
            </View>
          </Section>
        ))}

        <AppText size="xs" tone="faint" align="center">
          These settings apply to every device you use. Push notifications reach this phone only
          when notifications are allowed for it on the Profile screen.
        </AppText>
      </ScrollView>
    </Screen>
  );
}
