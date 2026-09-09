import {
  SEARCH_ENTITY_TYPE,
  type ApprovalSummary,
  type ChangeRequestSummary,
  type ContractSummary,
  type IncidentSummary,
  type InvoiceSummary,
  type PortalChangeRequestSummary,
  type PortalTicketSummary,
  type ProblemSummary,
  type ProjectSummary,
  type ReleaseSummary,
  type SearchHit,
  type TaskSummary,
  type TicketSummary,
  type UserSummary,
} from '@ashniva/types';

/**
 * Summary → search hit.
 *
 * Every mapper here names the fields it copies. A hit carries an identifier, a title, one line of
 * context and a status, and nothing else: no money, no estimates, no internal notes, no assignee.
 * The summaries these read from are already what the caller's own list screen shows them, so the
 * narrowing is belt and braces — but it is the difference between "search shows less than the
 * list" and "search shows whatever a list shape happens to grow next".
 */

export function taskHit(row: TaskSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.TASK,
    id: row.id,
    reference: row.key,
    title: row.title,
    subtitle: row.project.name,
    status: row.status,
    href: `/tasks/${row.id}`,
  };
}

export function ticketHit(row: TicketSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.TICKET,
    id: row.id,
    reference: row.key,
    title: row.title,
    subtitle: row.clientOrganization.name,
    status: row.status,
    href: `/tickets/${row.id}`,
  };
}

/** The client's own ticket: the portal's client-visible status, and the portal's route. */
export function portalTicketHit(row: PortalTicketSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.TICKET,
    id: row.id,
    reference: row.key,
    title: row.title,
    subtitle: row.project?.name ?? null,
    status: row.status,
    href: `/portal/tickets/${row.id}`,
  };
}

export function projectHit(row: ProjectSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.PROJECT,
    id: row.id,
    reference: row.code,
    title: row.name,
    subtitle: row.clientOrganization?.name ?? null,
    status: row.status,
    href: `/projects/${row.id}`,
  };
}

export function contractHit(row: ContractSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.CONTRACT,
    id: row.id,
    reference: row.number,
    title: row.title,
    subtitle: row.clientOrganization.name,
    status: row.status,
    href: `/contracts/${row.id}`,
  };
}

export function invoiceHit(row: InvoiceSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.INVOICE,
    id: row.id,
    reference: row.numberLabel,
    title: row.numberLabel,
    subtitle: row.clientName,
    status: row.status,
    href: `/invoices/${row.id}`,
  };
}

export function changeRequestHit(row: ChangeRequestSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    id: row.id,
    reference: row.number,
    title: row.title,
    subtitle: row.clientOrganization.name,
    status: row.status,
    href: `/change-requests/${row.id}`,
  };
}

/**
 * The client's own change request. Typed as the union because `ChangeRequestsService.list`
 * returns it — the portal projection for a client caller, the internal one for staff — and the
 * four fields read here are the ones both shapes carry.
 */
export function portalChangeRequestHit(
  row: PortalChangeRequestSummary | ChangeRequestSummary,
): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    id: row.id,
    reference: row.number,
    title: row.title,
    subtitle: row.project?.name ?? null,
    status: row.status,
    href: `/portal/change-requests/${row.id}`,
  };
}

export function problemHit(row: ProblemSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.PROBLEM,
    id: row.id,
    reference: row.key,
    title: row.title,
    subtitle: row.project?.name ?? row.module,
    status: row.status,
    href: `/problems/${row.id}`,
  };
}

export function incidentHit(row: IncidentSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.INCIDENT,
    id: row.id,
    reference: row.key,
    title: row.title,
    subtitle: row.project?.name ?? null,
    status: row.status,
    href: `/incidents/${row.id}`,
  };
}

export function approvalHit(row: ApprovalSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.APPROVAL,
    id: row.id,
    reference: null,
    title: row.title,
    subtitle: row.clientOrganization.name,
    status: row.status,
    href: `/approvals/${row.id}`,
  };
}

export function releaseHit(row: ReleaseSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.RELEASE,
    id: row.id,
    reference: row.version,
    title: row.title,
    subtitle: row.projectName,
    status: row.status,
    href: `/releases/${row.id}`,
  };
}

/**
 * A person. There is no user detail screen, so the hit opens the Users & teams list.
 *
 * The email is the subtitle because it is what tells two people with the same name apart, and it
 * is already on that screen for everybody who can reach this source (`user:manage`).
 */
export function userHit(row: UserSummary): SearchHit {
  return {
    type: SEARCH_ENTITY_TYPE.USER,
    id: row.id,
    reference: null,
    title: row.name,
    subtitle: row.email,
    status: row.status,
    href: '/admin/users',
  };
}
