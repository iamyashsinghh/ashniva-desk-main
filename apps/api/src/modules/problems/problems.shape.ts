import type { Prisma } from '../../generated/prisma/client';
import { incidentSummaryInclude } from '../incidents/incidents.repository';

/**
 * What a problem row carries when it is read, and what it carries when it is written.
 *
 * Its own file, beside the repository rather than inside it: these shapes are the widest thing in
 * the module — the detail include alone reaches five relations deep — and the queries that use
 * them are easier to read when they are not preceded by seventy lines of selects.
 */

const userRef = { select: { id: true, name: true } } as const;
const taskRef = {
  select: {
    id: true,
    number: true,
    title: true,
    status: true,
    project: { select: { code: true } },
  },
} as const;

/**
 * The linked tickets, on both the list and the detail.
 *
 * The list needs them too: "reported by N clients" is the number the whole feature exists to
 * show, it is counted in *distinct client organizations*, and there is no way to count that in a
 * `_count`. Problems are counted in dozens, not millions, so carrying the links is cheaper than
 * a second round trip per row.
 */
const ticketLinks = {
  orderBy: { linkedAt: 'asc' },
  include: {
    ticket: {
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        productVersion: true,
        clientOrganizationId: true,
        clientOrganization: { select: { name: true } },
      },
    },
  },
} satisfies Prisma.Problem$ticketsArgs;

export const problemSummaryInclude = {
  project: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
  owner: userRef,
  tickets: ticketLinks,
  rca: { select: { id: true, status: true } },
} satisfies Prisma.ProblemInclude;

export const problemDetailInclude = {
  ...problemSummaryInclude,
  createdBy: userRef,
  fixTask: taskRef,
  preventiveTestTask: taskRef,
  questions: { orderBy: { askedAt: 'asc' }, include: { askedBy: userRef, answeredBy: userRef } },
  // The incidents module's own include, so a field added to an incident summary appears here
  // too rather than quietly going missing on the problem screen.
  incidents: { orderBy: { createdAt: 'desc' }, include: incidentSummaryInclude },
  rca: {
    include: {
      owner: userRef,
      submittedBy: userRef,
      approvedBy: userRef,
      introducedByRelease: { select: { id: true, version: true } },
      actions: {
        orderBy: { createdAt: 'asc' },
        include: { owner: userRef, verifiedBy: userRef, task: taskRef },
      },
    },
  },
} satisfies Prisma.ProblemInclude;

export type ProblemSummaryRow = Prisma.ProblemGetPayload<{ include: typeof problemSummaryInclude }>;
export type ProblemDetailRow = Prisma.ProblemGetPayload<{ include: typeof problemDetailInclude }>;

/** What a caller supplies to open a problem; the organization and the number are not theirs. */
export type NewProblem = Omit<Prisma.ProblemUncheckedCreateInput, 'organizationId' | 'number'>;

/**
 * Writes the row and takes its number, inside a transaction the caller owns.
 *
 * The counter is incremented in the same transaction that writes the row, so a problem can never
 * exist without a number and a number can never be handed out to a row that rolled back. The
 * transaction belongs to the caller because opening a problem for a group of tickets has to read
 * and write under one lock, and a nested transaction is not a thing.
 */
export async function createProblemIn(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: NewProblem,
): Promise<ProblemDetailRow> {
  const counter = await tx.organizationCounter.upsert({
    where: { organizationId_kind: { organizationId, kind: 'PROBLEM' } },
    update: { value: { increment: 1 } },
    create: { organizationId, kind: 'PROBLEM', value: 1 },
  });
  return tx.problem.create({
    data: { ...data, organizationId, number: counter.value },
    include: problemDetailInclude,
  });
}
