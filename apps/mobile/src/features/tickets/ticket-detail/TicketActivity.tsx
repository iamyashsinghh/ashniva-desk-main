import type { TicketHistoryEntry } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { describeHistory } from '../ticket-display';

/** The ticket's status history, newest first, folded away until somebody asks for it. */
export function TicketActivity({ history }: { history: readonly TicketHistoryEntry[] }) {
  const theme = useTheme();
  const entries = [...history].reverse();
  return (
    <Section
      title="Activity"
      count={history.length}
      icon="time-outline"
      collapsible
      initiallyOpen={false}
    >
      {entries.length === 0 ? (
        <AppText size="sm" tone="muted">
          No activity yet.
        </AppText>
      ) : null}
      {entries.map((entry, index) => (
        <View key={entry.id} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ alignItems: 'center', width: 12 }}>
            <View
              style={{
                backgroundColor: index === 0 ? theme.colors.primary : theme.colors.borderStrong,
                borderRadius: 6,
                height: 12,
                marginTop: 3,
                width: 12,
              }}
            />
            {index < entries.length - 1 ? (
              <View
                style={{ backgroundColor: theme.colors.border, flex: 1, marginTop: 2, width: 2 }}
              />
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 2, paddingBottom: theme.spacing.sm }}>
            <AppText size="sm">
              <AppText size="sm" weight="bold">
                {entry.changedBy.name}
              </AppText>{' '}
              {describeHistory(entry)}
            </AppText>
            {entry.note ? (
              <AppText size="sm" tone="muted">
                {entry.note}
              </AppText>
            ) : null}
            <AppText size="xs" tone="faint">
              {formatDateTime(entry.createdAt)}
            </AppText>
          </View>
        </View>
      ))}
    </Section>
  );
}
