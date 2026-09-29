import type { ReleaseDetail } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { releaseStatusLabel } from './release-display';

/** The dates that say where the release got to, and who took it there. */
export function ReleaseTimelineSection({ release }: { release: ReleaseDetail }) {
  const at = (value: string | null) => formatDateTime(value) ?? '—';
  return (
    <Section title="Timeline" icon="time-outline">
      <KeyValueRow label="Scheduled" value={at(release.scheduledFor)} />
      <KeyValueRow label="Published" value={at(release.publishedAt)} />
      <KeyValueRow label="Published by" value={release.publishedByName ?? '—'} />
      <KeyValueRow label="Verified live" value={at(release.verifiedAt)} />
      <KeyValueRow
        label="Rolled back"
        value={at(release.rolledBackAt)}
        {...(release.rolledBackAt ? { tone: 'danger' as const } : {})}
      />
      <KeyValueRow label="Created" value={at(release.createdAt)} />
    </Section>
  );
}

/**
 * Every status the release has been through. Folded by default: it answers "how did it get here",
 * which is asked far less often than "what is stopping it".
 */
export function ReleaseHistorySection({ release }: { release: ReleaseDetail }) {
  const theme = useTheme();
  return (
    <Section
      title="History"
      icon="git-commit-outline"
      count={release.history.length}
      collapsible
      initiallyOpen={false}
    >
      {release.history.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has happened to this release yet.
        </AppText>
      ) : (
        release.history.map((entry, index) => (
          <View key={entry.id} style={{ gap: 2 }}>
            {index > 0 ? (
              <View style={{ paddingBottom: theme.spacing.sm }}>
                <Divider />
              </View>
            ) : null}
            <AppText size="sm" weight="medium">
              {entry.fromStatus ? `${releaseStatusLabel(entry.fromStatus)} → ` : ''}
              {releaseStatusLabel(entry.toStatus)}
            </AppText>
            <AppText size="xs" tone="muted">
              {entry.changedByName} · {formatDateTime(entry.createdAt)}
            </AppText>
            {entry.note ? <AppText size="sm">{entry.note}</AppText> : null}
          </View>
        ))
      )}
    </Section>
  );
}
