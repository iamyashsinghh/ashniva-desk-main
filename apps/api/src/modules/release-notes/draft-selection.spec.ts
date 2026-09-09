import {
  itemIdentity,
  reportingPeriod,
  selectDraftItems,
  type SourceCandidate,
} from './draft-selection';

const at = (iso: string) => new Date(iso);

const candidate = (over: Partial<SourceCandidate> = {}): SourceCandidate => ({
  kind: 'TASK',
  refId: 'task-1',
  externalRef: null,
  label: 'Checkout total fixed',
  clientVisible: true,
  occurredAt: at('2026-09-01T10:00:00Z'),
  ...over,
});

describe('selectDraftItems — what a client is allowed to read', () => {
  it('drops work that is not client-visible', () => {
    // The single rule keeping internal tasks and internal-only tickets out of a client document.
    const items = selectDraftItems([
      candidate({ refId: 'task-1', label: 'Client-visible work', clientVisible: true }),
      candidate({ refId: 'task-2', label: 'Internal refactor', clientVisible: false }),
      candidate({ kind: 'TICKET', refId: 'tkt-1', label: 'Internal ticket', clientVisible: false }),
    ]);

    expect(items.map((item) => item.label)).toEqual(['Client-visible work']);
  });

  it('never emits an item flagged not client-visible, whatever the input', () => {
    const items = selectDraftItems([candidate({ clientVisible: false })]);
    expect(items).toEqual([]);
    expect(selectDraftItems([candidate()]).every((item) => item.clientVisible)).toBe(true);
  });

  it('skips a candidate with an empty label rather than emitting a blank line', () => {
    expect(selectDraftItems([candidate({ label: '   ' })])).toEqual([]);
  });

  it('trims the label it does keep', () => {
    expect(selectDraftItems([candidate({ label: '  Spaced out  ' })])[0]?.label).toBe('Spaced out');
  });
});

describe('selectDraftItems — no duplicates', () => {
  it('collapses two candidates with the same identity', () => {
    const items = selectDraftItems([
      candidate({ refId: 'task-1' }),
      candidate({ refId: 'task-1', label: 'Same task, seen twice' }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('keeps a task and a code activity that merely describe the same work', () => {
    // Different kinds are genuinely different lines: one is the outcome, one is the change.
    const items = selectDraftItems([
      candidate({ kind: 'TASK', refId: 'task-1' }),
      candidate({ kind: 'CODE_ACTIVITY', refId: null, externalRef: 'pr-12', label: 'Merged #12' }),
    ]);
    expect(items).toHaveLength(2);
  });

  it('does not re-add anything already on the note, so regeneration is additive', () => {
    // A hand-edited or manually added line must survive a regenerate.
    const existing = [{ kind: 'TASK' as const, refId: 'task-1', externalRef: null }];
    const items = selectDraftItems(
      [candidate({ refId: 'task-1' }), candidate({ refId: 'task-2', label: 'New work' })],
      existing,
    );
    expect(items.map((item) => item.refId)).toEqual(['task-2']);
  });

  it('continues the sort order after the items already present', () => {
    const existing = [
      { kind: 'TASK' as const, refId: 'a', externalRef: null },
      { kind: 'TASK' as const, refId: 'b', externalRef: null },
    ];
    expect(selectDraftItems([candidate({ refId: 'c' })], existing)[0]?.sortOrder).toBe(20);
  });
});

describe('selectDraftItems — deterministic regeneration', () => {
  const pool: SourceCandidate[] = [
    candidate({ kind: 'CODE_ACTIVITY', refId: null, externalRef: 'pr-9', label: 'Merged #9' }),
    candidate({ kind: 'TICKET', refId: 'tkt-2', label: 'Printer issue resolved' }),
    candidate({ kind: 'TASK', refId: 'task-3', label: 'Loyalty tiers' }),
    candidate({ kind: 'CLIENT_UPDATE', refId: 'upd-1', label: 'September summary' }),
  ];

  it('produces the same document whatever order the rows arrived in', () => {
    const forward = selectDraftItems([...pool]);
    const reversed = selectDraftItems([...pool].reverse());
    expect(reversed).toEqual(forward);
  });

  it('groups kinds in reading order: tasks, tickets, updates, then development', () => {
    expect(selectDraftItems(pool).map((item) => item.kind)).toEqual([
      'TASK',
      'TICKET',
      'CLIENT_UPDATE',
      'CODE_ACTIVITY',
    ]);
  });

  it('orders within a kind by when it happened', () => {
    const items = selectDraftItems([
      candidate({ refId: 'late', label: 'Later', occurredAt: at('2026-09-05T00:00:00Z') }),
      candidate({ refId: 'early', label: 'Earlier', occurredAt: at('2026-09-02T00:00:00Z') }),
    ]);
    expect(items.map((item) => item.label)).toEqual(['Earlier', 'Later']);
  });

  it('breaks a tie on identity, so equal timestamps still sort the same every run', () => {
    const same = at('2026-09-03T00:00:00Z');
    const first = selectDraftItems([
      candidate({ refId: 'bbb', occurredAt: same }),
      candidate({ refId: 'aaa', occurredAt: same }),
    ]);
    const second = selectDraftItems([
      candidate({ refId: 'aaa', occurredAt: same }),
      candidate({ refId: 'bbb', occurredAt: same }),
    ]);
    expect(first.map((i) => i.refId)).toEqual(['aaa', 'bbb']);
    expect(second).toEqual(first);
  });
});

describe('itemIdentity', () => {
  it('distinguishes kind, row id and provider reference', () => {
    expect(itemIdentity({ kind: 'TASK', refId: '1', externalRef: null })).not.toBe(
      itemIdentity({ kind: 'TICKET', refId: '1', externalRef: null }),
    );
    expect(itemIdentity({ kind: 'CODE_ACTIVITY', refId: null, externalRef: 'a' })).not.toBe(
      itemIdentity({ kind: 'CODE_ACTIVITY', refId: null, externalRef: 'b' }),
    );
  });
});

describe('reportingPeriod', () => {
  const releaseDate = at('2026-09-30T00:00:00Z');

  it('starts where the previous published note ended, so releases tile without gaps', () => {
    const previous = at('2026-09-15T00:00:00Z');
    const period = reportingPeriod(releaseDate, previous);
    expect(period.start).toEqual(previous);
    // End is exclusive and covers the whole release day.
    expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('falls back to a fixed window rather than the whole project history', () => {
    const period = reportingPeriod(releaseDate, null, 30);
    expect(period.start?.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('honours a caller-supplied window', () => {
    expect(reportingPeriod(releaseDate, null, 7).start?.toISOString()).toBe(
      '2026-09-23T00:00:00.000Z',
    );
  });
});
