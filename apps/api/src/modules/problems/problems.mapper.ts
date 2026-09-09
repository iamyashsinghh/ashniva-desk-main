import type {
  Priority,
  ProblemClosureState,
  ProblemDetail,
  ProblemQuestion,
  ProblemStatus,
  ProblemSummary,
  ProblemTicketLink,
  ProblemTicketRelation,
  RcaAction,
  RcaReport,
} from '@ashniva/types';

import { toIncidentSummary } from '../incidents/incidents.mapper';
import { taskKey } from '../tasks/tasks.mapper';
import { ticketKey } from '../tickets/tickets.mapper';
import type { ProblemDetailRow, ProblemSummaryRow } from './problems.repository';

export function problemKey(problem: { number: number }): string {
  return `PRB-${problem.number}`;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

type TaskRefRow = ProblemDetailRow['fixTask'];

function toTaskRef(task: TaskRefRow) {
  return task ? { id: task.id, key: taskKey(task), title: task.title, status: task.status } : null;
}

/**
 * How many separate clients reported this.
 *
 * Counted in distinct client organizations, never in tickets — three reports from one client is
 * one unhappy client, three from three is a fault in the product, and only the second is what
 * "reported by N clients" means on screen.
 */
export function distinctClientCount(row: ProblemSummaryRow): number {
  return new Set(row.tickets.map((link) => link.ticket.clientOrganizationId)).size;
}

export function toProblemSummary(row: ProblemSummaryRow): ProblemSummary {
  return {
    id: row.id,
    key: problemKey(row),
    number: row.number,
    title: row.title,
    status: row.status as ProblemStatus,
    severity: row.severity as Priority,
    product: row.product,
    project: row.project,
    module: row.module,
    versions: row.versions,
    clientCount: distinctClientCount(row),
    ticketCount: row.tickets.length,
    owner: row.owner,
    thresholdHitAt: iso(row.thresholdHitAt),
    // A draft nobody has submitted is not an analysis; the list would otherwise show a tick for
    // an empty form somebody opened by pressing "Request RCA".
    hasRca: row.rca !== null && row.rca.status !== 'DRAFT',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A linked ticket, as an internal reader sees it.
 *
 * The client's name is here on purpose: the approved screen shows it, and a support executive
 * cannot tell three reports from one without it. Nothing maps this type into a client response.
 */
function toTicketLink(row: ProblemDetailRow['tickets'][number]): ProblemTicketLink {
  return {
    ticketId: row.ticket.id,
    key: ticketKey(row.ticket),
    title: row.ticket.title,
    status: row.ticket.status,
    relation: row.relation as ProblemTicketRelation,
    clientOrganizationId: row.ticket.clientOrganizationId,
    clientOrganizationName: row.ticket.clientOrganization.name,
    productVersion: row.ticket.productVersion,
    linkedAt: row.linkedAt.toISOString(),
  };
}

function toQuestion(row: ProblemDetailRow['questions'][number]): ProblemQuestion {
  return {
    id: row.id,
    body: row.body,
    askedBy: row.askedBy,
    askedAt: row.askedAt.toISOString(),
    answer: row.answer,
    answeredBy: row.answeredBy,
    answeredAt: iso(row.answeredAt),
  };
}

type RcaRow = NonNullable<ProblemDetailRow['rca']>;

export function toRcaReport(row: RcaRow): RcaReport {
  return {
    id: row.id,
    problemId: row.problemId,
    status: row.status,
    what: row.what,
    why: row.why,
    affectedClientsVersions: row.affectedClientsVersions,
    introducedBy: row.introducedBy,
    workaround: row.workaround,
    permanentFix: row.permanentFix,
    prevention: row.prevention,
    testsAdded: row.testsAdded,
    owner: row.owner,
    targetDate: dateOnly(row.targetDate),
    introducedByRelease: row.introducedByRelease,
    submittedBy: row.submittedBy,
    submittedAt: iso(row.submittedAt),
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRcaAction(row: RcaRow['actions'][number]): RcaAction {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    owner: row.owner,
    dueDate: dateOnly(row.dueDate),
    task: toTaskRef(row.task),
    completedAt: iso(row.completedAt),
    verifiedAt: iso(row.verifiedAt),
    verifiedBy: row.verifiedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The whole problem, with the closure decision the server already made.
 *
 * `closure` travels on every detail response so the screen's disabled Close button and the
 * server's refusal cannot disagree: the sentence under the button is the sentence the API would
 * answer with.
 */
export function toProblemDetail(
  row: ProblemDetailRow,
  closure: ProblemClosureState,
  now = new Date(),
): ProblemDetail {
  return {
    ...toProblemSummary(row),
    description: row.description,
    tickets: row.tickets.map(toTicketLink),
    questions: row.questions.map(toQuestion),
    rca: row.rca ? toRcaReport(row.rca) : null,
    actions: row.rca ? row.rca.actions.map(toRcaAction) : [],
    fixTask: toTaskRef(row.fixTask),
    preventiveTestTask: toTaskRef(row.preventiveTestTask),
    preventiveTest: row.preventiveTest,
    incidents: row.incidents.map((incident) => toIncidentSummary(incident, now)),
    closure,
    rcaDueDate: dateOnly(row.rcaDueDate),
    createdBy: row.createdBy,
  };
}
