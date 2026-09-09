import {
  type PortalProgressBlocker,
  type PortalProgressRelease,
  type PortalProjectProgress,
  type PortalTaskSummary,
} from '@ashniva/types';

import type { PortalReleaseRow } from './portal-progress.repository';
import {
  toPortalBlocker,
  toPortalRelease,
  toPortalTask,
  type PortalTaskRow,
} from './portal.mapper';

/**
 * Two kinds of assertion, because a leak has two shapes.
 *
 * The first is structural: the response types are checked at compile time for a field anything
 * internal could be assigned to. If somebody adds `blockedReason` to `PortalProgressBlocker`,
 * this file stops compiling — no test has to think to look for it.
 *
 * The second is behavioural: a row that arrives carrying internal columns — a widened `select`,
 * a spread from an internal shape — is passed through each mapper and the exact key set of the
 * result is asserted. The mapper is the last thing between a row and a client's browser.
 */

/** Everything Package 7c must never put in front of a client, by the name it has in the code. */
type ForbiddenField =
  | 'assignedTo'
  // Staff identity. A review found these reaching clients through `ClientUpdateSummary`, whose
  // `author` and `publishedBy` are full `UserRef`s and therefore carry an internal work email.
  | 'author'
  | 'publishedBy'
  | 'email'
  | 'assignedToId'
  | 'blockedReason'
  | 'estimateMinutes'
  | 'failureDescription'
  | 'failureReason'
  | 'internalNotes'
  | 'loggedMinutes'
  | 'notes'
  | 'organizationId'
  | 'reviewer'
  | 'reviewerId'
  | 'rollbackReason'
  | 'tester'
  | 'testerId'
  | 'timing'
  | 'workLogs';

/**
 * `true` only when the type — **or anything nested inside it** — has no property an internal value
 * could be mapped into.
 *
 * The first version of this checked `keyof T` only, which is why it passed while
 * `PortalProjectProgress.recentUpdates` was `ClientUpdateSummary[]` and every client was being
 * handed the work email of the developer who did the work. A top-level guard on a type whose
 * leaves are other types is a guard on the shape of the wrapper, not on what reaches the browser.
 */
type HasNoForbiddenField<T> = ForbiddenAnywhere<T> extends never ? true : false;

type ForbiddenAnywhere<T> =
  | Extract<keyof T, ForbiddenField>
  | (T extends readonly (infer E)[]
      ? ForbiddenAnywhere<E>
      : T extends object
        ? { [K in keyof T]-?: ForbiddenAnywhere<NonNullable<T[K]>> }[keyof T]
        : never);

const TASK_KEYS = [
  'completedAt',
  'dueDate',
  'id',
  'key',
  'priority',
  'status',
  'title',
  'updatedAt',
].sort();

const BLOCKER_KEYS = ['id', 'key', 'note', 'since', 'title', 'waitingOnYou'].sort();

const RELEASE_KEYS = ['id', 'publishedAt', 'releaseDate', 'summary', 'version'].sort();

function taskRow(over: Partial<PortalTaskRow> = {}): PortalTaskRow {
  return {
    id: 'task-1',
    number: 42,
    title: 'Invoice PDF export',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: new Date('2026-09-10T00:00:00.000Z'),
    completedAt: null,
    updatedAt: new Date('2026-09-07T11:30:00.000Z'),
    project: { code: 'ACME' },
    ...over,
  };
}

/** What a widened query would hand the mapper: the client-safe row plus everything it must not see. */
function leakyTaskRow(over: Partial<PortalTaskRow> = {}): PortalTaskRow {
  return {
    ...taskRow(over),
    assignedTo: { id: 'user-9', name: 'Ravi Kumar', email: 'ravi@ashniva.example' },
    assignedToId: 'user-9',
    blockedReason: 'Waiting on the payment sandbox credentials from ops',
    estimateMinutes: 480,
    organizationId: 'provider-1',
    workLogs: [{ minutes: 320 }],
  } as PortalTaskRow;
}

function releaseRow(over: Partial<PortalReleaseRow> = {}): PortalReleaseRow {
  return {
    id: 'note-1',
    version: '2026.09.1',
    releaseDate: new Date('2026-09-05T00:00:00.000Z'),
    publishedAt: new Date('2026-09-05T18:00:00.000Z'),
    clientSummary: 'Invoices now download as a single PDF.',
    ...over,
  };
}

describe('portal progress mappers', () => {
  it('leaves the response types no field an internal value could be assigned to', () => {
    const clean: [
      HasNoForbiddenField<PortalTaskSummary>,
      HasNoForbiddenField<PortalProgressBlocker>,
      HasNoForbiddenField<PortalProgressRelease>,
      HasNoForbiddenField<PortalProjectProgress>,
    ] = [true, true, true, true];
    expect(clean).toEqual([true, true, true, true]);
  });

  it('gives a task exactly the client-safe fields, whatever the row carries', () => {
    const mapped: Record<string, unknown> = { ...toPortalTask(leakyTaskRow()) };
    expect(Object.keys(mapped).sort()).toEqual(TASK_KEYS);
    expect(mapped.blockedReason).toBeUndefined();
    expect(mapped.estimateMinutes).toBeUndefined();
    expect(mapped.assignedTo).toBeUndefined();
    expect(mapped.workLogs).toBeUndefined();
    expect(JSON.stringify(mapped)).not.toContain('payment sandbox');
    expect(JSON.stringify(mapped)).not.toContain('Ravi Kumar');
  });

  it('translates the internal status into the one the client is shown', () => {
    // QA failed and a rollback both read as "in development": a client is told where the work is,
    // never that it broke.
    expect(toPortalTask(taskRow({ status: 'QA_FAILED' })).status).toBe('IN_DEVELOPMENT');
    expect(toPortalTask(taskRow({ status: 'ROLLBACK_REQUIRED' })).status).toBe('IN_DEVELOPMENT');
    expect(toPortalTask(taskRow({ status: 'BLOCKED' })).status).toBe('ASSIGNED');
    expect(toPortalTask(taskRow({ status: 'CLIENT_UAT' })).status).toBe('AWAITING_YOUR_APPROVAL');
  });

  it('builds a blocker with the published note and never the internal reason', () => {
    const mapped: Record<string, unknown> = {
      ...toPortalBlocker(
        leakyTaskRow({ status: 'BLOCKED' }),
        false,
        'We are waiting for your finance team to confirm the tax rates.',
      ),
    };
    expect(Object.keys(mapped).sort()).toEqual(BLOCKER_KEYS);
    expect(mapped.note).toBe('We are waiting for your finance team to confirm the tax rates.');
    expect(JSON.stringify(mapped)).not.toContain('payment sandbox');
  });

  it('says a blocker is waiting on the client only when it was told so', () => {
    expect(toPortalBlocker(taskRow({ status: 'CLIENT_UAT' }), true, null).waitingOnYou).toBe(true);
    expect(toPortalBlocker(taskRow({ status: 'BLOCKED' }), false, null).waitingOnYou).toBe(false);
  });

  it('leaves a blocker with no published note explained by nothing at all', () => {
    // A row carrying an internal reason and no note must come out empty, not fall back to it.
    // Silence is the correct answer here; the team's own words are the only permitted one.
    const mapped = toPortalBlocker(leakyTaskRow({ status: 'BLOCKED' }), false, null);
    expect(mapped.note).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain('payment sandbox');
  });

  it('gives a release exactly the client-safe fields, with no failure or rollback', () => {
    const leaky = {
      ...releaseRow(),
      internalNotes: 'Deploy order: migrations, workers, web. Watch the queue depth.',
      failureReason: 'Migration 042 timed out',
      rollbackReason: 'Checkout returned 500 for 4% of sessions',
      organizationId: 'provider-1',
    } as PortalReleaseRow;

    const mapped: Record<string, unknown> = { ...toPortalRelease(leaky) };
    expect(Object.keys(mapped).sort()).toEqual(RELEASE_KEYS);
    expect(mapped.failureReason).toBeUndefined();
    expect(mapped.rollbackReason).toBeUndefined();
    expect(mapped.internalNotes).toBeUndefined();
    expect(JSON.stringify(mapped)).not.toContain('Migration 042');
    expect(JSON.stringify(mapped)).not.toContain('Deploy order');
  });

  it('reports the release date as a plain day and keeps an empty summary null', () => {
    expect(toPortalRelease(releaseRow()).releaseDate).toBe('2026-09-05');
    expect(toPortalRelease(releaseRow({ clientSummary: null })).summary).toBeNull();
  });
});
