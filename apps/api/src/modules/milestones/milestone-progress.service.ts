import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  MILESTONE_PROGRESS_MODE,
  MILESTONE_STATUS,
  PERMISSIONS,
  canTransitionMilestone,
  type AuthenticatedUser,
  type MilestoneDetail,
  type MilestoneStatus,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { MilestoneProgressDto, MilestoneStatusDto } from './dto/milestone.dto';
import { computeProgress, toMilestoneDetail } from './milestones.mapper';
import { MilestonesRepository, type MilestoneDetailRow } from './milestones.repository';

/**
 * Status changes, progress (automatic from linked work, or an audited manual override) and
 * deliverable ticks. Kept apart from MilestonesService so each file stays small.
 */
@Injectable()
export class MilestoneProgressService {
  constructor(
    private readonly milestones: MilestonesRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async changeStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: MilestoneStatusDto,
  ): Promise<MilestoneDetail> {
    const row = await this.require(actor, id);
    const from = row.status as MilestoneStatus;
    if (from !== dto.status && !canTransitionMilestone(from, dto.status)) {
      throw new BadRequestException(`A milestone cannot go from ${from} to ${dto.status}`);
    }
    if (dto.status === MILESTONE_STATUS.COMPLETED) {
      const open = await this.prisma.milestone.count({
        where: {
          id: { in: row.dependsOn.map((edge) => edge.dependsOn.id) },
          status: { not: MILESTONE_STATUS.COMPLETED },
          deletedAt: null,
        },
      });
      if (open > 0) {
        throw new BadRequestException('Milestones it depends on must be completed first');
      }
    }
    const completed = dto.status === MILESTONE_STATUS.COMPLETED;
    await this.milestones.update(id, {
      status: dto.status,
      completedAt: completed ? new Date() : null,
      ...(completed ? { progressPercent: 100 } : {}),
    });
    await this.milestones.addHistory({
      milestoneId: id,
      kind: 'STATUS',
      fromValue: from,
      toValue: dto.status,
      reason: dto.note?.trim() || null,
      changedById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.MILESTONE_STATUS_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.MILESTONE,
      entityId: id,
      before: { status: from },
      after: { status: dto.status, note: dto.note ?? null },
    });
    return this.detail(actor, id);
  }

  /** Managers may override the computed progress, but only with a recorded reason. */
  async adjustProgress(
    actor: AuthenticatedUser,
    id: string,
    dto: MilestoneProgressDto,
  ): Promise<MilestoneDetail> {
    if (!actor.permissions.includes(PERMISSIONS.MILESTONE_MANAGE)) {
      throw new ForbiddenException('Only managers adjust milestone progress');
    }
    const row = await this.require(actor, id);
    const from = row.progressPercent;
    if (dto.resetToAuto) {
      await this.milestones.update(id, { progressMode: MILESTONE_PROGRESS_MODE.AUTO });
      await this.recompute(id);
    } else {
      await this.milestones.update(id, {
        progressMode: MILESTONE_PROGRESS_MODE.MANUAL,
        progressPercent: dto.progressPercent,
      });
    }
    const after = await this.require(actor, id);
    await this.milestones.addHistory({
      milestoneId: id,
      kind: 'PROGRESS',
      fromValue: String(from),
      toValue: String(after.progressPercent),
      reason: dto.reason.trim(),
      changedById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.MILESTONE_PROGRESS_ADJUSTED,
      entityType: AUDIT_ENTITY_TYPE.MILESTONE,
      entityId: id,
      before: { progressPercent: from, mode: row.progressMode },
      after: {
        progressPercent: after.progressPercent,
        mode: after.progressMode,
        reason: dto.reason,
      },
    });
    return this.detail(actor, id);
  }

  async setDeliverableDone(
    actor: AuthenticatedUser,
    id: string,
    deliverableId: string,
    isDone: boolean,
  ) {
    const row = await this.require(actor, id);
    const item = row.deliverables.find((entry) => entry.id === deliverableId);
    if (!item) {
      throw new NotFoundException('Deliverable not found');
    }
    await this.milestones.setDeliverableDone(id, deliverableId, isDone);
    await this.milestones.addHistory({
      milestoneId: id,
      kind: 'DELIVERABLE',
      fromValue: item.title,
      toValue: isDone ? 'done' : 'reopened',
      changedById: actor.userId,
    });
    await this.recompute(id);
    return this.detail(actor, id);
  }

  /** Recomputes automatic progress; called after any linked task or deliverable changes. */
  async recompute(milestoneId: string): Promise<void> {
    const row = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, deletedAt: null },
    });
    if (!row || row.progressMode !== MILESTONE_PROGRESS_MODE.AUTO) {
      return;
    }
    const inputs = await this.milestones.progressInputs(milestoneId);
    const progress = row.status === MILESTONE_STATUS.COMPLETED ? 100 : computeProgress(inputs);
    if (progress !== row.progressPercent) {
      await this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { progressPercent: progress },
      });
    }
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<MilestoneDetailRow> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Milestones are managed by the service provider');
    }
    const row = await this.milestones.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Milestone not found');
    }
    return row;
  }

  private async detail(actor: AuthenticatedUser, id: string): Promise<MilestoneDetail> {
    const row = await this.require(actor, id);
    const approvals = await this.milestones.latestApprovalStatusMap([row.id]);
    return toMilestoneDetail(row, approvals.get(row.id) ?? null);
  }
}
