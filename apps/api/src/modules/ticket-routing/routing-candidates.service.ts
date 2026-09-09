import { Injectable } from '@nestjs/common';
import {
  ROUTING_ROLE,
  hasCapacity,
  normalizeWorkArea,
  normalizeWorkAreas,
  resolveAvailability,
  type RoutingCandidateInput,
  type RoutingRole,
  type WorkloadCounts,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { SupportOwnershipRepository } from '../on-call/support-ownership.repository';
import { TicketRoutingRepository } from './ticket-routing.repository';

/** One project's routing configuration, as the router needs it. */
export interface RoutingConfig {
  autoRouteEnabled: boolean;
  directTypes: string[];
  ackMinutes: number;
  escalationMinutes: number;
  workloadLimit: number | null;
  fallbackUserId: string | null;
  seniorId: string | null;
  supportExecutiveId: string | null;
}

export interface CandidateBundle {
  config: RoutingConfig;
  candidates: RoutingCandidateInput[];
}

/**
 * The fields `factsFor` does not read, for the one-person lookup.
 *
 * Only `workloadLimit` reaches the workload check; the rest of the configuration decides where a
 * *ticket* goes, which is not the question `availabilityOf` is asked.
 */
const emptyConfig: RoutingConfig = {
  autoRouteEnabled: true,
  directTypes: [],
  ackMinutes: 0,
  escalationMinutes: 0,
  workloadLimit: null,
  fallbackUserId: null,
  seniorId: null,
  supportExecutiveId: null,
};

/**
 * Turns package 8a's configuration into the ordered list of people the router walks.
 *
 * This is the only place that reads support ownership, rotas, availability, on-call cover, project
 * membership and workload together, and it deliberately resolves *all* of it before any decision
 * is taken. The alternative — checking each candidate lazily as the chain is walked — would make
 * the number of queries depend on how unavailable the team happens to be, and would make the trail
 * incomplete: a candidate never reached is a candidate never explained.
 */
@Injectable()
export class RoutingCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: SupportOwnershipRepository,
    private readonly routing: TicketRoutingRepository,
  ) {}

  async build(
    organizationId: string,
    projectId: string,
    module: string | null,
    now = new Date(),
  ): Promise<CandidateBundle> {
    const owned = await this.ownership.findOrCreateOwnership(organizationId, projectId);
    const moduleOwners = (owned.moduleOwners as Record<string, string> | null) ?? {};
    const workArea = module ? normalizeWorkArea(module) : null;

    const config: RoutingConfig = {
      autoRouteEnabled: owned.autoRouteEnabled,
      directTypes: owned.directTypes,
      ackMinutes: owned.ackMinutes,
      escalationMinutes: owned.escalationMinutes,
      workloadLimit: owned.workloadLimit,
      fallbackUserId: owned.fallbackUserId,
      seniorId: owned.seniorId,
      supportExecutiveId: owned.supportExecutiveId,
    };

    // The chain, in the order the architecture specifies: module owner → primary → on-call →
    // backup. Senior and support executive are not in it; they are where escalation goes.
    const onCall = await this.ownership.onCallOn(organizationId, projectId, dateOnly(now));
    const ordered: Array<{ userId: string | null; role: RoutingRole }> = [
      { userId: ownerOf(moduleOwners, workArea), role: ROUTING_ROLE.MODULE_OWNER },
      { userId: owned.primaryDeveloperId, role: ROUTING_ROLE.PRIMARY_DEVELOPER },
      { userId: onCall?.userId ?? null, role: ROUTING_ROLE.ON_CALL },
      { userId: onCall?.backupUserId ?? null, role: ROUTING_ROLE.ON_CALL },
      { userId: owned.backupDeveloperId, role: ROUTING_ROLE.BACKUP_DEVELOPER },
    ];

    const userIds = ordered.map((entry) => entry.userId).filter((id): id is string => id !== null);
    const covering = new Set(
      [onCall?.userId, onCall?.backupUserId].filter((id): id is string => Boolean(id)),
    );

    const facts = await this.factsFor(organizationId, projectId, userIds, covering, config, now);

    return {
      config,
      candidates: ordered.map((entry) => {
        const fact = entry.userId ? facts.get(entry.userId) : undefined;
        return {
          userId: entry.userId ?? '',
          role: entry.role,
          isProjectMember: fact?.isProjectMember ?? false,
          isActive: fact?.isActive ?? false,
          workAreas: fact?.workAreas ?? [],
          available: fact?.available ?? false,
          unavailableReason: fact?.unavailableReason ?? null,
        } satisfies RoutingCandidateInput;
      }),
    };
  }

  /**
   * One person, as routing sees them right now.
   *
   * Added for package 9: a support call rings the ticket's current owner before it consults the
   * chain, and "is that person actually there?" has to be answered by the same resolver the
   * router uses. Asking a second way would let the call and the routing screen disagree about
   * whether somebody is on leave, which is precisely the kind of drift `factsFor` exists to stop.
   */
  async availabilityOf(
    organizationId: string,
    projectId: string,
    userId: string,
    now = new Date(),
  ): Promise<{
    isProjectMember: boolean;
    isActive: boolean;
    available: boolean;
    unavailableReason: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null;
  }> {
    const owned = await this.ownership.findOrCreateOwnership(organizationId, projectId);
    const onCall = await this.ownership.onCallOn(organizationId, projectId, dateOnly(now));
    const covering = new Set(
      [onCall?.userId, onCall?.backupUserId].filter((id): id is string => Boolean(id)),
    );
    const facts = await this.factsFor(
      organizationId,
      projectId,
      [userId],
      covering,
      { ...emptyConfig, workloadLimit: owned.workloadLimit },
      now,
    );
    return (
      facts.get(userId) ?? {
        isProjectMember: false,
        isActive: false,
        available: false,
        unavailableReason: null,
      }
    );
  }

  /** The people an escalation may reach, after the first-pass chain: backup, senior, support. */
  async escalationCandidates(
    organizationId: string,
    projectId: string,
    now = new Date(),
  ): Promise<CandidateBundle> {
    const owned = await this.ownership.findOrCreateOwnership(organizationId, projectId);
    const config: RoutingConfig = {
      autoRouteEnabled: owned.autoRouteEnabled,
      directTypes: owned.directTypes,
      ackMinutes: owned.ackMinutes,
      escalationMinutes: owned.escalationMinutes,
      workloadLimit: owned.workloadLimit,
      fallbackUserId: owned.fallbackUserId,
      seniorId: owned.seniorId,
      supportExecutiveId: owned.supportExecutiveId,
    };
    const ordered: Array<{ userId: string | null; role: RoutingRole }> = [
      { userId: owned.backupDeveloperId, role: ROUTING_ROLE.BACKUP_DEVELOPER },
      { userId: owned.seniorId, role: ROUTING_ROLE.SENIOR },
      { userId: owned.supportExecutiveId, role: ROUTING_ROLE.SUPPORT_EXECUTIVE },
    ];
    const userIds = ordered.map((entry) => entry.userId).filter((id): id is string => id !== null);
    const facts = await this.factsFor(organizationId, projectId, userIds, new Set(), config, now);

    return {
      config,
      candidates: ordered.map((entry) => {
        const fact = entry.userId ? facts.get(entry.userId) : undefined;
        return {
          userId: entry.userId ?? '',
          role: entry.role,
          isProjectMember: fact?.isProjectMember ?? false,
          isActive: fact?.isActive ?? false,
          // An escalation target is reached because of who they are, not what they cover.
          workAreas: fact?.workAreas ?? [],
          available: fact?.available ?? false,
          unavailableReason: fact?.unavailableReason ?? null,
        } satisfies RoutingCandidateInput;
      }),
    };
  }

  /**
   * Membership, work areas, the rota, the live availability and the workload, for one set of
   * people, in a fixed number of queries.
   *
   * The availability answer comes from 8a's shared resolver rather than from the stored status, so
   * the router and the configuration screen cannot disagree about who is working right now. The
   * workload check is applied on top: somebody inside their hours and at their ceiling is
   * `AT_WORKLOAD_LIMIT`, which is a different fact from being off shift and has to say so.
   */
  private async factsFor(
    organizationId: string,
    projectId: string,
    userIds: readonly string[],
    covering: ReadonlySet<string>,
    config: RoutingConfig,
    now: Date,
  ) {
    const facts = new Map<
      string,
      {
        isProjectMember: boolean;
        isActive: boolean;
        workAreas: string[];
        available: boolean;
        unavailableReason: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null;
      }
    >();
    if (userIds.length === 0) {
      return facts;
    }
    const ids = [...userIds];

    const [members, memberships, schedules, availability, workload] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId, userId: { in: ids } },
        select: { userId: true, responsibilities: true },
      }),
      this.prisma.organizationMembership.findMany({
        where: {
          organizationId,
          userId: { in: ids },
          deletedAt: null,
          user: { deletedAt: null, status: 'ACTIVE' },
        },
        select: { userId: true },
      }),
      this.ownership.schedulesFor(organizationId, ids),
      this.ownership.availabilityFor(organizationId, ids),
      this.routing.workloadFor(organizationId, ids),
    ]);

    const memberBy = new Map(members.map((row) => [row.userId, row.responsibilities]));
    const activeIds = new Set(memberships.map((row) => row.userId));
    const scheduleBy = new Map(schedules.map((row) => [row.userId, row]));
    const availabilityBy = new Map(availability.map((row) => [row.userId, row]));

    for (const userId of ids) {
      const schedule = scheduleBy.get(userId);
      const stored = availabilityBy.get(userId);
      const counts: WorkloadCounts = workload.get(userId) ?? { openTickets: 0, activeTasks: 0 };
      // A person's own ceiling beats the project's, because it is the more specific statement.
      const limit = schedule?.workloadLimit ?? config.workloadLimit;

      const resolution = resolveAvailability({
        status: stored?.status ?? null,
        until: stored?.until ?? null,
        schedule: schedule
          ? {
              workingDays: schedule.workingDays,
              startMinute: schedule.startMinute,
              endMinute: schedule.endMinute,
              timezone: schedule.timezone,
            }
          : null,
        onCall: covering.has(userId),
        now,
      });

      const withinLimit = hasCapacity(counts, limit);
      facts.set(userId, {
        isProjectMember: memberBy.has(userId),
        isActive: activeIds.has(userId),
        workAreas: normalizeWorkAreas(memberBy.get(userId) ?? []),
        available: resolution.available && withinLimit,
        // Leave and hours are decided by the resolver; the limit is decided here. When both
        // apply the resolver's answer wins, because "on leave" explains more than "too busy".
        unavailableReason: unavailableReason(resolution.reason, resolution.available, withinLimit),
      });
    }
    return facts;
  }
}

/**
 * The one reason to give for somebody being unavailable.
 *
 * The rota's answer outranks the workload one when both apply: "on leave" explains more to whoever
 * reads the trail than "too busy" does, and it is the one that will still be true tomorrow.
 */
function unavailableReason(
  fromSchedule: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null,
  availableBySchedule: boolean,
  withinLimit: boolean,
): 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' | null {
  if (!availableBySchedule) {
    return fromSchedule;
  }
  return withinLimit ? null : 'AT_WORKLOAD_LIMIT';
}

/** Module owners are matched case-insensitively; the stored keys are whatever a manager typed. */
function ownerOf(owners: Record<string, string>, workArea: string | null): string | null {
  if (!workArea) {
    return null;
  }
  const wanted = workArea.toLowerCase();
  for (const [key, userId] of Object.entries(owners)) {
    if (normalizeWorkArea(key).toLowerCase() === wanted) {
      return userId;
    }
  }
  return null;
}

function dateOnly(at: Date): Date {
  return new Date(`${at.toISOString().slice(0, 10)}T00:00:00.000Z`);
}
