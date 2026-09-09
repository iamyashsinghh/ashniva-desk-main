import type { ReportResult } from '@ashniva/types';

/**
 * RFC 4180 CSV with a UTF-8 BOM so spreadsheets open it correctly. Cells that a spreadsheet
 * would evaluate as formulas are prefixed with an apostrophe (CSV injection guard).
 */
export function toCsv(result: ReportResult): string {
  const lines = [result.columns.map((col) => escape(col.label)).join(',')];
  for (const row of result.rows) {
    lines.push(result.columns.map((col) => escape(row[col.key] ?? null)).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvFilename(result: ReportResult): string {
  const stamp = result.generatedAt.slice(0, 19).replace(/[:T]/g, '-');
  return `${result.type}-${stamp}.csv`;
}

function escape(value: string | number | boolean | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
