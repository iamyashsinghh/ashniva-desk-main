import { csvFilename, toCsv } from './csv';

const result = {
  type: 'ticket-volume' as const,
  title: 'Ticket volume',
  generatedAt: '2026-03-02T10:00:00.000Z',
  filters: {},
  columns: [
    { key: 'name', label: 'Name', kind: 'text' as const },
    { key: 'count', label: 'Count, total', kind: 'number' as const },
  ],
  rows: [
    { name: 'Plain', count: 3 },
    { name: 'Has "quotes", commas', count: null },
    { name: '=SUM(A1)', count: 0 },
    { name: 'line\nbreak', count: 1 },
  ],
  totals: [],
};

describe('csv export', () => {
  it('escapes quotes, commas, newlines and formula prefixes', () => {
    const csv = toCsv(result);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('\uFEFFName,"Count, total"');
    expect(lines[1]).toBe('Plain,3');
    expect(lines[2]).toBe('"Has ""quotes"", commas",');
    expect(lines[3]).toBe("'=SUM(A1),0");
    expect(lines[4]).toBe('"line\nbreak",1');
  });

  it('names the file after the report and time', () => {
    expect(csvFilename(result)).toBe('ticket-volume-2026-03-02-10-00-00.csv');
  });
});
