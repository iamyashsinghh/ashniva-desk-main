import type { ReportCell, ReportColumn } from '@ashniva/types';

import { formatDate, formatDateTime, formatMinutes } from '../../shared/lib/format';

/** Formats one cell by its column kind so every report renders the same way. */
export function formatCell(value: ReportCell, column: ReportColumn): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  switch (column.kind) {
    case 'minutes':
      return formatMinutes(Number(value));
    case 'percent':
      return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case 'number':
      return Number(value).toLocaleString();
    case 'money':
      return typeof value === 'number'
        ? value.toLocaleString(undefined, { minimumFractionDigits: 2 })
        : String(value);
    case 'date':
      return formatDate(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    case 'status':
      return String(value)
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/^\w/, (first) => first.toUpperCase());
    default:
      return String(value);
  }
}

/** Numeric kinds are right-aligned with tabular figures. */
export const RIGHT_ALIGNED_KINDS = new Set<ReportColumn['kind']>([
  'number',
  'percent',
  'minutes',
  'money',
]);
