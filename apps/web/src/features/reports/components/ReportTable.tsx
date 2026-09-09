import type { ReportResult } from '@ashniva/types';
import { EmptyState } from '@ashniva/ui';

import { formatCell, RIGHT_ALIGNED_KINDS } from '../report-format';

export function ReportTable({ report }: { report: ReportResult }) {
  if (report.rows.length === 0) {
    return <EmptyState title="No rows for these filters" />;
  }
  return (
    <div className="table-wrap">
      <table className="table" aria-label={report.title}>
        <thead>
          <tr>
            {report.columns.map((column) => (
              <th
                key={column.key}
                style={RIGHT_ALIGNED_KINDS.has(column.kind) ? { textAlign: 'right' } : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={index}>
              {report.columns.map((column) => (
                <td
                  key={column.key}
                  style={
                    RIGHT_ALIGNED_KINDS.has(column.kind)
                      ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
                      : undefined
                  }
                >
                  {formatCell(row[column.key] ?? null, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
