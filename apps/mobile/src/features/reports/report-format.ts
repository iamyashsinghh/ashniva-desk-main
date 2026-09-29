import type { ReportCell, ReportColumn, ReportResult } from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';
import { formatDate, formatDateTime, formatMinutes } from '../../shared/format/format';

/**
 * Turning a report's generic columns and rows into things a phone can show.
 *
 * Every advanced report has the same shape — typed columns, rows of primitives, headline totals —
 * so one set of rules renders all ten. The web draws a table; a table does not fit a phone, so
 * here each row becomes a card (its text columns as the heading, the rest as label and value) and
 * one numeric column at a time is drawn as bars.
 */

/** Formats one cell by its column kind, the same way the web's table does. */
export function formatCell(value: ReportCell | undefined, column: ReportColumn): string {
  if (value === null || value === undefined || value === '') {
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
      return formatDate(String(value)) ?? String(value);
    case 'datetime':
      return formatDateTime(String(value)) ?? String(value);
    case 'status':
      return statusWords(String(value));
    default:
      return String(value);
  }
}

/** `IN_PROGRESS` → `In progress`. */
export function statusWords(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (first) => first.toUpperCase());
}

const DANGER_WORDS = ['BREACH', 'OVERDUE', 'EXPIRED', 'BLOCKED', 'REJECTED', 'DELAYED', 'FAILED'];
const SUCCESS_WORDS = ['COMPLETED', 'RESOLVED', 'CLOSED', 'APPROVED', 'DONE', 'MET', 'PAID'];
const WARNING_WORDS = ['RISK', 'HOLD', 'PENDING', 'EXPIRING', 'WAITING', 'REVIEW', 'REQUESTED'];

/**
 * A status cell's colour.
 *
 * A report's status column can hold any aggregate's statuses — a project's, a contract's, an SLA
 * outcome — so this reads the words rather than keeping ten tables that would drift from the
 * shared ones. It only colours a pill; the words are always shown.
 */
export function statusTone(value: string): PillTone {
  const upper = value.toUpperCase();
  if (DANGER_WORDS.some((word) => upper.includes(word))) {
    return 'danger';
  }
  if (WARNING_WORDS.some((word) => upper.includes(word))) {
    return 'warning';
  }
  if (SUCCESS_WORDS.some((word) => upper.includes(word))) {
    return 'success';
  }
  return 'info';
}

const MEASURE_KINDS = new Set<ReportColumn['kind']>(['number', 'percent', 'minutes', 'money']);

/** Columns worth drawing as bars: the numeric ones. */
export function measureColumns(report: ReportResult): ReportColumn[] {
  return report.columns.filter((column) => MEASURE_KINDS.has(column.kind));
}

/**
 * The measure a report opens on: a percentage when there is one (progress, SLA met), because
 * that is the headline a manager reads first; otherwise the first number.
 */
export function defaultMeasure(report: ReportResult): string | null {
  const measures = measureColumns(report);
  return (measures.find((column) => column.kind === 'percent') ?? measures[0])?.key ?? null;
}

/** What names a row: its first two text columns, e.g. a project's code and its name. */
export function rowLabel(report: ReportResult, row: ReportResult['rows'][number]): string {
  const parts = report.columns
    .filter((column) => column.kind === 'text')
    .slice(0, 2)
    .map((column) => row[column.key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(String);
  return parts.length > 0 ? parts.join(' · ') : 'Row';
}

export interface Bar {
  label: string;
  value: number;
  display: string;
  /** 0–100, the bar's length. */
  percent: number;
}

/**
 * The rows as bars for one measure, largest first.
 *
 * A percentage is drawn against 100 so "40%" looks like 40%; anything else is drawn against the
 * largest value shown, since there is no natural ceiling for a count of tickets.
 */
export function barsFor(report: ReportResult, measureKey: string, limit = 8): Bar[] {
  const column = report.columns.find((entry) => entry.key === measureKey);
  if (!column) {
    return [];
  }
  const values = report.rows
    .map((row) => ({ row, value: Number(row[measureKey] ?? 0) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const ceiling =
    column.kind === 'percent' ? 100 : Math.max(0, ...values.map((entry) => entry.value));
  return values.map(({ row, value }) => ({
    label: rowLabel(report, row),
    value,
    display: formatCell(value, column),
    percent: ceiling > 0 ? Math.min(100, (value / ceiling) * 100) : 0,
  }));
}

/** `YYYY-MM-DD` moved by whole days, without a time zone sneaking a day in or out. */
export function shiftIsoDate(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}
