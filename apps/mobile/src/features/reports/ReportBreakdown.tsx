import type { ReportResult } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip, ChipScroller } from '../../shared/components/chips';
import { Section } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { barsFor, defaultMeasure, measureColumns, type Bar } from './report-format';

const BAR_LIMIT = 8;

/**
 * One numeric column of the report as horizontal bars, largest first.
 *
 * Drawn with plain views rather than a chart library: a bar is a coloured box of a given width,
 * and a dependency for that would be weight the app carries for nothing. The measure is chosen
 * with chips, so any numeric column can be compared across rows.
 */
export function ReportBreakdown({ report }: { report: ReportResult }) {
  const theme = useTheme();
  const measures = measureColumns(report);
  const [chosen, setChosen] = useState<string | null>(null);
  // A new report type has different columns; fall back rather than keep a key it lacks.
  const measure =
    chosen && measures.some((column) => column.key === chosen) ? chosen : defaultMeasure(report);

  if (!measure || report.rows.length === 0) {
    return null;
  }
  const bars = barsFor(report, measure, BAR_LIMIT);

  return (
    <Section title="Breakdown" icon="bar-chart-outline">
      {measures.length > 1 ? (
        <ChipScroller>
          {measures.map((column) => (
            <Chip
              key={column.key}
              label={column.label}
              selected={column.key === measure}
              onPress={() => setChosen(column.key)}
            />
          ))}
        </ChipScroller>
      ) : null}
      <View style={{ gap: theme.spacing.md }}>
        {bars.map((bar, index) => (
          <BarRow key={`${bar.label}-${index}`} bar={bar} />
        ))}
      </View>
      {report.rows.length > BAR_LIMIT ? (
        <AppText size="xs" tone="faint">
          The {BAR_LIMIT} largest of {report.rows.length} rows.
        </AppText>
      ) : null}
    </Section>
  );
}

function BarRow({ bar }: { bar: Bar }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={`${bar.label}: ${bar.display}`} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText size="sm" numberOfLines={1} style={{ flex: 1 }}>
          {bar.label}
        </AppText>
        <AppText size="sm" weight="bold" tabular>
          {bar.display}
        </AppText>
      </View>
      <View
        style={{
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.pill,
          height: 10,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radius.pill,
            height: 10,
            // A zero still shows a sliver, so the row does not read as missing data.
            width: `${Math.max(bar.percent, bar.value > 0 ? 2 : 0.5)}%`,
          }}
        />
      </View>
    </View>
  );
}
