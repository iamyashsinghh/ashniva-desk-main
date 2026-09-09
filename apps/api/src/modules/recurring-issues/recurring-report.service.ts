import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  OPEN_PROBLEM_STATUSES,
  PRIORITY_LABELS,
  RECURRING_GROUP_BY,
  crossesDuplicateThreshold,
  type AuthenticatedUser,
  type Priority,
  type ProblemStatus,
  type RecurringGroupBy,
  type RecurringGroupRow,
  type RecurringReport,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { ProblemStatus as PrismaProblemStatus } from '../../generated/prisma/client';
import { ProblemLinkingService } from '../problems/problem-linking.service';
import { problemKey } from '../problems/problems.mapper';
import { ProblemsRepository } from '../problems/problems.repository';
import { DEFAULT_WINDOW_DAYS, type RecurringReportQueryDto } from './dto/similarity.dto';
import { RecurringReportRepository, type RecurringGroupField } from './recurring-report.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which ticket column each of the four approved groupings counts by. */
const GROUP_FIELDS: Record<RecurringGroupBy, RecurringGroupField> = {
  product: 'productId',
  module: 'module',
  version: 'productVersion',
  // Severity on a ticket is its priority; there is deliberately no second four-level scale.
  severity: 'priority',
};

/** What a row is called when the tickets in it named nothing. */
const UNSPECIFIED: Record<RecurringGroupBy, string> = {
  product: 'No product',
  module: 'No module',
  version: 'No version given',
  severity: 'No severity',
};

type GroupCount = { key: string | null; count: number };

/**
 * The most rows the report will return.
 *
 * `productVersion` is free text: a client types it, or a machine integration posts one, and an
 * integration that sends a build hash per ticket produces a group per ticket. The screen is read
 * top-down and nobody scrolls past the worst few, so the cap costs a reader nothing and keeps the
 * response — and the per-row work behind it — bounded whatever a client puts in the field.
 */
export const MAX_RECURRING_ROWS = 200;

/** An open problem as the report lists it, once, rather than re-derived per row. */
type ProblemRef = { id: string; key: string; status: ProblemStatus };

/** The open problems a group's rows should show, keyed by that group's own value. */
type ProblemsByKey = Map<string, ProblemRef[]>;

/** An open problem as the repository hands it over. */
interface OpenProblemRow {
  id: string;
  number: number;
  status: string;
  productId: string | null;
  module: string | null;
  severity: string;
  versions: string[];
}

/**
 * "Which faults keep coming back, and to how many different clients?"
 *
 * Every number on this screen is an aggregate the database computed. Counting in the application
 * would mean reading every ticket of every project to answer a page nobody leaves open, and the
 * one number that matters — distinct clients — would still have to be a set.
 */
@Injectable()
export class RecurringReportService {
  constructor(
    private readonly recurring: RecurringReportRepository,
    private readonly problems: ProblemsRepository,
    private readonly linking: ProblemLinkingService,
  ) {}

  async report(actor: AuthenticatedUser, query: RecurringReportQueryDto): Promise<RecurringReport> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The recurring-issues report is internal');
    }
    const groupBy = query.by ?? RECURRING_GROUP_BY.MODULE;
    const field = GROUP_FIELDS[groupBy];
    const windowDays = query.windowDays ?? DEFAULT_WINDOW_DAYS;
    const filter = {
      organizationId: actor.organizationId,
      projectId: query.projectId,
      since: new Date(Date.now() - windowDays * DAY_MS),
    };

    const [totals, pairs, products, openProblems] = await Promise.all([
      this.recurring.countByGroup(field, filter),
      this.recurring.countByGroupAndClient(field, filter),
      groupBy === RECURRING_GROUP_BY.PRODUCT
        ? this.recurring.findProducts(actor.organizationId)
        : Promise.resolve([]),
      this.problems.findOpen(actor.organizationId, [
        ...OPEN_PROBLEM_STATUSES,
      ] as PrismaProblemStatus[]),
    ]);

    const threshold = await this.linking.thresholdFor(
      actor.organizationId,
      query.projectId ?? null,
    );
    const productNames = new Map(products.map((product) => [product.id, product.name]));
    const clientsByKey = new Map<string, Set<string>>();
    for (const row of pairs) {
      const key = value(row, field) ?? '';
      const clients = clientsByKey.get(key) ?? new Set<string>();
      clients.add(row.clientOrganizationId);
      clientsByKey.set(key, clients);
    }
    const problemsByKey = indexProblems(groupBy, openProblems);

    // Ranked and cut before anything is built, not after: the label, the client list and the
    // problem lookup are per-row work, and there is no point doing them for a row nobody is sent.
    const ranked = read(totals, field)
      .map((row) => ({ row, clientIds: [...(clientsByKey.get(row.key ?? '') ?? [])] }))
      // Worst first: the row a reader has to act on is the one several clients keep hitting.
      .sort((a, b) => b.clientIds.length - a.clientIds.length || b.row.count - a.row.count)
      .slice(0, MAX_RECURRING_ROWS);

    const rows: RecurringGroupRow[] = ranked.map(({ row, clientIds }) => ({
      label: this.labelFor(groupBy, row.key, productNames),
      productId: groupBy === RECURRING_GROUP_BY.PRODUCT ? row.key : null,
      module: groupBy === RECURRING_GROUP_BY.MODULE ? row.key : null,
      productVersion: groupBy === RECURRING_GROUP_BY.VERSION ? row.key : null,
      severity:
        groupBy === RECURRING_GROUP_BY.SEVERITY ? ((row.key as Priority | null) ?? null) : null,
      ticketCount: row.count,
      clientCount: clientIds.length,
      problems: problemsByKey.get(row.key ?? '') ?? [],
      overThreshold: crossesDuplicateThreshold(clientIds, threshold),
    }));

    return { groupBy, windowDays, threshold, rows, generatedAt: new Date().toISOString() };
  }

  private labelFor(
    groupBy: RecurringGroupBy,
    key: string | null,
    productNames: Map<string, string>,
  ): string {
    if (key === null || key === '') {
      return UNSPECIFIED[groupBy];
    }
    if (groupBy === RECURRING_GROUP_BY.PRODUCT) {
      return productNames.get(key) ?? 'Unknown product';
    }
    if (groupBy === RECURRING_GROUP_BY.SEVERITY) {
      return PRIORITY_LABELS[key as Priority] ?? key;
    }
    return key;
  }
}

/**
 * The open problems each group should list, built in one pass over the problems.
 *
 * One pass rather than a filter per row. Both sides of that filter grow — a version grouping has
 * as many groups as clients have typed distinct version strings, and every one of them would
 * otherwise walk the whole open-problem list, with an `includes` over each problem's versions
 * inside it.
 *
 * The keys match what `groupBy` groups the tickets by, with `''` standing for "the tickets named
 * nothing" exactly as it does on the ticket side. A problem carries several versions — one per
 * client that reported it — so under the version grouping it is filed under each of them.
 */
function indexProblems(groupBy: RecurringGroupBy, problems: OpenProblemRow[]): ProblemsByKey {
  const index: ProblemsByKey = new Map();
  const file = (key: string, ref: ProblemRef) => {
    const existing = index.get(key);
    if (existing) {
      existing.push(ref);
    } else {
      index.set(key, [ref]);
    }
  };

  for (const problem of problems) {
    const ref: ProblemRef = {
      id: problem.id,
      key: problemKey(problem),
      status: problem.status as ProblemStatus,
    };
    switch (groupBy) {
      case RECURRING_GROUP_BY.PRODUCT:
        file(problem.productId ?? '', ref);
        break;
      case RECURRING_GROUP_BY.MODULE:
        file(problem.module ?? '', ref);
        break;
      case RECURRING_GROUP_BY.VERSION:
        // No entry under `''`: a problem with no version is not evidence about the tickets that
        // named none, it is a problem nobody has recorded a version for.
        for (const version of problem.versions) {
          file(version, ref);
        }
        break;
      case RECURRING_GROUP_BY.SEVERITY:
      default:
        file(problem.severity, ref);
        break;
    }
  }
  return index;
}

/** Prisma's groupBy rows carry the grouped column under its own name; this normalises them. */
function value(row: Record<string, unknown>, field: RecurringGroupField): string | null {
  const raw = row[field];
  return typeof raw === 'string' ? raw : null;
}

function read(
  rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
  field: RecurringGroupField,
): GroupCount[] {
  return rows.map((row) => ({ key: value(row, field), count: row._count._all }));
}
