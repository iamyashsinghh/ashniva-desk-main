import type { ReleaseNoteDetail, ReleaseNoteSummary } from '@ashniva/types';

/** Release-note records for the tests. Imported only by `*.test.tsx` files. */

export function noteSummary(over: Partial<ReleaseNoteSummary> = {}): ReleaseNoteSummary {
  return {
    id: 'n1',
    projectId: 'p1',
    projectCode: 'ACM',
    clientOrganizationId: 'org-1',
    version: '2026.09.1',
    releaseDate: '2026-09-25',
    status: 'DRAFT',
    itemCount: 2,
    publishedAt: null,
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...over,
  };
}

export function noteDetail(over: Partial<ReleaseNoteDetail> = {}): ReleaseNoteDetail {
  return {
    ...noteSummary(),
    periodStart: null,
    periodEnd: null,
    internalNotes: 'Hotfix rolled into this one — do not mention the outage.',
    clientSummary: 'Faster checkout and clearer invoices.',
    generatedAt: null,
    items: [
      {
        id: 'i1',
        kind: 'TASK',
        source: 'GENERATED',
        refId: 't1',
        externalRef: null,
        label: 'ACM-142 checkout refactor',
        clientLabel: 'Checkout is faster',
        clientVisible: true,
        sortOrder: 0,
      },
      {
        id: 'i2',
        kind: 'MANUAL',
        source: 'MANUAL',
        refId: null,
        externalRef: null,
        label: 'Rotated the payment keys',
        clientLabel: null,
        clientVisible: false,
        sortOrder: 1,
      },
    ],
    history: [],
    createdAt: '2026-09-20T09:00:00.000Z',
    ...over,
  };
}
