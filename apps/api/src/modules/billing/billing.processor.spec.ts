import { BillingProcessor } from './billing.processor';
import { Decimal } from './money';
import type { InvoiceDetailRow } from './billing.repository';

/**
 * The daily sweep, and what it tells a client.
 *
 * Both passes select a batch and then act on it row by row, so every message is sent against a
 * row read after the selection — and, in the overdue pass, after a conditional write that may
 * have matched nothing. A payment landing anywhere in that window makes the message untrue, and
 * the client is the one who receives it. These tests are about that window, not about the query.
 */

const NOW = new Date('2026-09-06T01:30:00.000Z');

function invoice(over: Partial<InvoiceDetailRow> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    clientOrganizationId: 'client-1',
    numberLabel: 'INV/2026-27/0007',
    status: 'ISSUED',
    dueDate: new Date('2026-08-01T00:00:00.000Z'),
    balanceDue: new Decimal('118000.00'),
    ...over,
  } as InvoiceDetailRow;
}

/**
 * A repository whose successive reads of a row can differ — which is the whole point.
 *
 * Each candidate carries the rows `findDetail` returns in order; the last one repeats. So
 * `[owing, paid]` is "the batch saw it owing, the read after the write sees it settled", and a
 * single-element list is a row nothing happened to.
 */
function harness(options: {
  overdue?: (InvoiceDetailRow | null)[][];
  dueSoon?: (InvoiceDetailRow | null)[][];
  /** Whether the conditional ISSUED → OVERDUE write matched. */
  transitioned?: boolean;
}) {
  const overdueRows = options.overdue ?? [];
  const dueSoonRows = options.dueSoon ?? [];
  const transitions: string[] = [];
  const sent: { kind: 'overdue' | 'due-soon'; id: string; balanceDue: string }[] = [];

  const sequences = new Map<string, (InvoiceDetailRow | null)[]>();
  const reads = new Map<string, number>();
  const candidates = (lists: (InvoiceDetailRow | null)[][]) =>
    lists.map((list) => {
      const first = list[0];
      if (!first) {
        throw new Error('A candidate list must start with a row');
      }
      sequences.set(first.id, list);
      return { id: first.id, organizationId: first.organizationId };
    });

  const overdueCandidates = candidates(overdueRows);
  const dueSoonCandidates = candidates(dueSoonRows);

  const repository = {
    overdueCandidates: () => Promise.resolve(overdueCandidates),
    dueSoon: () => Promise.resolve(dueSoonCandidates),
    findDetail: (_organizationId: string, id: string) => {
      const sequence = sequences.get(id) ?? [];
      const index = reads.get(id) ?? 0;
      reads.set(id, index + 1);
      return Promise.resolve(sequence[Math.min(index, sequence.length - 1)] ?? null);
    },
    transitionStatus: (id: string) => {
      transitions.push(id);
      return Promise.resolve(options.transitioned ?? true);
    },
  };

  const notifications = {
    invoiceOverdue: (row: InvoiceDetailRow) => {
      sent.push({ kind: 'overdue', id: row.id, balanceDue: row.balanceDue.toFixed(2) });
      return Promise.resolve();
    },
    paymentDueSoon: (row: InvoiceDetailRow) => {
      sent.push({ kind: 'due-soon', id: row.id, balanceDue: row.balanceDue.toFixed(2) });
      return Promise.resolve();
    },
  };

  const processor = new BillingProcessor(
    { upsertJobScheduler: () => Promise.resolve() } as never,
    repository as never,
    notifications as never,
    { runAsSystem: <T>(fn: () => Promise<T>) => fn() } as never,
    { register: () => Promise.resolve() } as never,
    { setContext: () => {}, warn: () => {} } as never,
  );

  return { processor, sent, transitions };
}

describe('the overdue sweep', () => {
  it('chases an invoice that is still owing', async () => {
    const { processor, sent, transitions } = harness({ overdue: [[invoice()]] });

    const result = await processor.sweep(NOW);

    expect(transitions).toEqual(['inv-1']);
    expect(sent).toEqual([{ kind: 'overdue', id: 'inv-1', balanceDue: '118000.00' }]);
    expect(result.overdue).toBe(1);
  });

  it('does not chase a client who paid between the batch and the write', async () => {
    // The conditional write matches nothing here — which is right — but the notification used to
    // go out anyway, built from the row read before it.
    const { processor, sent } = harness({
      overdue: [[invoice(), invoice({ status: 'PAID', balanceDue: new Decimal('0.00') })]],
      transitioned: false,
    });

    const result = await processor.sweep(NOW);

    expect(sent).toEqual([]);
    expect(result.overdue).toBe(0);
  });

  it('quotes the balance as it stands after the write, not before', async () => {
    // A part payment, not a settlement: the invoice is still overdue and still chased, but for
    // what is actually left.
    const { processor, sent } = harness({
      overdue: [
        [invoice(), invoice({ status: 'PARTIALLY_PAID', balanceDue: new Decimal('18000.00') })],
      ],
    });

    await processor.sweep(NOW);

    expect(sent).toEqual([{ kind: 'overdue', id: 'inv-1', balanceDue: '18000.00' }]);
  });

  it('stays quiet about an invoice withdrawn mid-sweep', async () => {
    for (const status of ['CANCELLED', 'VOID'] as const) {
      const { processor, sent } = harness({
        overdue: [[invoice(), invoice({ status, balanceDue: new Decimal('118000.00') })]],
        transitioned: false,
      });
      await processor.sweep(NOW);
      expect(sent).toEqual([]);
    }
  });

  it('stays quiet about an invoice deleted mid-sweep', async () => {
    const { processor, sent } = harness({
      overdue: [[invoice(), null]],
      transitioned: false,
    });
    await processor.sweep(NOW);
    expect(sent).toEqual([]);
  });
});

describe('the due-soon reminder', () => {
  it('reminds a client with something outstanding', async () => {
    const { processor, sent } = harness({
      dueSoon: [[invoice({ id: 'inv-2', dueDate: new Date('2026-09-08T00:00:00.000Z') })]],
    });

    const result = await processor.sweep(NOW);

    expect(sent).toEqual([{ kind: 'due-soon', id: 'inv-2', balanceDue: '118000.00' }]);
    expect(result.dueSoon).toBe(1);
  });

  it('does not remind a client who has already paid', async () => {
    // One read only on this path, so the settled row is what the reminder would be built from.
    const { processor, sent } = harness({
      dueSoon: [[invoice({ id: 'inv-2', status: 'PAID', balanceDue: new Decimal('0.00') })]],
    });

    const result = await processor.sweep(NOW);

    expect(sent).toEqual([]);
    expect(result.dueSoon).toBe(0);
  });
});
