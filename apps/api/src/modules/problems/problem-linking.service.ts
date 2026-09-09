import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  DEFAULT_DUPLICATE_THRESHOLD,
  NOTIFICATION_TYPE,
  PERMISSIONS,
  PRIORITY,
  crossesDuplicateThreshold,
  type AuthenticatedUser,
  type Priority,
  type ProblemTicketRelation,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import { problemKey } from './problems.mapper';
import { ProblemsRepository } from './problems.repository';

/** The facts about a ticket that a problem is built from. */
export type LinkableTicket = Awaited<ReturnType<ProblemsRepository['findTickets']>>[number];

/**
 * Joining tickets to a problem, and the counting that decides whether a problem is warranted.
 *
 * The counting rule is the whole point of the package and it is one sentence: **distinct client
 * organizations, never tickets.** Three reports from one client is one unhappy client; three from
 * three is a fault in the product, and only the second is what "reported by 3 clients" means on
 * the screen.
 */
@Injectable()
export class ProblemLinkingService {
  constructor(
    private readonly problems: ProblemsRepository,
    private readonly notifications: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Every id must resolve inside the tenant; a group half of which does not exist is a mistake. */
  async requireTickets(organizationId: string, ticketIds: string[]): Promise<LinkableTicket[]> {
    if (ticketIds.length === 0) {
      return [];
    }
    const tickets = await this.problems.findTickets(organizationId, ticketIds);
    if (tickets.length !== ticketIds.length) {
      throw new NotFoundException('One of those tickets was not found');
    }
    return tickets;
  }

  /**
   * Links a group of tickets into a problem and brings the problem's own facts up to date.
   *
   * `versions` is rewritten from the links rather than appended to, so a ticket unlinked or
   * re-reported on a different build cannot leave a version behind that nothing supports any more.
   */
  async link(
    actor: AuthenticatedUser,
    problemId: string,
    tickets: LinkableTicket[],
    relation: ProblemTicketRelation,
  ): Promise<void> {
    await this.problems.linkTickets({
      organizationId: actor.organizationId,
      problemId,
      ticketIds: tickets.map((ticket) => ticket.id),
      relation,
      linkedById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_TICKET_LINKED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: problemId,
      organizationId: actor.organizationId,
      after: { ticketIds: tickets.map((ticket) => ticket.id), relation },
    });
    await this.refresh(actor, problemId);
  }

  /**
   * Recomputes the versions, and stamps the threshold if the group has just crossed it.
   *
   * The stamp happens once: `thresholdHitAt` records the moment a count became a fault in the
   * product, and re-stamping it every time another ticket arrives would lose that.
   */
  async refresh(actor: AuthenticatedUser, problemId: string): Promise<void> {
    const problem = await this.problems.findDetail(actor.organizationId, problemId);
    if (!problem) {
      return;
    }
    const versions = [
      ...new Set(
        problem.tickets
          .map((link) => link.ticket.productVersion)
          .filter((version): version is string => Boolean(version)),
      ),
    ].sort();
    const clientIds = problem.tickets.map((link) => link.ticket.clientOrganizationId);
    const threshold = await this.thresholdFor(actor.organizationId, problem.projectId);
    const crossed =
      problem.thresholdHitAt === null && crossesDuplicateThreshold(clientIds, threshold);

    await this.problems.update(actor.organizationId, problemId, {
      versions,
      ...(crossed ? { thresholdHitAt: new Date() } : {}),
    });

    if (crossed) {
      await this.announceThreshold(actor, {
        problemId,
        key: problemKey(problem),
        title: problem.title,
        projectId: problem.projectId,
        severity: problem.severity as Priority,
        clientCount: new Set(clientIds).size,
      });
    }
  }

  /**
   * The problem a decided pair of tickets belongs to.
   *
   * An existing problem on either ticket wins: two tickets are being joined because they are the
   * same fault, and the fault already has a record. Only a group with no problem at all gets a
   * new one, which is what stops a busy afternoon producing four problems for one bug.
   *
   * The tickets read here were loaded a moment ago, so the decision is made again inside the
   * repository's transaction, under a lock on the group. Two people confirming different
   * candidates on the same ticket at the same time is not hypothetical — it is what a shared
   * support queue looks like on a bad morning.
   */
  async problemForGroup(
    actor: AuthenticatedUser,
    tickets: LinkableTicket[],
  ): Promise<{ problemId: string; created: boolean }> {
    const existing = tickets.find((ticket) => ticket.problemId !== null)?.problemId;
    if (existing) {
      return { problemId: existing, created: false };
    }
    const lead = tickets[0];
    const { row, problemId, created } = await this.problems.findOrCreateForGroup({
      organizationId: actor.organizationId,
      lockKey: groupLockKey(actor.organizationId, lead),
      ticketIds: tickets.map((ticket) => ticket.id),
      data: {
        title: lead?.title ?? 'Recurring issue',
        severity: highestSeverity(tickets),
        projectId: lead?.projectId ?? null,
        productId: lead?.productId ?? null,
        module: lead?.module ?? null,
        versions: [],
        createdById: actor.userId,
      },
    });
    if (!created || !row) {
      return { problemId, created: false };
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_CREATED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: {
        key: problemKey(row),
        title: row.title,
        // How this problem came to exist, so a reader can tell it from one somebody opened.
        origin: 'duplicate-decision',
        ticketIds: tickets.map((ticket) => ticket.id),
      },
    });
    return { problemId: row.id, created: true };
  }

  /**
   * A problem a caller named, resolved inside the tenant.
   *
   * `linkTicket` scopes the ticket it updates but the link row carries whatever organization it is
   * told about, so a problem id that arrived in a request has to be resolved here before anything
   * is written against it — otherwise one provider could file a ticket into another's problem, and
   * the other provider's screen would then list it.
   */
  async requireProblem(organizationId: string, problemId: string): Promise<string> {
    if (!(await this.problems.findRef(organizationId, problemId))) {
      throw new NotFoundException('Problem not found');
    }
    return problemId;
  }

  /** The project's support-routing settings, where the duplicate threshold is configured. */
  ownershipFor(organizationId: string, projectId: string) {
    return this.problems.findOwnership(organizationId, projectId);
  }

  /** The project's configured threshold, or the default when the project has not chosen one. */
  async thresholdFor(organizationId: string, projectId: string | null): Promise<number> {
    if (!projectId) {
      return DEFAULT_DUPLICATE_THRESHOLD;
    }
    const ownership = await this.problems.findOwnership(organizationId, projectId);
    return ownership?.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD;
  }

  /**
   * Tells the project's senior that enough separate clients have hit the same thing.
   *
   * Sent in the request rather than from a queue: the person who just linked the third client's
   * ticket is looking at the screen, and a notification that arrives whenever a worker gets round
   * to it would reach the senior after the conversation about it had already happened. When no
   * senior is configured it goes to whoever may manage problems, so the alert is never simply
   * dropped for want of a setting.
   */
  private async announceThreshold(
    actor: AuthenticatedUser,
    problem: {
      problemId: string;
      key: string;
      title: string;
      projectId: string | null;
      severity: Priority;
      clientCount: number;
    },
  ): Promise<void> {
    const ownership = problem.projectId
      ? await this.problems.findOwnership(actor.organizationId, problem.projectId)
      : null;
    const recipients = ownership?.seniorId
      ? await this.recipients.member(actor.organizationId, ownership.seniorId)
      : await this.recipients.withPermission(actor.organizationId, PERMISSIONS.PROBLEM_MANAGE);

    await this.notifications.notify({
      type: NOTIFICATION_TYPE.PROBLEM_THRESHOLD_REACHED,
      title: `${problem.clientCount} clients reported ${problem.key}`,
      body: problem.title,
      link: `/problems/${problem.problemId}`,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: problem.problemId,
      // Once per problem: the threshold is crossed once, and a second alert would only be the
      // same news arriving again.
      dedupeKey: `problem-threshold:${problem.problemId}`,
      recipients,
    });
  }
}

/**
 * What makes two concurrent decisions "the same group", for the lock they contend on.
 *
 * Organization, project and module: the three facts a problem opened from a duplicate decision
 * inherits from the lead ticket. Two people deciding on the same fault land on the same string and
 * therefore on the same lock; two people deciding on different faults almost always do not, and
 * pay nothing. The organization is in the key because the lock is a database-wide integer and one
 * tenant's busy morning must not queue behind another's.
 */
function groupLockKey(organizationId: string, lead: LinkableTicket | undefined): string {
  return ['problem-group', organizationId, lead?.projectId ?? '-', lead?.module ?? '-'].join('|');
}

/** The worst of the group. A problem is as urgent as the most urgent report in it. */
function highestSeverity(tickets: LinkableTicket[]): Priority {
  const order: Priority[] = [PRIORITY.LOW, PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.CRITICAL];
  return tickets.reduce<Priority>((worst, ticket) => {
    const priority = ticket.priority as Priority;
    return order.indexOf(priority) > order.indexOf(worst) ? priority : worst;
  }, PRIORITY.LOW);
}
