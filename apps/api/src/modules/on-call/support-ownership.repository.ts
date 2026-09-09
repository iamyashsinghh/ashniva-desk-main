import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

const ownershipInclude = {
  primaryDeveloper: userRef,
  backupDeveloper: userRef,
  senior: userRef,
  tester: userRef,
  supportExecutive: userRef,
  fallbackUser: userRef,
} satisfies Prisma.SupportOwnershipInclude;

const onCallInclude = {
  user: userRef,
  backupUser: userRef,
} satisfies Prisma.OnCallScheduleInclude;

export type SupportOwnershipRow = Prisma.SupportOwnershipGetPayload<{
  include: typeof ownershipInclude;
}>;
export type OnCallRow = Prisma.OnCallScheduleGetPayload<{ include: typeof onCallInclude }>;
export type WorkScheduleRow = Prisma.UserWorkScheduleGetPayload<{
  include: { user: typeof userRef };
}>;
export type AvailabilityRow = Prisma.UserAvailabilityGetPayload<{
  include: { user: typeof userRef };
}>;

/**
 * Data access for the four support-configuration tables.
 *
 * Every query carries `organizationId`; row-level security is the backstop rather than the control.
 * All four tables are provider-internal, so none of them has a client-visible read path at all.
 */
@Injectable()
export class SupportOwnershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOwnership(organizationId: string, projectId: string): Promise<SupportOwnershipRow | null> {
    return this.prisma.supportOwnership.findFirst({
      where: { organizationId, projectId },
      include: ownershipInclude,
    });
  }

  /**
   * Reads the ownership row, creating the default the first time a project is asked about it.
   *
   * On demand rather than at project creation, for the same reason `ProjectReleasePolicy` does it:
   * a row for every project ever created is mostly rows nobody edited, and projects that predate
   * this feature would have none. The defaults live in the schema so both paths agree.
   */
  async findOrCreateOwnership(
    organizationId: string,
    projectId: string,
  ): Promise<SupportOwnershipRow> {
    const existing = await this.findOwnership(organizationId, projectId);
    if (existing) {
      return existing;
    }
    // `projectId` is the primary key, so two first-time readers race to one row rather than two.
    return this.prisma.supportOwnership.upsert({
      where: { projectId },
      update: {},
      create: { organizationId, projectId },
      include: ownershipInclude,
    });
  }

  async saveOwnership(
    organizationId: string,
    projectId: string,
    data: Omit<Prisma.SupportOwnershipUncheckedUpdateInput, 'organizationId' | 'projectId'>,
  ): Promise<SupportOwnershipRow> {
    await this.findOrCreateOwnership(organizationId, projectId);
    await this.prisma.supportOwnership.updateMany({ where: { organizationId, projectId }, data });
    return this.findOrCreateOwnership(organizationId, projectId);
  }

  schedulesFor(organizationId: string, userIds: readonly string[]): Promise<WorkScheduleRow[]> {
    return this.prisma.userWorkSchedule.findMany({
      where: { organizationId, userId: { in: [...userIds] } },
      include: { user: userRef },
    });
  }

  availabilityFor(organizationId: string, userIds: readonly string[]): Promise<AvailabilityRow[]> {
    return this.prisma.userAvailability.findMany({
      where: { organizationId, userId: { in: [...userIds] } },
      include: { user: userRef },
    });
  }

  /**
   * Writes one person's rota.
   *
   * Not a plain upsert. The row is keyed by user rather than by (organization, user) — a person has
   * one working week, however many organizations they belong to — so an upsert on `userId` alone
   * would let one provider tenant overwrite a rota belonging to another. The conditional
   * `updateMany` is the repository-wide concurrency idiom: it touches the row only when it is
   * already ours, and the create that follows fails on the primary key when it is not. Null then
   * means "somebody else's", which the service turns into a refusal rather than a silent re-homing.
   */
  async saveSchedule(
    organizationId: string,
    userId: string,
    data: {
      workingDays: number[];
      startMinute: number;
      endMinute: number;
      timezone: string;
      workloadLimit: number | null;
      updatedById: string;
    },
  ): Promise<WorkScheduleRow | null> {
    const updated = await this.prisma.userWorkSchedule.updateMany({
      where: { userId, organizationId },
      data,
    });
    if (updated.count === 0) {
      const created = await this.prisma.userWorkSchedule
        .create({ data: { organizationId, userId, ...data }, include: { user: userRef } })
        .catch(() => null);
      return created;
    }
    return this.prisma.userWorkSchedule.findFirst({
      where: { userId, organizationId },
      include: { user: userRef },
    });
  }

  /**
   * Records the current availability of one person.
   *
   * An upsert rather than an append-only log: this is a *current state*, and Ashniva HR may write
   * to it many times a day. The history that matters — who changed a rota, who put somebody on
   * leave — is in the audit log, which is the place built for it.
   */
  async saveAvailability(
    organizationId: string,
    userId: string,
    data: {
      status: AvailabilityRow['status'];
      source: AvailabilityRow['source'];
      until: Date | null;
      note: string | null;
      updatedById: string | null;
    },
  ): Promise<AvailabilityRow | null> {
    // Same shape as saveSchedule, and for the same reason: keyed by user, written per tenant.
    const updated = await this.prisma.userAvailability.updateMany({
      where: { userId, organizationId },
      data,
    });
    if (updated.count === 0) {
      return this.prisma.userAvailability
        .create({ data: { organizationId, userId, ...data }, include: { user: userRef } })
        .catch(() => null);
    }
    return this.prisma.userAvailability.findFirst({
      where: { userId, organizationId },
      include: { user: userRef },
    });
  }

  onCallForProject(
    organizationId: string,
    projectId: string,
    from: Date,
    to: Date,
  ): Promise<OnCallRow[]> {
    return this.prisma.onCallSchedule.findMany({
      where: { organizationId, projectId, onDate: { gte: from, lte: to } },
      include: onCallInclude,
      orderBy: { onDate: 'asc' },
    });
  }

  /** Who is covering this project today, if anybody. The router's on-call step reads this. */
  async onCallOn(
    organizationId: string,
    projectId: string,
    onDate: Date,
  ): Promise<OnCallRow | null> {
    return this.prisma.onCallSchedule.findFirst({
      where: { organizationId, projectId, onDate },
      include: onCallInclude,
    });
  }

  setOnCall(
    organizationId: string,
    projectId: string,
    onDate: Date,
    data: { userId: string; backupUserId: string | null; note: string | null; createdById: string },
  ): Promise<OnCallRow> {
    return this.prisma.onCallSchedule.upsert({
      where: { projectId_onDate: { projectId, onDate } },
      update: { userId: data.userId, backupUserId: data.backupUserId, note: data.note },
      create: { organizationId, projectId, onDate, ...data },
      include: onCallInclude,
    });
  }

  clearOnCall(organizationId: string, projectId: string, onDate: Date): Promise<{ count: number }> {
    return this.prisma.onCallSchedule.deleteMany({ where: { organizationId, projectId, onDate } });
  }
}
