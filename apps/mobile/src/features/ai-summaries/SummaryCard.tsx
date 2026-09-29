import { AI_SUMMARY_TYPE_LABELS, type AiSummaryListRow } from '@ashniva/types';
import { memo } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { summaryIconTone, summaryStatusLabel, summaryStatusTone } from './summary-display';

export function summaryPeriod(row: Pick<AiSummaryListRow, 'periodStart' | 'periodEnd'>): string {
  return `${formatDate(row.periodStart) ?? row.periodStart} – ${formatDate(row.periodEnd) ?? row.periodEnd}`;
}

/** One summary in the list: what it is about, its period, and where it has reached in review. */
export const SummaryCard = memo(function SummaryCard({
  row,
  onPress,
}: {
  row: AiSummaryListRow;
  onPress: () => void;
}) {
  const theme = useTheme();
  const about = row.projectCode ?? row.subjectUserName ?? AI_SUMMARY_TYPE_LABELS[row.type];
  const status = summaryStatusLabel(row.status);

  return (
    <PressableCard
      onPress={onPress}
      icon="sparkles-outline"
      iconTone={summaryIconTone(row.status)}
      accessibilityLabel={`${row.title}, ${status}`}
      accessibilityHint="Opens the summary"
    >
      <AppText variant="label" tone="muted" uppercase numberOfLines={1}>
        {about}
      </AppText>
      <AppText weight="bold" numberOfLines={2}>
        {row.title}
      </AppText>
      <View style={{ gap: 2 }}>
        <MetaLine icon="pricetag-outline">{AI_SUMMARY_TYPE_LABELS[row.type]}</MetaLine>
        <MetaLine icon="calendar-outline">{summaryPeriod(row)}</MetaLine>
        <MetaLine icon="documents-outline">
          {row.sourceCount} {row.sourceCount === 1 ? 'source' : 'sources'} · updated{' '}
          {formatSince(row.updatedAt)}
        </MetaLine>
      </View>
      <View style={{ marginTop: theme.spacing.xs }}>
        <PillRow>
          <Pill label={status} tone={summaryStatusTone(row.status)} />
        </PillRow>
      </View>
    </PressableCard>
  );
});
