import { Injectable } from '@nestjs/common';
import {
  APPROVAL_LIST_VIEW,
  CONTRACT_LIST_VIEW,
  SEARCH_ENTITY_LABELS,
  SEARCH_ENTITY_TYPE,
  SEARCH_ENTITY_TYPES,
  SEARCH_MAX_RESULTS,
  TASK_LIST_VIEW,
  TICKET_LIST_VIEW,
  type AuthenticatedUser,
  type ChangeRequestSummary,
  type PaginatedResponse,
  type SearchGroup,
  type SearchHit,
  type SearchResponse,
} from '@ashniva/types';

import { ApprovalsService } from '../approvals/approvals.service';
import { InvoicesService } from '../billing/invoices.service';
import { toInvoiceSummary } from '../billing/billing.mapper';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { ContractsService } from '../contracts/contracts.service';
import { IncidentsService } from '../incidents/incidents.service';
import { PortalTicketsService } from '../portal/portal-tickets.service';
import { ProblemsService } from '../problems/problems.service';
import { ProjectsService } from '../projects/projects.service';
import { ReleasesService } from '../releases/releases.service';
import { TasksService } from '../tasks/tasks.service';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';
import type { SearchQueryDto } from './dto/search.dto';
import { allowsSource, SEARCH_GATES, type SearchGate } from './search-gates';
import {
  approvalHit,
  changeRequestHit,
  contractHit,
  incidentHit,
  invoiceHit,
  portalChangeRequestHit,
  portalTicketHit,
  problemHit,
  projectHit,
  releaseHit,
  taskHit,
  ticketHit,
  userHit,
} from './search.mapper';

/** What one source returned: the hits it may show, and whether the module had more. */
interface SourceResult {
  hits: SearchHit[];
  hasMore: boolean;
}

/**
 * Global search.
 *
 * This service issues no queries of its own. It has no `PrismaService`, no repository and no
 * `where` clause anywhere in it: every branch below calls the same list *service* the module's own
 * list route calls, with the same `search` term that route already accepts, and maps the summaries
 * that come back. So a group cannot contain a row the caller's own list screen would not show
 * them — the scoping, the tenant, the client pinning and the internal/client split are all decided
 * one level down, by the code that decides them for the list endpoint.
 *
 * Which sources run at all is decided by `SEARCH_GATES`, a copy of the list routes' permission
 * decorators that `search-gates.spec.ts` compares against the real routes.
 *
 * Failures are not swallowed. If a source throws — a `ForbiddenException` from a service-level
 * assertion the gate table failed to predict, say — the whole request fails, loudly. A dropped
 * group would hide exactly the divergence this design exists to prevent.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly tasks: TasksService,
    private readonly tickets: TicketsService,
    private readonly portalTickets: PortalTicketsService,
    private readonly projects: ProjectsService,
    private readonly contracts: ContractsService,
    private readonly invoices: InvoicesService,
    private readonly changeRequests: ChangeRequestsService,
    private readonly problems: ProblemsService,
    private readonly incidents: IncidentsService,
    private readonly approvals: ApprovalsService,
    private readonly releases: ReleasesService,
    private readonly users: UsersService,
  ) {}

  async search(actor: AuthenticatedUser, query: SearchQueryDto): Promise<SearchResponse> {
    const term = query.q.trim();
    const limit = query.limit;
    const gates = SEARCH_GATES.filter((gate) => allowsSource(actor, gate));
    const results = await Promise.all(
      gates.map(async (gate) => ({ gate, result: await this.run(actor, gate, term, limit) })),
    );

    const byType = new Map<string, SourceResult>();
    for (const { gate, result } of results) {
      byType.set(gate.type, result);
    }

    // Groups are emitted in the fixed order of SEARCH_ENTITY_TYPES and the overall cap is spent as
    // they go, so two identical requests return the same prefix rather than a different subset.
    const groups: SearchGroup[] = [];
    let total = 0;
    let truncated = false;
    for (const type of SEARCH_ENTITY_TYPES) {
      const result = byType.get(type);
      if (!result || result.hits.length === 0) {
        continue;
      }
      const room = SEARCH_MAX_RESULTS - total;
      if (room <= 0) {
        truncated = true;
        break;
      }
      const hits = result.hits.slice(0, room);
      truncated ||= hits.length < result.hits.length;
      total += hits.length;
      groups.push({
        type,
        label: SEARCH_ENTITY_LABELS[type],
        hits,
        hasMore: result.hasMore || hits.length < result.hits.length,
      });
    }
    return { query: term, groups, total, truncated };
  }

  private run(
    actor: AuthenticatedUser,
    gate: SearchGate,
    search: string,
    limit: number,
  ): Promise<SourceResult> {
    switch (gate.type) {
      case SEARCH_ENTITY_TYPE.TASK:
        return this.page(
          this.tasks.list(actor, { view: TASK_LIST_VIEW.ALL, search, limit }),
          taskHit,
        );
      case SEARCH_ENTITY_TYPE.TICKET:
        return gate.audience === 'client'
          ? this.page(
              this.portalTickets.list(actor, { view: TICKET_LIST_VIEW.ALL, search, limit }),
              portalTicketHit,
            )
          : this.page(
              this.tickets.list(actor, { view: TICKET_LIST_VIEW.ALL, search, limit }),
              ticketHit,
            );
      case SEARCH_ENTITY_TYPE.PROJECT:
        // The projects list is not paginated; it is bounded here instead, so search never fans
        // out wider than one screenful per module.
        return this.rows(this.projects.list(actor, { search }), projectHit, limit);
      case SEARCH_ENTITY_TYPE.CONTRACT:
        return this.page(
          this.contracts.list(actor, { view: CONTRACT_LIST_VIEW.ALL, search, limit }),
          contractHit,
        );
      case SEARCH_ENTITY_TYPE.INVOICE:
        return this.page(
          this.invoices.list(actor, { search, limit }).then((page) => ({
            ...page,
            items: page.items.map(toInvoiceSummary),
          })),
          invoiceHit,
        );
      case SEARCH_ENTITY_TYPE.CHANGE_REQUEST:
        // `internalOnly` and the cast are the two halves of what the internal list route does
        // (`ChangeRequestsController.list`): the flag makes the service refuse a client, and the
        // cast records that the union it returns is the internal projection once it has.
        return gate.audience === 'client'
          ? this.page(this.changeRequests.list(actor, { search, limit }), portalChangeRequestHit)
          : this.page(
              this.changeRequests.list(actor, { search, limit }, { internalOnly: true }) as Promise<
                PaginatedResponse<ChangeRequestSummary>
              >,
              changeRequestHit,
            );
      case SEARCH_ENTITY_TYPE.PROBLEM:
        return this.page(this.problems.list(actor, { search, limit }), problemHit);
      case SEARCH_ENTITY_TYPE.INCIDENT:
        return this.page(this.incidents.list(actor, { search, limit }), incidentHit);
      case SEARCH_ENTITY_TYPE.APPROVAL:
        return this.page(
          this.approvals.list(actor, { view: APPROVAL_LIST_VIEW.ALL, search, limit }),
          approvalHit,
        );
      case SEARCH_ENTITY_TYPE.RELEASE:
        return this.page(this.releases.list(actor, { search, limit }), releaseHit);
      case SEARCH_ENTITY_TYPE.USER:
        // Also unpaginated, and bounded here for the same reason.
        return this.rows(this.users.list(actor, { search }), userHit, limit);
    }
  }

  /**
   * A module that pages: `total` says whether more matched than the limit returned.
   *
   * `total` is optional on `PaginatedResponse` and every module used here fills it in; when one
   * does not, "more exists" falls back to a full page, which is what a cursor-only list means by
   * it anyway.
   */
  private async page<T>(
    pending: Promise<{ items: T[]; total?: number; nextCursor: string | null }>,
    toHit: (row: T) => SearchHit,
  ): Promise<SourceResult> {
    const page = await pending;
    const hasMore =
      page.total === undefined ? page.nextCursor !== null : page.total > page.items.length;
    return { hits: page.items.map(toHit), hasMore };
  }

  /** A module that returns a plain array: bounded here, with the overflow reported as `hasMore`. */
  private async rows<T>(
    pending: Promise<T[]>,
    toHit: (row: T) => SearchHit,
    limit: number,
  ): Promise<SourceResult> {
    const all = await pending;
    return { hits: all.slice(0, limit).map(toHit), hasMore: all.length > limit };
  }
}
