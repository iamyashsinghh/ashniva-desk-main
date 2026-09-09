import { Injectable } from '@nestjs/common';
import {
  SLA_EVENT_KIND,
  SLA_RESOLVED_STATUSES,
  SLA_TARGET_STATUS,
  TICKET_STATUS,
  type SlaEventKind,
  type SlaEventSummary,
  type SlaReapplyResult,
  type SupportTier,
  type TicketStatus,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import { computeTargets, formatDue } from './sla-clock';
import { toSlaEventSummary } from './sla-policies.mapper';
import { SlaPoliciesRepository, type SlaPolicyRow } from './sla-policies.repository';
import { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import { ruleFor, slaInputs, slaRowInclude, type TicketForSla, type TicketSlaRow } from './sla-row';
import { SlaTransitionsService } from './sla-transitions.service';

const OPEN_FOR_SLA = {
  notIn: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED],
};

/** How many tickets one page of `reapply` holds in memory at a time. */
const REAPPLY_PAGE = 200;

/**
 * The most tickets one policy edit will rewrite.
 *
 * `reapply` runs inside the request that saved the policy, so it has to end. A tenant with more
 * open tickets than this has a data problem worth looking at rather than a policy edit worth
 * waiting for, and the ceiling is logged loudly enough to be noticed — see the SLA section of
 * docs/production-runbook.md for how to finish the rest.
 */
const REAPPLY_CEILING = 5_000;

/**
 * Remembers which policy applies to a (client, project) pair for the length of one sweep.
 *
 * `findForTicket` takes three arguments and two of them repeat constantly: a tenant with 900 open
 * tickets across 12 projects has 12 distinct answers, and the sweep was asking for all 900. The
 * promise is cached rather than the row, so concurrent lookups of the same pair share one query.
 *
 * The key carries all three arguments, including the organization, even though one sweep only
 * ever visits one tenant today. A memo keyed by less than the query it stands for is correct only
 * as long as nobody passes it somewhere else, and that is not a property worth relying on when a
 * wrong answer here is one tenant's policy applied to another's tickets.
 */
type PolicyMemo = Map<string, Promise<SlaPolicyRow | null>>;

/**
 * The SLA clocks of one ticket. Every change to a ticket that matters to its SLA (raised,
 * status moved, public reply, priority changed, policy edited) goes through here; the monitor
 * job (SlaMonitorProcessor) turns time passing into warnings and breaches.
 */
@Injectable()
export class TicketSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: SlaPoliciesRepository,
    private readonly transitions: SlaTransitionsService,
    private readonly tenantContext: TenantContextService,
    private readonly tiers: SupportTierPolicyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TicketSlaService.name);
  }

  /**
   * Entry points run as the system: a client raising or answering a ticket must not be able
   * to read provider-wide policies, yet its ticket still needs its clocks computed.
   */
  start(ticket: TicketForSla, now = new Date(), kind: SlaEventKind = 'STARTED'): Promise<void> {
    return this.tenantContext.runAsSystem(() => this.startClocks(ticket, now, kind));
  }

  onStatusChanged(ticketId: string, to: TicketStatus, now = new Date()): Promise<void> {
    return this.tenantContext.runAsSystem(() => this.applyStatus(ticketId, to, now));
  }

  onPublicReply(ticketId: string, now = new Date()): Promise<void> {
    return this.tenantContext.runAsSystem(() => this.applyPublicReply(ticketId, now));
  }

  onPriorityChanged(ticket: TicketForSla, now = new Date()): Promise<void> {
    return this.tenantContext.runAsSystem(() => this.applyPriority(ticket, now));
  }

  /**
   * The policy that governs a ticket, answered from `memo` when the sweep has asked before.
   *
   * Without a memo this is exactly `findForTicket`; with one, a policy edit asks the database once
   * per distinct (client, project) pair instead of once per ticket.
   */
  private async findPolicy(ticket: TicketForSla, memo?: PolicyMemo): Promise<SlaPolicyRow | null> {
    // Resolved before the memo is consulted, and part of its key: the tier is a rung in
    // `findForTicket`'s precedence, so two tickets of the same (client, project) on different
    // tiers have different answers. A memo keyed without it would hand the first ticket's policy
    // to every later one — the tier would appear to work on a single ticket and silently stop
    // working during a sweep, which is the failure nobody would look for.
    const tierPolicyId = await this.tierPolicyId(ticket);
    if (!memo) {
      return this.policies.findForTicket(
        ticket.organizationId,
        ticket.clientOrganizationId,
        ticket.projectId,
        tierPolicyId,
      );
    }
    const key = `${ticket.organizationId}:${ticket.clientOrganizationId}:${ticket.projectId ?? ''}:${tierPolicyId ?? ''}`;
    let pending = memo.get(key);
    if (!pending) {
      pending = this.policies.findForTicket(
        ticket.organizationId,
        ticket.clientOrganizationId,
        ticket.projectId,
        tierPolicyId,
      );
      memo.set(key, pending);
    }
    return pending;
  }

  /** Starts (or restarts, after a policy change) the clocks of an open ticket. */
  private async startClocks(
    ticket: TicketForSla,
    now: Date,
    kind: SlaEventKind,
    memo?: PolicyMemo,
  ): Promise<void> {
    const policy = await this.findPolicy(ticket, memo);
    const rule = policy?.rules.find((entry) => entry.priority === ticket.priority);
    if (!policy || !rule) {
      await this.prisma.ticketSla.deleteMany({ where: { ticketId: ticket.id } });
      return;
    }
    const existing = await this.prisma.ticketSla.findUnique({ where: { ticketId: ticket.id } });
    const paused = (policy.pauseStatuses as string[]).includes(ticket.status);
    const targets = computeTargets(now, slaInputs(policy, rule));
    const running = paused ? SLA_TARGET_STATUS.PAUSED : SLA_TARGET_STATUS.ON_TRACK;
    const data = {
      policyId: policy.id,
      ...targets,
      firstResponseAt: existing?.firstResponseAt ?? null,
      firstResponseStatus: existing?.firstResponseAt ? existing.firstResponseStatus : running,
      resolvedAt: null,
      resolutionStatus: running,
      pausedAt: paused ? now : null,
      pausedTotalMinutes: existing?.pausedTotalMinutes ?? 0,
      firstResponseElapsedMinutes: 0,
      resolutionElapsedMinutes: 0,
      clockStartedAt: now,
      lastEvaluatedAt: now,
    };
    await this.prisma.ticketSla.upsert({
      where: { ticketId: ticket.id },
      create: { ticketId: ticket.id, ...data },
      update: data,
    });
    await this.transitions.addEvent(
      ticket.id,
      kind,
      `${policy.name}: first response by ${formatDue(targets.firstResponseDueAt, policy.timezone)}, ` +
        `resolution by ${formatDue(targets.resolutionDueAt, policy.timezone)} (${policy.timezone})`,
    );
  }

  /** Pause, resume, resolve, reopen or cancel depending on where the ticket went. */
  private async applyStatus(ticketId: string, to: TicketStatus, now: Date): Promise<void> {
    const row = await this.load(ticketId);
    if (!row) {
      return;
    }
    if (SLA_RESOLVED_STATUSES.includes(to)) {
      if (!row.resolvedAt) {
        await this.transitions.resolve(row, now);
      }
      return;
    }
    if (to === TICKET_STATUS.REOPENED && row.resolvedAt) {
      await this.transitions.reopen(row, now);
      return;
    }
    const cancelled = to === TICKET_STATUS.CANCELLED;
    const shouldPause = cancelled || (row.policy.pauseStatuses as string[]).includes(to);
    const isPaused = row.pausedAt !== null;
    if (shouldPause && !isPaused) {
      const label = to.toLowerCase().replace('_', ' ');
      await this.transitions.pause(row, now, cancelled ? 'Ticket cancelled' : `Ticket is ${label}`);
    } else if (!shouldPause && isPaused) {
      await this.transitions.resume(row, now);
    }
  }

  /** The first public reply from the service provider meets the first-response target. */
  private async applyPublicReply(ticketId: string, now: Date): Promise<void> {
    const row = await this.load(ticketId);
    if (row && !row.firstResponseAt) {
      await this.transitions.firstResponse(row, now);
    }
  }

  /** A new priority (already saved on the ticket) means new targets; minutes used stay used. */
  private async applyPriority(ticket: TicketForSla, now: Date): Promise<void> {
    const row = await this.load(ticket.id);
    if (!row) {
      await this.startClocks(ticket, now, SLA_EVENT_KIND.RECALCULATED);
      return;
    }
    const rule = ruleFor(row);
    if (!rule) {
      await this.prisma.ticketSla.delete({ where: { ticketId: ticket.id } });
      await this.transitions.addEvent(
        ticket.id,
        SLA_EVENT_KIND.RECALCULATED,
        `No ${row.ticket.priority} rule in ${row.policy.name}; SLA removed`,
      );
      return;
    }
    await this.transitions.recalculate(
      row,
      rule,
      now,
      `Priority changed to ${row.ticket.priority}`,
    );
  }

  /**
   * After a policy change: every open ticket gets the policy that now applies to it.
   *
   * This runs inside the request that saved the policy — somebody is watching a spinner — and it
   * used to scale with the number of open tickets in three separate ways: one unbounded
   * `findMany` that loaded them all into memory, one policy lookup per ticket for what is really
   * a per-(client, project) answer, and one `ticketSla` read per ticket. A tenant with a thousand
   * open tickets paid roughly four thousand queries to rename a policy.
   *
   * Now: pages of {@link REAPPLY_PAGE}, one policy lookup per distinct pair (memoised), and one
   * `ticketSla` read per page. The remaining per-ticket writes are the actual work — a clock that
   * changed has to be written — and only happen for tickets that changed.
   *
   * Returns `truncated` as well as the count, because the ceiling is silent otherwise: a tenant
   * with six thousand open tickets got five thousand reapplied, one `logger.warn` nobody was
   * watching, an ordinary 200, and an audit record reading `reappliedToOpenTickets: 5000` that is
   * indistinguishable from a complete run. The caller has to be able to say which it was.
   */
  async reapply(organizationId: string, now = new Date()): Promise<SlaReapplyResult> {
    const memo: PolicyMemo = new Map();
    let changed = 0;
    let seen = 0;
    let cursor: string | undefined;

    for (;;) {
      const tickets = await this.prisma.ticket.findMany({
        where: { organizationId, deletedAt: null, status: OPEN_FOR_SLA },
        select: {
          id: true,
          organizationId: true,
          clientOrganizationId: true,
          projectId: true,
          priority: true,
          status: true,
          // Without this the sweep's tickets carry no product, `tierPolicyId` returns null for
          // every one of them, and a policy edit quietly reapplies the untiered policy to tickets
          // whose tier says otherwise.
          product: { select: { supportTier: true } },
        },
        orderBy: { id: 'asc' },
        take: REAPPLY_PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (tickets.length === 0) {
        break;
      }
      cursor = tickets[tickets.length - 1]?.id;
      seen += tickets.length;

      // One read for the page's existing clocks, rather than one per ticket.
      const rows = await this.prisma.ticketSla.findMany({
        where: { ticketId: { in: tickets.map((ticket) => ticket.id) } },
        include: slaRowInclude,
      });
      const byTicket = new Map(rows.map((row) => [row.ticketId, row]));

      for (const ticket of tickets) {
        changed += await this.reapplyOne(ticket, byTicket.get(ticket.id) ?? null, now, memo);
      }

      if (tickets.length < REAPPLY_PAGE) {
        break;
      }
      if (seen >= REAPPLY_CEILING) {
        // One row, to tell "stopped at the ceiling with work left" from "stopped at the ceiling
        // having finished". Only the second is a complete run, and reporting the sweep as
        // truncated when it was not would train whoever reads the audit trail to ignore the flag.
        const remaining = await this.prisma.ticket.findMany({
          where: { organizationId, deletedAt: null, status: OPEN_FOR_SLA },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (remaining.length === 0) {
          break;
        }
        this.logger.warn(
          { organizationId, seen, ceiling: REAPPLY_CEILING },
          'Stopped reapplying SLA policies at the ceiling; the remaining open tickets still ' +
            'carry their previous policy',
        );
        return { changed, truncated: true };
      }
    }
    return { changed, truncated: false };
  }

  /** One ticket's share of `reapply`. Returns 1 when its SLA changed, 0 when nothing was due. */
  private async reapplyOne(
    ticket: TicketForSla,
    row: TicketSlaRow | null,
    now: Date,
    memo: PolicyMemo,
  ): Promise<number> {
    const policy = await this.findPolicy(ticket, memo);
    const rule = policy?.rules.find((entry) => entry.priority === ticket.priority);

    if (!policy || !rule) {
      if (!row) {
        return 0;
      }
      await this.prisma.ticketSla.delete({ where: { ticketId: ticket.id } });
      await this.transitions.addEvent(
        ticket.id,
        SLA_EVENT_KIND.POLICY_CHANGED,
        'No policy applies any more',
      );
      return 1;
    }

    if (!row || row.policyId !== policy.id) {
      await this.startClocks(ticket, now, SLA_EVENT_KIND.POLICY_CHANGED, memo);
      return 1;
    }

    await this.transitions.recalculate({ ...row, policy }, rule, now, `${policy.name} was edited`);
    return 1;
  }

  async eventsFor(ticketId: string): Promise<SlaEventSummary[]> {
    const rows = await this.prisma.slaEvent.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSlaEventSummary);
  }

  /**
   * The SLA policy this ticket's support tier selects, if any.
   *
   * Null for a ticket with no product and for a tier nobody has configured, which together are
   * almost every ticket — so the precedence in `findForTicket` behaves exactly as it did before
   * the tier rung was added, for everything that has not opted in.
   */
  private async tierPolicyId(ticket: TicketForSla): Promise<string | null> {
    const tier = ticket.product?.supportTier as SupportTier | undefined;
    if (!tier) {
      return null;
    }
    const policy = await this.tiers.forTier(ticket.organizationId, tier);
    return policy.slaPolicyId;
  }

  load(ticketId: string): Promise<TicketSlaRow | null> {
    return this.prisma.ticketSla.findUnique({ where: { ticketId }, include: slaRowInclude });
  }
}
