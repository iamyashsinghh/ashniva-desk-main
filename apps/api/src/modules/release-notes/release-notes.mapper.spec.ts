import { toPortalReleaseNote, toReleaseNoteDetail } from './release-notes.mapper';
import type { ReleaseNoteDetailRow } from './release-notes.repository';

/**
 * The mapper is the last thing between a stored release note and a client's screen, so what it
 * drops is tested directly rather than inferred from the type.
 */

const row = (over: Partial<ReleaseNoteDetailRow> = {}): ReleaseNoteDetailRow =>
  ({
    id: 'note-1',
    organizationId: 'org-provider',
    clientOrganizationId: 'org-client',
    projectId: 'proj-1',
    repositoryLinkId: null,
    version: '2026.09.1',
    releaseDate: new Date('2026-09-30T00:00:00Z'),
    status: 'PUBLISHED',
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    internalNotes: 'Rushed because the client escalated. Do not share.',
    clientSummary: 'September improvements.',
    generatedAt: new Date('2026-09-29T09:00:00Z'),
    createdById: 'user-1',
    submittedById: 'user-1',
    submittedAt: new Date('2026-09-29T10:00:00Z'),
    approvedById: 'user-2',
    approvedAt: new Date('2026-09-29T11:00:00Z'),
    publishedById: 'user-3',
    publishedAt: new Date('2026-09-30T08:00:00Z'),
    createdAt: new Date('2026-09-29T08:00:00Z'),
    updatedAt: new Date('2026-09-30T08:00:00Z'),
    deletedAt: null,
    project: { id: 'proj-1', code: 'ACME', name: 'Acme portal' },
    items: [
      {
        id: 'item-1',
        releaseNoteId: 'note-1',
        kind: 'TASK',
        source: 'GENERATED',
        refId: 'task-1',
        externalRef: null,
        label: 'Checkout total fixed',
        clientLabel: null,
        clientVisible: true,
        sortOrder: 0,
        createdAt: new Date('2026-09-29T09:00:00Z'),
      },
      {
        id: 'item-2',
        releaseNoteId: 'note-1',
        kind: 'CODE_ACTIVITY',
        source: 'GENERATED',
        refId: null,
        externalRef: 'pr-42',
        label: 'Refactor OrderTotalCalculator, drop legacy VAT hack',
        clientLabel: null,
        clientVisible: false,
        sortOrder: 10,
        createdAt: new Date('2026-09-29T09:00:00Z'),
      },
    ],
    history: [
      {
        id: 'hist-1',
        releaseNoteId: 'note-1',
        fromStatus: 'IN_REVIEW',
        toStatus: 'CHANGES_REQUESTED',
        note: 'Sam has not reviewed the pricing wording yet',
        changedById: 'user-2',
        createdAt: new Date('2026-09-29T10:30:00Z'),
        changedBy: { name: 'Priya Nair' },
      },
    ],
    ...over,
  }) as ReleaseNoteDetailRow;

describe('the client view', () => {
  it('carries no internal notes', () => {
    const portal = toPortalReleaseNote(row());
    expect(JSON.stringify(portal)).not.toContain('Do not share');
    expect(portal).not.toHaveProperty('internalNotes');
  });

  it('carries no approval trail', () => {
    // Who reviewed a note, who sent it back, and why, are all internal.
    const portal = toPortalReleaseNote(row());
    expect(JSON.stringify(portal)).not.toContain('Priya Nair');
    expect(JSON.stringify(portal)).not.toContain('pricing wording');
    expect(portal).not.toHaveProperty('history');
    expect(portal).not.toHaveProperty('approvedById');
  });

  it('drops an item marked not client-visible', () => {
    const portal = toPortalReleaseNote(row());
    expect(portal.items).toHaveLength(1);
    expect(JSON.stringify(portal.items)).not.toContain('legacy VAT hack');
  });

  it('shows the rewritten wording when an editor supplied one', () => {
    const source = row();
    source.items = source.items.map((item, index) =>
      index === 0 ? { ...item, clientLabel: 'Order totals now include shipping' } : item,
    );
    expect(toPortalReleaseNote(source).items[0]?.label).toBe('Order totals now include shipping');
  });

  it('falls back to the original label when there is no rewrite', () => {
    expect(toPortalReleaseNote(row()).items[0]?.label).toBe('Checkout total fixed');
  });

  it('exposes exactly the fields the portal type names, and no more', () => {
    // A regression guard: adding a field to the internal row must not silently widen this.
    expect(Object.keys(toPortalReleaseNote(row())).sort()).toEqual([
      'id',
      'items',
      'projectId',
      'publishedAt',
      'releaseDate',
      'summary',
      'version',
    ]);
  });
});

describe('the internal view', () => {
  it('keeps the internal notes and the approval trail', () => {
    const detail = toReleaseNoteDetail(row());
    expect(detail.internalNotes).toContain('Do not share');
    expect(detail.history[0]?.changedByName).toBe('Priya Nair');
  });

  it('keeps items the client cannot see, so an editor knows they are there', () => {
    expect(toReleaseNoteDetail(row()).items).toHaveLength(2);
  });

  it('renders dates as plain days, not timestamps', () => {
    const detail = toReleaseNoteDetail(row());
    expect(detail.releaseDate).toBe('2026-09-30');
    expect(detail.periodStart).toBe('2026-09-01');
  });
});
