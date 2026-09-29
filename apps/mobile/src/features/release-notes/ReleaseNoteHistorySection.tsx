import type { ReleaseNoteDetail } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { releaseNoteStatusLabel } from './release-note-display';

/** Who moved the note through review, and the period its generated lines were drawn from. */
export function ReleaseNoteHistorySection({ note }: { note: ReleaseNoteDetail }) {
  const theme = useTheme();
  return (
    <>
      <Section
        title="Approval history"
        icon="git-commit-outline"
        count={note.history.length}
        collapsible
        initiallyOpen={note.history.length <= 3}
      >
        {note.history.length === 0 ? (
          <AppText size="sm" tone="muted">
            Not yet submitted.
          </AppText>
        ) : (
          note.history.map((entry, index) => (
            <View key={entry.id} style={{ gap: 2 }}>
              {index > 0 ? (
                <View style={{ paddingBottom: theme.spacing.sm }}>
                  <Divider />
                </View>
              ) : null}
              <AppText size="sm" weight="medium">
                {releaseNoteStatusLabel(entry.toStatus)}
              </AppText>
              <AppText size="xs" tone="muted">
                {entry.changedByName} · {formatDateTime(entry.createdAt)}
              </AppText>
              {entry.note ? <AppText size="sm">{entry.note}</AppText> : null}
            </View>
          ))
        )}
      </Section>

      <Section title="Reporting period" icon="calendar-outline">
        <KeyValueRow
          label="Period"
          value={
            note.periodStart && note.periodEnd
              ? `${formatDate(note.periodStart)} to ${formatDate(note.periodEnd)}`
              : 'Set when generated'
          }
        />
        <KeyValueRow label="Last generated" value={formatDateTime(note.generatedAt) ?? '—'} />
      </Section>
    </>
  );
}
