import type { IncidentTimelineEntry } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * The incident's own account of itself, newest first so the phone opens on what just happened.
 * Append-only: every entry but a note is written by the server when the thing it names happened.
 */
export function IncidentTimeline({ entries }: { entries: readonly IncidentTimelineEntry[] }) {
  const theme = useTheme();
  const newestFirst = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <Section
      title="Timeline"
      count={entries.length}
      icon="time-outline"
      collapsible
      action={<Pill label="Append-only" tone="neutral" />}
    >
      {newestFirst.map((entry, index) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          {index > 0 ? <Divider /> : null}
          <AppText size="sm">{entry.body}</AppText>
          <AppText size="xs" tone="faint">
            {entry.actor?.name ?? 'system'} · {formatDateTime(entry.occurredAt)}
          </AppText>
        </View>
      ))}
    </Section>
  );
}
