import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  DEFAULT_WORK_SCHEDULE,
  type AuthenticatedUser,
  type AvailabilitySummary,
  type EffectiveAvailability,
  type OnCallEntrySummary,
  type ProjectSupportConfig,
  type SupportOwnershipSummary,
  type WorkScheduleSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import {
  clockOrThrow,
  type SetAvailabilityDto,
  type SetOnCallDto,
  type SetSupportOwnershipDto,
  type SetWorkScheduleDto,
} from './dto/support-ownership.dto';
import {
  toEffectiveAvailability,
  toOnCallEntry,
  toSupportOwnership,
  toWorkSchedule,
} from './support-ownership.mapper';
import { SupportOwnershipRepository } from './support-ownership.repository';

/** A date with no time, so an on-call day compares equal however the caller sent it. */
function toDateOnly(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('onDate must be a date');
  }
  return date;
}

/**
 * Support ownership, rotas, availability and on-call.
 *
 * Everything here is provider-internal — a rota and an attendance state are staff records — so the
 * first thing every method does is refuse a client user. The routing engine of package 8b reads
 * what this writes; nothing here routes anything.
 */
@Injectable()
export class SupportOwnershipService {
  constructor(
    private readonly repository: SupportOwnershipRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** The whole configuration screen for one project, including the router's own view of the team. */
  async configFor(
    actor: AuthenticatedUser,
    projectId: string,
    now = new Date(),
  ): Promise<ProjectSupportConfig> {
    this.assertInternal(actor);
    await this.assertProject(actor.organizationId, projectId);

    const ownership = await this.repository.findOrCreateOwnership(actor.organizationId, projectId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, user: { select: { id: true, name: true, email: true } } },
    });
    const userIds = members.map((member) => member.userId);

    const [schedules, availability, onCallToday, onCallWindow] = await Promise.all([
      this.repository.schedulesFor(actor.organizationId, userIds),
      this.repository.availabilityFor(actor.organizationId, userIds),
      this.repository.onCallOn(actor.organizationId, projectId, toDateOnly(now.toISOString())),
      this.repository.onCallForProject(
        actor.organizationId,
        projectId,
        toDateOnly(now.toISOString()),
        new Date(now.getTime() + 27 * 24 * 3600_000),
      ),
    ]);

    const scheduleBy = new Map(schedules.map((row) => [row.userId, row]));
    const availabilityBy = new Map(availability.map((row) => [row.userId, row]));
    // Both the person on call and their backup are covering today.
    const covering = new Set(
      [onCallToday?.userId, onCallToday?.backupUserId].filter((id): id is string => Boolean(id)),
    );

    const team: EffectiveAvailability[] = members.map((member) =>
      toEffectiveAvailability({
        userId: member.userId,
        user: member.user,
        availability: availabilityBy.get(member.userId),
        schedule: scheduleBy.get(member.userId),
        onCall: covering.has(member.userId),
        projectWorkloadLimit: ownership.workloadLimit,
        now,
      }),
    );

    return {
      ownership: toSupportOwnership(ownership),
      onCall: onCallWindow.map(toOnCallEntry),
      team,
    };
  }

  async saveOwnership(
    actor: AuthenticatedUser,
    projectId: string,
    dto: SetSupportOwnershipDto,
  ): Promise<SupportOwnershipSummary> {
    this.assertInternal(actor);
    await this.assertProject(actor.organizationId, projectId);

    // Everybody named has to work here. Without this an ownership row could point at a user from
    // another organization, and the router would later try to hand them a ticket.
    for (const userId of [
      dto.primaryDeveloperId,
      dto.backupDeveloperId,
      dto.seniorId,
      dto.testerId,
      dto.supportExecutiveId,
      dto.fallbackUserId,
      ...Object.values(dto.moduleOwners ?? {}),
    ]) {
      if (userId) {
        await this.assertMember(actor.organizationId, userId);
      }
    }

    const before = await this.repository.findOrCreateOwnership(actor.organizationId, projectId);
    const saved = await this.repository.saveOwnership(actor.organizationId, projectId, {
      ...(dto.primaryDeveloperId !== undefined
        ? { primaryDeveloperId: dto.primaryDeveloperId }
        : {}),
      ...(dto.backupDeveloperId !== undefined ? { backupDeveloperId: dto.backupDeveloperId } : {}),
      ...(dto.seniorId !== undefined ? { seniorId: dto.seniorId } : {}),
      ...(dto.testerId !== undefined ? { testerId: dto.testerId } : {}),
      ...(dto.supportExecutiveId !== undefined
        ? { supportExecutiveId: dto.supportExecutiveId }
        : {}),
      ...(dto.moduleOwners !== undefined ? { moduleOwners: dto.moduleOwners } : {}),
      ...(dto.workloadLimit !== undefined ? { workloadLimit: dto.workloadLimit } : {}),
      ...(dto.ackMinutes !== undefined ? { ackMinutes: dto.ackMinutes } : {}),
      ...(dto.escalationMinutes !== undefined ? { escalationMinutes: dto.escalationMinutes } : {}),
      ...(dto.directTypes !== undefined ? { directTypes: dto.directTypes } : {}),
      ...(dto.autoRouteEnabled !== undefined ? { autoRouteEnabled: dto.autoRouteEnabled } : {}),
      ...(dto.fallbackUserId !== undefined ? { fallbackUserId: dto.fallbackUserId } : {}),
      updatedById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.SUPPORT_OWNERSHIP_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      before: { primaryDeveloperId: before.primaryDeveloperId, ackMinutes: before.ackMinutes },
      after: { primaryDeveloperId: saved.primaryDeveloperId, ackMinutes: saved.ackMinutes },
    });
    return toSupportOwnership(saved);
  }

  async saveSchedule(
    actor: AuthenticatedUser,
    userId: string,
    dto: SetWorkScheduleDto,
  ): Promise<WorkScheduleSummary> {
    this.assertInternal(actor);
    await this.assertMember(actor.organizationId, userId);

    const startMinute = clockOrThrow(dto.startTime);
    const endMinute = clockOrThrow(dto.endTime);
    if (startMinute === endMinute) {
      // Equal times are ambiguous: zero hours, or twenty-four? Neither is what anybody meant.
      throw new BadRequestException('The start and end of a shift cannot be the same time');
    }

    const saved = await this.repository.saveSchedule(actor.organizationId, userId, {
      workingDays: [...new Set(dto.workingDays)].sort((a, b) => a - b),
      startMinute,
      endMinute,
      timezone: dto.timezone ?? DEFAULT_WORK_SCHEDULE.timezone,
      workloadLimit: dto.workloadLimit ?? null,
      updatedById: actor.userId,
    });
    if (!saved) {
      throw new ConflictException(
        'This person’s working hours are managed by another organization',
      );
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_SCHEDULE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      organizationId: actor.organizationId,
      after: { workingDays: saved.workingDays, start: dto.startTime, end: dto.endTime },
    });
    return toWorkSchedule(saved);
  }

  /**
   * Records that somebody is available, on leave or out of hours.
   *
   * This is the seam Ashniva HR writes through. Desk never reads HR's database: HR pushes a fact
   * with a `source` of `HR`, Desk stores it, and the resolver decides what it means alongside the
   * rota. That keeps the two systems independent — HR can change how it decides attendance without
   * Desk knowing, and Desk keeps working if HR goes quiet.
   */
  async setAvailability(
    actor: AuthenticatedUser,
    userId: string,
    dto: SetAvailabilityDto,
  ): Promise<AvailabilitySummary> {
    this.assertInternal(actor);
    await this.assertMember(actor.organizationId, userId);

    const saved = await this.repository.saveAvailability(actor.organizationId, userId, {
      status: dto.status,
      source: dto.source ?? 'MANUAL',
      until: dto.until ? new Date(dto.until) : null,
      note: dto.note ?? null,
      updatedById: actor.userId,
    });
    if (!saved) {
      throw new ConflictException('This person’s availability is managed by another organization');
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.AVAILABILITY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.USER,
      entityId: userId,
      organizationId: actor.organizationId,
      after: { status: saved.status, source: saved.source, until: saved.until },
    });
    return {
      userId: saved.userId,
      user: saved.user,
      status: saved.status,
      source: saved.source,
      until: saved.until?.toISOString() ?? null,
      note: saved.note,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async setOnCall(
    actor: AuthenticatedUser,
    projectId: string,
    dto: SetOnCallDto,
  ): Promise<OnCallEntrySummary> {
    this.assertInternal(actor);
    await this.assertProject(actor.organizationId, projectId);
    await this.assertMember(actor.organizationId, dto.userId);
    if (dto.backupUserId) {
      await this.assertMember(actor.organizationId, dto.backupUserId);
    }
    if (dto.backupUserId && dto.backupUserId === dto.userId) {
      // A backup who is the same person is not cover; it just looks like it on the rota.
      throw new BadRequestException('The backup has to be somebody other than the person on call');
    }

    const saved = await this.repository.setOnCall(
      actor.organizationId,
      projectId,
      toDateOnly(dto.onDate),
      {
        userId: dto.userId,
        backupUserId: dto.backupUserId ?? null,
        note: dto.note ?? null,
        createdById: actor.userId,
      },
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.ON_CALL_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      after: { onDate: dto.onDate, userId: dto.userId, backupUserId: dto.backupUserId ?? null },
    });
    return toOnCallEntry(saved);
  }

  async clearOnCall(actor: AuthenticatedUser, projectId: string, onDate: string): Promise<void> {
    this.assertInternal(actor);
    await this.assertProject(actor.organizationId, projectId);
    const removed = await this.repository.clearOnCall(
      actor.organizationId,
      projectId,
      toDateOnly(onDate),
    );
    if (removed.count === 0) {
      throw new NotFoundException('Nobody is on call for this project on that date');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.ON_CALL_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      after: { onDate, cleared: true },
    });
  }

  /**
   * What one person may see about their own working week.
   *
   * A developer is allowed to read their own rota — it is their shift — but reading it must not
   * be a way to gain the management view. This returns exactly the schedule and nothing about the
   * project, the team or anybody else.
   */
  async mySchedule(actor: AuthenticatedUser): Promise<WorkScheduleSummary | null> {
    this.assertInternal(actor);
    const rows = await this.repository.schedulesFor(actor.organizationId, [actor.userId]);
    return rows[0] ? toWorkSchedule(rows[0]) : null;
  }

  private async assertProject(organizationId: string, projectId: string): Promise<void> {
    const count = await this.prisma.project.count({
      where: { id: projectId, organizationId, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Project not found');
    }
  }

  private async assertMember(organizationId: string, userId: string): Promise<void> {
    const count = await this.prisma.organizationMembership.count({
      where: { organizationId, userId, deletedAt: null },
    });
    if (count === 0) {
      throw new BadRequestException('That person is not a member of this organization');
    }
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Support configuration is internal');
    }
  }
}
