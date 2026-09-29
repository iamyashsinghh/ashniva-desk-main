import type { ReportColumn, ReportResult } from '@ashniva/types';
import { memo } from 'react';

import { KeyValueRow } from '../../shared/components/data-display';
import { AppText, Card, Pill, PillRow } from '../../shared/components/primitives';
import { formatCell, rowLabel, statusTone } from './report-format';

type Row = ReportResult['rows'][number];

/**
 * One report row as a card: what the row is about as the heading, its statuses as pills, and every
 * other column as a label beside its value — the same cells the web's table shows, in one column.
 */
export const ReportRowCard = memo(function ReportRowCard({
  report,
  row,
}: {
  report: ReportResult;
  row: Row;
}) {
  const { statuses, details } = splitColumns(report.columns);
  const label = rowLabel(report, row);

  return (
    <Card>
      <AppText weight="bold" numberOfLines={2}>
        {label}
      </AppText>
      {statuses.length > 0 ? (
        <PillRow>
          {statuses
            .filter((column) => row[column.key] !== null && row[column.key] !== '')
            .map((column) => (
              <Pill
                key={column.key}
                label={formatCell(row[column.key], column)}
                tone={statusTone(String(row[column.key] ?? ''))}
              />
            ))}
        </PillRow>
      ) : null}
      {details.map((column) => (
        <KeyValueRow
          key={column.key}
          label={column.label}
          value={formatCell(row[column.key], column)}
        />
      ))}
    </Card>
  );
});

/** The first two text columns name the row; status columns become pills; the rest are details. */
function splitColumns(columns: ReportColumn[]) {
  const heading = columns.filter((column) => column.kind === 'text').slice(0, 2);
  const headingKeys = new Set(heading.map((column) => column.key));
  return {
    statuses: columns.filter((column) => column.kind === 'status'),
    details: columns.filter((column) => column.kind !== 'status' && !headingKeys.has(column.key)),
  };
}
