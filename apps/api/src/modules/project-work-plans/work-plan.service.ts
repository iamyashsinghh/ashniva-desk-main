import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  dueAtFromStart,
  parseWorkPlanFromText,
  scoreAfterPenalty,
  type AuthenticatedUser,
  type ProjectWorkPlan,
  type WorkPlanDraftPhase,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { FilesRepository } from '../files/files.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import type { ParseWorkPlanDto, SaveWorkPlanDto, WorkPlanPhaseDto } from './dto/work-plan.dto';
import { bufferFromStream, extractPdfText, looksLikePdf } from './work-plan-pdf';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanMapper } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';

@Injectable()
export class WorkPlanService {
  private readonly logger = new Logger(WorkPlanService.name);

  constructor(
    private readonly plans: WorkPlanRepository,
    private readonly mapper: WorkPlanMapper,
    private readonly projects: ProjectsRepository,
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly gemini: WorkPlanGeminiService,
  ) {}

  async get(actor: AuthenticatedUser, projectId: string): Promise<ProjectWorkPlan> {
    const flags = await this.flags(actor, projectId);
    const row = await this.plans.findByProject(actor.organizationId, projectId);
    if (row) {
      await this.applyOverduePenalties(row.id);
    }
    const fresh = row
      ? await this.plans.findByProject(actor.organizationId, projectId)
      : null;
    return this.mapper.toDetail(fresh, actor, flags, projectId, new Date());
  }

  async save(
    actor: AuthenticatedUser,
    projectId: string,
    dto: SaveWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const flags = await this.flags(actor, projectId);
    if (!flags.canManage) {
      throw new ForbiddenException('Only a manager can edit this plan');
    }
    this.assertPhases(dto.phases);
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    if (existing && this.hasStartedWork(existing)) {
      throw new ConflictException('Started points cannot be rewritten. Finish them first.');
    }
    const row = await this.plans.replace(
      actor.organizationId,
      projectId,
      actor.userId,
      existing?.sourceFileId ? 'MIXED' : 'MANUAL',
      existing?.sourceFileId ?? null,
      dto.phases,
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { phases: dto.phases.length },
    });
    return this.mapper.toDetail(row, actor, flags, projectId, new Date());
  }

  async parse(
    actor: AuthenticatedUser,
    projectId: string,
    dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const flags = await this.flags(actor, projectId);
    if (!flags.canManage) {
      throw new ForbiddenException('Only a manager can upload a brief');
    }
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    if (existing && this.hasStartedWork(existing)) {
      throw new ConflictException('Started points cannot be rewritten. Finish them first.');
    }
    const file = await this.files.findById(actor.organizationId, dto.fileId);
    if (!file || file.projectId !== projectId) {
      throw new NotFoundException('File not found');
    }
    const object = await this.storage.getObject(file.storageKey);
    const pdf = await bufferFromStream(object.stream);
    if (!looksLikePdf(pdf, file.contentType)) {
      throw new BadRequestException('Upload a PDF');
    }
    const phases = this.draftToDto(await this.phasesFromPdf(pdf));
    const row = await this.plans.replace(
      actor.organizationId,
      projectId,
      actor.userId,
      'PDF',
      file.id,
      phases,
    );
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PARSED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { fileId: file.id, phases: phases.length },
    });
    return this.mapper.toDetail(row, actor, flags, projectId, new Date());
  }

  private async phasesFromPdf(pdf: Buffer): Promise<WorkPlanDraftPhase[]> {
    if (this.gemini.isEnabled()) {
      try {
        const analysed = await this.gemini.analysePdf(pdf);
        if (analysed.length > 0) {
          return analysed;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Gemini analysis failed, falling back to extracted text: ${reason}`);
      }
    } else {
      this.logger.warn('GEMINI_API_KEY is not set; falling back to PDF text extraction');
    }
    return this.draftFromText(extractPdfText(pdf));
  }

  async start(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
  ): Promise<ProjectWorkPlan> {
    const flags = await this.flags(actor, projectId);
    if (!flags.canWork) {
      throw new ForbiddenException('You cannot start work on this plan');
    }
    const point = await this.plans.findPoint(actor.organizationId, projectId, pointId);
    if (!point) {
      throw new NotFoundException('Point not found');
    }
    if (point.startedAt) {
      throw new ConflictException('This point has already been started');
    }
    const startedAt = new Date();
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        startedAt,
        dueAt: dueAtFromStart(startedAt, point.estimateMinutes),
        startedById: actor.userId,
      },
    });
    await this.ensureScore(point.title.phase.planId, actor.userId);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_STARTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id },
    });
    return this.get(actor, projectId);
  }

  async complete(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
  ): Promise<ProjectWorkPlan> {
    const flags = await this.flags(actor, projectId);
    const point = await this.plans.findPoint(actor.organizationId, projectId, pointId);
    if (!point) {
      throw new NotFoundException('Point not found');
    }
    if (!point.startedAt) {
      throw new ConflictException('Start this point before completing it');
    }
    if (point.completedAt) {
      return this.get(actor, projectId);
    }
    if (!flags.canManage && point.startedById !== actor.userId) {
      throw new ForbiddenException('Only the person who started this point can complete it');
    }
    await this.applyOverduePenalties(point.title.phase.planId);
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: { completedAt: new Date() },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_COMPLETED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id },
    });
    return this.get(actor, projectId);
  }

  private draftFromText(text: string): WorkPlanDraftPhase[] {
    const parsed = parseWorkPlanFromText(text);
    if (parsed.length > 0) {
      return parsed;
    }
    const body = text.replace(/\s+/g, ' ').trim();
    if (body.length < 8) {
      throw new BadRequestException(
        'This PDF has no readable project text to divide into phases. Try again, or add phases by hand.',
      );
    }
    return [
      {
        heading: 'Phase 1',
        titles: [{ title: 'Title 1', points: [{ body, estimateMinutes: 30 }] }],
      },
    ];
  }

  private draftToDto(phases: WorkPlanDraftPhase[]): WorkPlanPhaseDto[] {
    return phases.map((phase) => ({
      heading: phase.heading,
      titles: phase.titles.map((title) => ({
        title: title.title,
        points: title.points,
      })),
    }));
  }

  private assertPhases(phases: WorkPlanPhaseDto[]): void {
    if (phases.length === 0) {
      throw new BadRequestException('Add at least one phase');
    }
  }

  private hasStartedWork(row: { phases: Array<{ titles: Array<{ points: Array<{ startedAt: Date | null }> }> }> }): boolean {
    return row.phases.some((phase) =>
      phase.titles.some((title) => title.points.some((point) => point.startedAt !== null)),
    );
  }

  private async applyOverduePenalties(planId: string): Promise<void> {
    const now = new Date();
    const overdue = await this.prisma.projectWorkPlanPoint.findMany({
      where: {
        title: { phase: { planId } },
        completedAt: null,
        penaltyApplied: false,
        startedById: { not: null },
        dueAt: { not: null, lte: now },
      },
      select: { id: true, startedById: true },
    });
    for (const point of overdue) {
      const userId = point.startedById;
      if (!userId) {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        const marked = await tx.projectWorkPlanPoint.updateMany({
          where: { id: point.id, penaltyApplied: false },
          data: { penaltyApplied: true },
        });
        if (marked.count === 0) {
          return;
        }
        const existing = await tx.projectWorkPlanScore.findUnique({
          where: { planId_userId: { planId, userId } },
        });
        const percent = scoreAfterPenalty(existing?.percent ?? 100);
        await tx.projectWorkPlanScore.upsert({
          where: { planId_userId: { planId, userId } },
          create: { planId, userId, percent },
          update: { percent },
        });
      });
    }
  }

  private async ensureScore(planId: string, userId: string): Promise<void> {
    await this.prisma.projectWorkPlanScore.upsert({
      where: { planId_userId: { planId, userId } },
      create: { planId, userId, percent: 100 },
      update: {},
    });
  }

  private async flags(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<{ canManage: boolean; canWork: boolean }> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients use the portal to see their projects');
    }
    const project = await this.projects.findById(actor.organizationId, projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const canManage = actor.permissions.includes(PERMISSIONS.PROJECT_MANAGE);
    const onProject =
      project.managerUserId === actor.userId ||
      project.leadUserId === actor.userId ||
      project.members.some((member) => member.userId === actor.userId);
    const canWork =
      canManage || (onProject && actor.permissions.includes(PERMISSIONS.TASK_WORK));
    return { canManage, canWork };
  }
}
