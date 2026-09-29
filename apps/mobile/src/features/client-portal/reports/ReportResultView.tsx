import type { ReportResult } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, MetaLine, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Card } from '../../../shared/components/primitives';
import { EmptyState } from '../../../shared/components/states';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { formatCell } from '../portal-display';

/**
 * A report laid out for a phone: the headline totals as tiles, then one card per row.
 *
 * The web draws a table; a table of eight columns does not fit a phone, so each row becomes a
 * card titled by its first column with the rest beneath it as label and value.
 */
export function ReportResultView({ report }: { report: ReportResult }) {
  const theme = useTheme();
  const [first, ...rest] = report.columns;

  return (
    <>
      {report.totals.length > 0 ? (
        <TileGrid>
          {report.totals.map((total) => (
            <StatTile key={total.label} label={total.label} value={total.value} />
          ))}
        </TileGrid>
      ) : null}
      <Section title={report.title} icon="bar-chart-outline" count={report.rows.length}>
        <MetaLine icon="time-outline">
          Generated {formatDateTime(report.generatedAt) ?? '—'}
        </MetaLine>
        {report.rows.length === 0 || !first ? (
          <EmptyState
            title="Nothing in this period"
            description="Try a wider date range."
            icon="calendar-outline"
          />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {report.rows.map((row, index) => (
              <Card key={`${index}-${String(row[first.key])}`}>
                <AppText weight="medium">{formatCell(row[first.key], first)}</AppText>
                {rest.map((column) => (
                  <KeyValueRow
                    key={column.key}
                    label={column.label}
                    value={formatCell(row[column.key], column)}
                  />
                ))}
              </Card>
            ))}
          </View>
        )}
      </Section>
    </>
  );
}
