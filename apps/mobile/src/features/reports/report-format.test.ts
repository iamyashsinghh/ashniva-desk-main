import {
  barsFor,
  defaultMeasure,
  formatCell,
  rowLabel,
  shiftIsoDate,
  statusTone,
} from './report-format';
import { projectProgressReport } from './report-test-data';

describe('formatting a cell by its column kind', () => {
  it('writes minutes, percentages, statuses and blanks the way the web does', () => {
    expect(formatCell(150, { key: 'm', label: 'Time', kind: 'minutes' })).toBe('2 h 30 min');
    expect(formatCell(42.5, { key: 'p', label: 'Done', kind: 'percent' })).toBe('42.5%');
    expect(formatCell('IN_PROGRESS', { key: 's', label: 'Status', kind: 'status' })).toBe(
      'In progress',
    );
    expect(formatCell(true, { key: 'b', label: 'Billable', kind: 'text' })).toBe('Yes');
    expect(formatCell(null, { key: 'x', label: 'X', kind: 'number' })).toBe('—');
  });
});

describe('the breakdown', () => {
  const report = projectProgressReport();

  it('opens on the percentage, and names a row by its text columns', () => {
    expect(defaultMeasure(report)).toBe('progressPercent');
    expect(rowLabel(report, report.rows[0]!)).toBe('ACM · Acme portal');
  });

  it('draws a percentage against 100 and a count against the largest value, largest first', () => {
    expect(barsFor(report, 'progressPercent').map((bar) => [bar.label, bar.percent])).toEqual([
      ['BLU · Blue app', 75],
      ['ACM · Acme portal', 40],
    ]);
    expect(barsFor(report, 'tasks').map((bar) => bar.percent)).toEqual([100, 40]);
  });
});

it('colours statuses by what they say', () => {
  expect(statusTone('BREACHED')).toBe('danger');
  expect(statusTone('AT_RISK')).toBe('warning');
  expect(statusTone('COMPLETED')).toBe('success');
  expect(statusTone('ACTIVE')).toBe('info');
});

it('moves a date by whole days across a month end', () => {
  expect(shiftIsoDate('2026-10-01', -1)).toBe('2026-09-30');
  expect(shiftIsoDate('2026-09-28', -13)).toBe('2026-09-15');
});
