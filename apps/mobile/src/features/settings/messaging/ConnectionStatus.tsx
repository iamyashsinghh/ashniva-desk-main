import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { channelStatus, type ChannelHealth } from './channel-status';

/** Whether the channel works, when it last did, and why it last did not — with the test actions. */
export function ConnectionStatus({
  settings,
  blocker,
  children,
}: {
  settings: ChannelHealth | null;
  blocker?: string | null;
  /** The test buttons, left out for somebody who may only read. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const status = channelStatus(settings, blocker);
  return (
    <Section title="Connection status" icon="pulse-outline">
      <Pill label={status.label} tone={status.tone} />
      <AppText size="sm" tone="muted">
        {settings?.lastSuccessAt
          ? `Last successful send ${formatDateTime(settings.lastSuccessAt)}`
          : 'Nothing has been sent yet.'}
      </AppText>
      {settings?.lastError ? (
        <AppText size="sm" tone="danger">
          Last error: {settings.lastError}
          {settings.lastErrorAt ? ` (${formatDateTime(settings.lastErrorAt)})` : ''}
        </AppText>
      ) : null}
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {children}
        </View>
      ) : null}
    </Section>
  );
}
