import { toUatCommentRow, toUatRequestDetail, toUatRequestSummary } from './uat.mapper';
import type { UatRequestDetailRow } from './uat.repository';

/**
 * The point of these is the *key set*, not the values.
 *
 * A UAT response is the one thing in this module a client reads, so the test that matters is
 * "nothing else got in". Asserting the exact keys makes a widened select or a stray spread fail
 * here rather than in a client's browser.
 */

const SUMMARY_KEYS = [
  'checklist',
  'createdAt',
  'decidedAt',
  'decidedByName',
  'id',
  'note',
  'previewUrl',
  'releaseId',
  'status',
  'summaryPlain',
  'taskId',
];

const DETAIL_KEYS = [
  ...SUMMARY_KEYS,
  'clientName',
  'clientOrganizationId',
  'comments',
  'createdByName',
  'releaseVersion',
  'updatedAt',
].sort();

const COMMENT_KEYS = ['authorName', 'body', 'createdAt', 'fromClient', 'id'];

function row(over: Partial<UatRequestDetailRow> = {}): UatRequestDetailRow {
  return {
    id: 'uat-1',
    clientOrganizationId: 'client-1',
    createdById: 'user-priya',
    releaseId: 'release-1',
    taskId: null,
    summaryPlain: 'You can now download last month’s invoices as one PDF.',
    previewUrl: 'https://preview.example/invoices',
    checklist: ['Download a PDF', 'Check the totals'],
    status: 'PENDING',
    note: null,
    decidedAt: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    clientOrganization: { name: 'Acme Retail' },
    createdBy: { name: 'Priya Menon' },
    decidedBy: null,
    release: { version: '2026.09.1' },
    comments: [],
    ...over,
  };
}

describe('UAT mappers', () => {
  it('gives a summary exactly the client-safe fields', () => {
    expect(Object.keys(toUatRequestSummary(row())).sort()).toEqual([...SUMMARY_KEYS].sort());
  });

  it('gives a detail exactly the client-safe fields plus who and what it is about', () => {
    expect(Object.keys(toUatRequestDetail(row())).sort()).toEqual(DETAIL_KEYS);
  });

  it('does not carry a field the row happens to have picked up', () => {
    // What a widened `select` would look like arriving at the mapper. It has to be dropped here,
    // because the mapper is the last thing between the row and a client.
    const widened = {
      ...row(),
      stagingUrl: 'https://staging.internal.example',
      internalNotes: 'Do not show the client',
      organizationId: 'provider-1',
    } as UatRequestDetailRow;

    const mapped: Record<string, unknown> = { ...toUatRequestDetail(widened) };
    expect(mapped.stagingUrl).toBeUndefined();
    expect(mapped.internalNotes).toBeUndefined();
    expect(mapped.organizationId).toBeUndefined();
    expect(Object.keys(mapped).sort()).toEqual(DETAIL_KEYS);
  });

  it('renders dates as ISO strings and a missing decider as null', () => {
    const mapped = toUatRequestDetail(row());
    expect(mapped.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(mapped.decidedAt).toBeNull();
    expect(mapped.decidedByName).toBeNull();
    expect(mapped.releaseVersion).toBe('2026.09.1');
  });

  it('reads a comment’s side from the stored flag, not from the author', () => {
    const comment = toUatCommentRow({
      id: 'c-1',
      body: 'Does this include cancelled invoices?',
      fromClient: true,
      createdAt: new Date('2026-09-02T09:00:00.000Z'),
      author: { name: 'Anita Rao' },
    });
    expect(Object.keys(comment).sort()).toEqual([...COMMENT_KEYS].sort());
    expect(comment.fromClient).toBe(true);
    expect(comment.authorName).toBe('Anita Rao');
  });
});
