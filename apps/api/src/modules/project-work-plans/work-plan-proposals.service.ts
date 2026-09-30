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
  type AuthenticatedUser,
  type Priority,
  type ProjectWorkPlan,
  type UserRef,
  type WorkPlanProposal,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, ProjectWorkPlanProposal } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { ProjectRow } from '../projects/projects.repository';
import type {
  AddWorkPlanTopicDto,
  CreateWorkPlanProposalDto,
  DecideWorkPlanProposalDto,
  UpdateWorkPlanProposalDto,
} from './dto/work-plan.dto';
import { ProjectDocService } from './project-doc.service';
import { WorkPlanEventsService } from './work-plan-events.service';
import type { WorkPlanActorFlags } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanService } from './work-plan.service';

const DEFAULT_SOURCE = 'AI_MEMORY';
/** Where work goes when neither the sender nor the person publishing named a phase. */
const DEFAULT_PHASE = 'General';

type Point = { body: string; estimateMinutes: number };

type ProposalFields = {
  title?: string;
  points?: Point[];
  phaseId?: string | null;
  phaseHeading?: string | null;
  titleId?: string | null;
  assignedToId?: string | null;
  reviewerId?: string | null;
  priority?: Priority | null;
  dueDate?: Date | null;
  context?: string | null;
};

/**
 * Work proposed for a project's Summary by an integration (AI Memory). A proposal waits in the
 * Summary until an admin, project manager or team lead publishes it — as sent, or after editing
 * any field — or rejects it. Publishing places it exactly where it says (Desk creates the topic's
 * task when it has a developer); nothing else can put it in the plan.
 */
@Injectable()
export class WorkPlanProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: WorkPlanService,
    private readonly planRows: WorkPlanRepository,
    private readonly docs: ProjectDocService,
    private readonly events: WorkPlanEventsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    projectId: string,
    status: 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'ALL' = 'PENDING',
  ): Promise<WorkPlanProposal[]> {
    const { flags } = await this.plans.projectAccess(actor, projectId);
    const rows = await this.prisma.projectWorkPlanProposal.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        ...(status === 'ALL' ? {} : { status }),
      },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
    });
    return this.toDtos(rows, flags);
  }

  async get(actor: AuthenticatedUser, projectId: string, id: string): Promise<WorkPlanProposal> {
    const { flags } = await this.plans.projectAccess(actor, projectId);
    return this.toDto(await this.find(actor, projectId, id), flags);
  }

  /**
   * Anyone on the project may propose; only the people who may edit the Summary decide. The same
   * `externalId` returns the first proposal (a rejected one is opened again with the new content).
   */
  async create(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    const { flags, project } = await this.plans.projectAccess(actor, projectId);
    const source = dto.source?.trim().toUpperCase() || DEFAULT_SOURCE;
    const externalId = dto.externalId?.trim() || null;
    const fields = this.fields(dto);
    const existing = externalId
      ? await this.prisma.projectWorkPlanProposal.findFirst({
          where: { organizationId: actor.organizationId, source, externalId },
        })
      : null;
    if (existing && existing.projectId !== projectId) {
      throw new ConflictException('This work was already proposed for another project');
    }
    if (existing && existing.status !== 'REJECTED') {
      return this.toDto(existing, flags);
    }
    const row = existing
      ? await this.prisma.projectWorkPlanProposal.update({
          where: { id: existing.id },
          data: {
            ...fields,
            status: 'PENDING',
            decidedById: null,
            decidedAt: null,
            decisionNote: null,
          },
        })
      : await this.prisma.projectWorkPlanProposal.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            source,
            externalId,
            createdById: actor.userId,
            ...fields,
            title: fields.title ?? dto.title.trim(),
            points: (fields.points ?? cleanPoints(dto.points)) as Prisma.InputJsonValue,
          },
        });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PROPOSAL_RECEIVED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { proposalId: row.id, source, externalId, title: row.title },
    });
    await this.events.proposed(actor, project, row.id, row.title);
    return this.toDto(row, flags);
  }

  async update(
    actor: AuthenticatedUser,
    projectId: string,
    id: string,
    dto: UpdateWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    const { flags } = await this.decider(actor, projectId);
    const current = await this.pending(actor, projectId, id);
    const row = await this.prisma.projectWorkPlanProposal.update({
      where: { id: current.id },
      data: this.fields(dto),
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PROPOSAL_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { proposalId: id, changed: Object.keys(dto) },
    });
    return this.toDto(row, flags);
  }

  /** Publish as it is, or with last edits in the same call. */
  async publish(
    actor: AuthenticatedUser,
    projectId: string,
    id: string,
    dto: UpdateWorkPlanProposalDto & DecideWorkPlanProposalDto,
  ): Promise<{ proposal: WorkPlanProposal; plan: ProjectWorkPlan }> {
    const { flags, project } = await this.decider(actor, projectId);
    const { note, ...edits } = dto;
    let proposal = await this.pending(actor, projectId, id);
    if (Object.keys(edits).length > 0) {
      proposal = await this.prisma.projectWorkPlanProposal.update({
        where: { id: proposal.id },
        data: this.fields(edits),
      });
    }
    const points = readPoints(proposal.points);
    if (points.length === 0) {
      throw new BadRequestException('Add at least one step before publishing');
    }
    if (proposal.assignedToId && !this.plans.isDeveloperOn(project, proposal.assignedToId)) {
      throw new BadRequestException(
        'The developer must be a developer on this project. Choose one, or publish it unassigned.',
      );
    }
    const reviewerId =
      proposal.reviewerId && this.plans.isTeamMemberOf(project, proposal.reviewerId)
        ? proposal.reviewerId
        : null;
    const target = await this.target(actor, projectId, proposal);
    const added = await this.plans.addTopic(actor, projectId, {
      ...target,
      points,
      assignedToId: proposal.assignedToId,
      priority: proposal.priority,
      dueDate: proposal.dueDate?.toISOString().slice(0, 10) ?? null,
      reviewerId,
    } as AddWorkPlanTopicDto);
    const row = await this.prisma.projectWorkPlanProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'PUBLISHED',
        decidedById: actor.userId,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
        phaseId: added.phaseId,
        titleId: target.titleId ?? null,
        publishedTitleId: added.titleId,
        publishedTaskId: added.task?.id ?? null,
        publishedTaskKey: added.task?.key ?? null,
      },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PROPOSAL_PUBLISHED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        proposalId: id,
        phaseId: added.phaseId,
        titleId: added.titleId,
        taskKey: added.task?.key ?? null,
      },
    });
    this.docs.refreshSoon(actor.organizationId, projectId);
    return { proposal: await this.toDto(row, flags), plan: added.plan };
  }

  async reject(
    actor: AuthenticatedUser,
    projectId: string,
    id: string,
    dto: DecideWorkPlanProposalDto,
  ): Promise<WorkPlanProposal> {
    const { flags } = await this.decider(actor, projectId);
    const proposal = await this.pending(actor, projectId, id);
    const row = await this.prisma.projectWorkPlanProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'REJECTED',
        decidedById: actor.userId,
        decidedAt: new Date(),
        decisionNote: dto.note?.trim() || null,
      },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PROPOSAL_REJECTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { proposalId: id, note: row.decisionNote },
    });
    return this.toDto(row, flags);
  }

  /** The phase and topic it goes into; ones removed from the Summary since fall back gracefully. */
  private async target(
    actor: AuthenticatedUser,
    projectId: string,
    proposal: ProjectWorkPlanProposal,
  ): Promise<{ phaseId?: string; phaseHeading?: string; titleId?: string; title?: string }> {
    const plan = await this.planRows.findByProject(actor.organizationId, projectId);
    const phases = plan?.phases ?? [];
    if (
      proposal.titleId &&
      phases.some((phase) => phase.titles.some((t) => t.id === proposal.titleId))
    ) {
      return { titleId: proposal.titleId };
    }
    const title = proposal.title.trim();
    if (proposal.phaseId && phases.some((phase) => phase.id === proposal.phaseId)) {
      return { phaseId: proposal.phaseId, title };
    }
    return { phaseHeading: proposal.phaseHeading?.trim() || DEFAULT_PHASE, title };
  }

  private async decider(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<{ flags: WorkPlanActorFlags; project: ProjectRow }> {
    const access = await this.plans.projectAccess(actor, projectId);
    if (!access.flags.canAssign) {
      throw new ForbiddenException(
        'Only an admin, project manager or team lead can publish work to this Summary',
      );
    }
    return access;
  }

  private async find(
    actor: AuthenticatedUser,
    projectId: string,
    id: string,
  ): Promise<ProjectWorkPlanProposal> {
    const row = await this.prisma.projectWorkPlanProposal.findFirst({
      where: { id, organizationId: actor.organizationId, projectId },
    });
    if (!row) {
      throw new NotFoundException('Proposal not found');
    }
    return row;
  }

  private async pending(
    actor: AuthenticatedUser,
    projectId: string,
    id: string,
  ): Promise<ProjectWorkPlanProposal> {
    const row = await this.find(actor, projectId, id);
    if (row.status !== 'PENDING') {
      throw new ConflictException(
        row.status === 'PUBLISHED' ? 'This was already published' : 'This was rejected',
      );
    }
    return row;
  }

  private fields(dto: UpdateWorkPlanProposalDto): ProposalFields {
    const data: ProposalFields = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.points !== undefined) data.points = cleanPoints(dto.points);
    if (dto.phaseId !== undefined) data.phaseId = dto.phaseId;
    if (dto.phaseHeading !== undefined) data.phaseHeading = dto.phaseHeading?.trim() || null;
    if (dto.titleId !== undefined) data.titleId = dto.titleId;
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId;
    if (dto.reviewerId !== undefined) data.reviewerId = dto.reviewerId;
    if (dto.priority !== undefined) data.priority = dto.priority as Priority | null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.context !== undefined) data.context = dto.context?.trim() || null;
    return data;
  }

  private async toDto(
    row: ProjectWorkPlanProposal,
    flags: WorkPlanActorFlags,
  ): Promise<WorkPlanProposal> {
    const [dto] = await this.toDtos([row], flags);
    if (!dto) throw new Error('Proposal could not be read');
    return dto;
  }

  private async toDtos(
    rows: ProjectWorkPlanProposal[],
    flags: WorkPlanActorFlags,
  ): Promise<WorkPlanProposal[]> {
    const ids = new Set<string>();
    for (const row of rows) {
      for (const id of [row.assignedToId, row.reviewerId, row.createdById, row.decidedById]) {
        if (id) ids.add(id);
      }
    }
    const users = ids.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...ids] } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map<string, UserRef>(users.map((user) => [user.id, user]));
    const ref = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      status: row.status,
      source: row.source,
      externalId: row.externalId,
      phaseId: row.phaseId,
      phaseHeading: row.phaseHeading,
      titleId: row.titleId,
      title: row.title,
      points: readPoints(row.points),
      assignedTo: ref(row.assignedToId),
      reviewer: ref(row.reviewerId),
      priority: row.priority,
      dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
      context: row.context,
      createdBy: ref(row.createdById),
      decidedBy: ref(row.decidedById),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      publishedTitleId: row.publishedTitleId,
      task:
        row.publishedTaskId && row.publishedTaskKey
          ? { id: row.publishedTaskId, key: row.publishedTaskKey }
          : null,
      createdAt: row.createdAt.toISOString(),
      canDecide: flags.canAssign && row.status === 'PENDING',
    }));
  }
}

function cleanPoints(points: Point[]): Point[] {
  return points
    .map((point) => ({ body: point.body.trim(), estimateMinutes: point.estimateMinutes }))
    .filter((point) => point.body.length > 0);
}

function readPoints(value: Prisma.JsonValue): Point[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const { body, estimateMinutes } = entry as { body?: unknown; estimateMinutes?: unknown };
    return typeof body === 'string' && typeof estimateMinutes === 'number'
      ? [{ body, estimateMinutes }]
      : [];
  });
}
