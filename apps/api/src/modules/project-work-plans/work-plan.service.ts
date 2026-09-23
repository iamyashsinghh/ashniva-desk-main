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
  PRIORITY,
  PROJECT_MEMBER_ROLE,
  ROLE_KEYS,
  WORK_PLAN_NOTE_KIND,
  WORK_PLAN_POINT_STATUS,
  WORK_PLAN_ASSIGN_SCOPE,
  WORK_PLAN_EVENT_KIND,
  dueAtFromStart,
  dueAtFromRemaining,
  remainingSeconds,
  extraThisRunSeconds,
  elapsedSeconds,
  effectiveWorkPlanAssigneeId,
  parseWorkPlanFromText,
  scoreAfterPenalty,
  seesAllOrganizationProjects,
  matchWorkPlanAdditionPhase,
  workPlanFromFreeText,
  workPlanPointActions,
  combineWorkPlanTitles,
  isWorkPlanTimerFrozen,
  VISIBILITY,
  type AuthenticatedUser,
  type ProjectWorkPlan,
  type UserRef,
  type WorkPlanDraftAddition,
  type WorkPlanDraftPhase,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { FilesRepository } from '../files/files.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import type {
  AddWorkPlanWorkDto,
  AssignWorkPlanDto,
  CombineWorkPlanTitlesDto,
  ParseWorkPlanDto,
  SaveWorkPlanAssignmentsDto,
  SaveWorkPlanDto,
  WorkPlanNoteDto,
  WorkPlanPhaseDto,
} from './dto/work-plan.dto';
import { bufferFromStream, extractPdfText, looksLikePdf } from './work-plan-pdf';
import { WorkPlanEventsService } from './work-plan-events.service';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanMapper, type WorkPlanActorFlags, type WorkPlanRow } from './work-plan.mapper';
import { WorkPlanRepository } from './work-plan.repository';
import { WorkPlanTasksService } from './work-plan-tasks.service';
import type { ProjectRow } from '../projects/projects.repository';

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
    private readonly events: WorkPlanEventsService,
    private readonly planTasks: WorkPlanTasksService,
  ) {}

  async get(actor: AuthenticatedUser, projectId: string): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    const row = await this.plans.findByProject(actor.organizationId, projectId);
    if (row) {
      await this.applyOverduePenalties(row.id);
    }
    const fresh = row ? await this.plans.findByProject(actor.organizationId, projectId) : null;
    return this.detail(actor, flags, project, fresh);
  }

  async save(
    actor: AuthenticatedUser,
    projectId: string,
    dto: SaveWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign) {
      throw new ForbiddenException(
        'Only an admin, project manager or team lead can edit this plan',
      );
    }
    this.assertPhases(dto.phases);
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    const row = await this.plans.savePhases(
      actor.organizationId,
      projectId,
      actor.userId,
      existing?.sourceFileId ? 'MIXED' : 'MANUAL',
      existing?.sourceFileId ?? null,
      dto.phases,
    );
    await this.planTasks.sync(actor, project, row);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { phases: dto.phases.length },
    });
    return this.detail(actor, flags, project, row);
  }

  async parse(
    actor: AuthenticatedUser,
    projectId: string,
    dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign) {
      throw new ForbiddenException(
        'Only an admin, project manager or team lead can upload a brief',
      );
    }
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    if (existing && this.hasStartedWork(existing)) {
      throw new ConflictException(
        'Started points cannot be replaced by a PDF. Add or edit phases by hand instead.',
      );
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
    const row = await this.plans.savePhases(
      actor.organizationId,
      projectId,
      actor.userId,
      'PDF',
      file.id,
      phases,
    );
    await this.planTasks.sync(actor, project, row);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_PARSED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { fileId: file.id, phases: phases.length },
    });
    return this.detail(actor, flags, project, row);
  }

  async addWork(
    actor: AuthenticatedUser,
    projectId: string,
    dto: AddWorkPlanWorkDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign) {
      throw new ForbiddenException(
        'Only an admin, project manager or team lead can add work to this plan',
      );
    }
    const assignedToId = dto.assignedToId ?? null;
    this.assertOptionalDeveloper(project, assignedToId);
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    const added = await this.draftForAdd(dto, existing);
    const merged = this.mergeAddedWork(existing, added);
    this.assertPhases(merged);
    const row = await this.plans.savePhases(
      actor.organizationId,
      projectId,
      actor.userId,
      existing?.sourceFileId ? 'MIXED' : (existing?.source ?? 'MANUAL'),
      existing?.sourceFileId ?? null,
      merged,
    );
    const previous = {
      phases: new Set(existing?.phases.map((phase) => phase.id) ?? []),
      titles: new Set(
        existing?.phases.flatMap((phase) => phase.titles.map((title) => title.id)) ?? [],
      ),
    };
    await this.applyNewWorkAssignment(row, previous, assignedToId, dto.priority ?? null);
    const fresh = await this.plans.findByProject(actor.organizationId, projectId);
    if (assignedToId) {
      await this.events.assigned(actor, project, assignedToId, 'work on this plan');
    }
    if (fresh) {
      await this.planTasks.sync(actor, project, fresh);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        assignedToId,
        priority: dto.priority,
        additions: added.map((item) => ({ phaseId: item.phaseId, heading: item.heading })),
      },
    });
    return this.detail(actor, flags, project, fresh ?? row);
  }

  async combineTitles(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CombineWorkPlanTitlesDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign && !flags.canWork) {
      throw new ForbiddenException(
        'Only a developer, team lead, project manager or director can combine topics',
      );
    }
    const titleIds = [...new Set(dto.titleIds)];
    if (titleIds.length < 2) {
      throw new BadRequestException('Pick at least two topics in the same phase');
    }
    const existing = await this.plans.findByProject(actor.organizationId, projectId);
    if (!existing) {
      throw new NotFoundException('Work plan not found');
    }
    const phase = existing.phases.find((item) => item.id === dto.phaseId);
    if (!phase) {
      throw new NotFoundException('Phase not found');
    }
    const selected = titleIds.map((id) => {
      const title = phase.titles.find((item) => item.id === id);
      if (!title) {
        throw new BadRequestException('Every topic must be in the same phase');
      }
      return title;
    });
    selected.sort((left, right) => left.sortOrder - right.sortOrder);

    if (!flags.canAssign) {
      for (const title of selected) {
        const assigneeId = effectiveWorkPlanAssigneeId(
          title.assignedToId,
          phase.assignedToId,
          existing.assignedToId,
        );
        if (assigneeId !== actor.userId) {
          throw new ForbiddenException('You can only combine topics assigned to you');
        }
      }
    }

    for (const title of selected) {
      for (const point of title.points) {
        if (point.startedAt || point.status !== WORK_PLAN_POINT_STATUS.PENDING) {
          throw new ConflictException(
            'Started or finished topics cannot be combined. Finish them first, or keep them separate.',
          );
        }
        if (point.isError) {
          throw new ConflictException('Topics with error steps cannot be combined yet.');
        }
      }
    }

    let combined;
    try {
      combined = combineWorkPlanTitles({
        titles: selected.map((title) => ({
          title: title.title,
          points: title.points.map((point) => ({
            body: point.body,
            estimateMinutes: point.estimateMinutes,
            isError: point.isError,
          })),
        })),
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Cannot combine');
    }

    const keep = selected[0]!;
    const dropIds = selected.slice(1).map((title) => title.id);
    const pointIds = selected.flatMap((title) => title.points.map((point) => point.id));

    await this.prisma.$transaction(async (tx) => {
      if (dropIds.length > 0) {
        await tx.task.updateMany({
          where: {
            organizationId: actor.organizationId,
            workPlanTitleId: { in: dropIds },
            deletedAt: null,
          },
          data: { deletedAt: new Date(), workPlanTitleId: null },
        });
      }
      if (pointIds.length > 0) {
        await tx.projectWorkPlanPoint.deleteMany({ where: { id: { in: pointIds } } });
      }
      if (dropIds.length > 0) {
        await tx.projectWorkPlanTitle.deleteMany({ where: { id: { in: dropIds } } });
      }
      await tx.projectWorkPlanTitle.update({
        where: { id: keep.id },
        data: { title: combined.title },
      });
      await tx.projectWorkPlanPoint.create({
        data: {
          titleId: keep.id,
          body: combined.body,
          estimateMinutes: combined.estimateMinutes,
          sortOrder: 0,
        },
      });
    });

    const fresh = await this.plans.findByProject(actor.organizationId, projectId);
    if (fresh) {
      await this.planTasks.sync(actor, project, fresh);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: {
        combinedTitleId: keep.id,
        phaseId: phase.id,
        fromTitleIds: titleIds,
        estimateMinutes: combined.estimateMinutes,
      },
    });
    return this.detail(actor, flags, project, fresh);
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

  async assign(
    actor: AuthenticatedUser,
    projectId: string,
    dto: AssignWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign) {
      throw new ForbiddenException('Only a manager or team lead can assign this plan');
    }
    const row = await this.plans.findByProject(actor.organizationId, projectId);
    if (!row) {
      throw new NotFoundException('Work plan not found');
    }
    const assignedToId = dto.assignedToId ?? null;
    if (assignedToId) {
      this.assertDeveloper(project, assignedToId);
    }
    if (dto.scope === WORK_PLAN_ASSIGN_SCOPE.PROJECT) {
      await this.assignProject(row.id, assignedToId);
    } else if (dto.scope === WORK_PLAN_ASSIGN_SCOPE.PHASE) {
      if (!dto.phaseId) {
        throw new BadRequestException('Pick a phase to assign');
      }
      const phase = row.phases.find((item) => item.id === dto.phaseId);
      if (!phase) {
        throw new NotFoundException('Phase not found');
      }
      await this.assignPhase(phase.id, assignedToId);
    } else {
      if (!dto.titleId) {
        throw new BadRequestException('Pick a topic to assign');
      }
      const title = row.phases
        .flatMap((phase) => phase.titles.map((item) => ({ phase, title: item })))
        .find((item) => item.title.id === dto.titleId);
      if (!title || (dto.phaseId && title.phase.id !== dto.phaseId)) {
        throw new NotFoundException('Title not found');
      }
      await this.prisma.projectWorkPlanTitle.update({
        where: { id: title.title.id },
        data: this.assigneeStamp(
          title.title.assignedToId,
          assignedToId,
          title.title.assignedAt,
          new Date(),
        ),
      });
    }
    const label =
      dto.scope === WORK_PLAN_ASSIGN_SCOPE.PROJECT
        ? 'the project'
        : dto.scope === WORK_PLAN_ASSIGN_SCOPE.PHASE
          ? 'a phase'
          : 'a topic';
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_ASSIGNED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { scope: dto.scope, phaseId: dto.phaseId, titleId: dto.titleId, assignedToId },
    });
    if (assignedToId) {
      await this.events.assigned(actor, project, assignedToId, label);
    }
    await this.syncTasks(actor, project, projectId);
    return this.get(actor, projectId);
  }

  async saveAssignments(
    actor: AuthenticatedUser,
    projectId: string,
    dto: SaveWorkPlanAssignmentsDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    if (!flags.canAssign) {
      throw new ForbiddenException('Only a manager or team lead can assign this plan');
    }
    const row = await this.plans.findByProject(actor.organizationId, projectId);
    if (!row) {
      throw new NotFoundException('Work plan not found');
    }
    const assignedToId = dto.assignedToId ?? null;
    const priority = dto.priority ?? PRIORITY.MEDIUM;
    this.assertOptionalDeveloper(project, assignedToId);
    const phaseIds = new Set(row.phases.map((phase) => phase.id));
    const titleIds = new Set(row.phases.flatMap((phase) => phase.titles.map((title) => title.id)));
    for (const phase of dto.phases) {
      if (!phaseIds.has(phase.id)) {
        throw new NotFoundException('Phase not found');
      }
      this.assertOptionalDeveloper(project, phase.assignedToId ?? null);
    }
    for (const title of dto.titles) {
      if (!titleIds.has(title.id)) {
        throw new NotFoundException('Title not found');
      }
      this.assertOptionalDeveloper(project, title.assignedToId ?? null);
    }
    const previousAssignees = new Set(
      [
        row.assignedToId,
        ...row.phases.map((phase) => phase.assignedToId),
        ...row.phases.flatMap((phase) => phase.titles.map((title) => title.assignedToId)),
      ].filter((id): id is string => Boolean(id)),
    );
    const now = new Date();
    const phaseById = new Map(row.phases.map((phase) => [phase.id, phase]));
    const titleById = new Map(
      row.phases.flatMap((phase) => phase.titles.map((title) => [title.id, title] as const)),
    );
    await this.prisma.$transaction([
      this.prisma.projectWorkPlan.update({
        where: { id: row.id },
        data: {
          ...this.assigneeStamp(row.assignedToId, assignedToId, row.assignedAt, now),
          priority,
        },
      }),
      ...dto.phases.map((phase) => {
        const current = phaseById.get(phase.id);
        return this.prisma.projectWorkPlanPhase.update({
          where: { id: phase.id },
          data: {
            ...this.assigneeStamp(
              current?.assignedToId ?? null,
              phase.assignedToId ?? null,
              current?.assignedAt ?? null,
              now,
            ),
            priority: phase.priority ?? null,
          },
        });
      }),
      ...dto.titles.map((title) => {
        const current = titleById.get(title.id);
        return this.prisma.projectWorkPlanTitle.update({
          where: { id: title.id },
          data: {
            ...this.assigneeStamp(
              current?.assignedToId ?? null,
              title.assignedToId ?? null,
              current?.assignedAt ?? null,
              now,
            ),
            priority: title.priority ?? null,
          },
        });
      }),
    ]);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_ASSIGNED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { assignedToId, priority, phases: dto.phases, titles: dto.titles },
    });
    const nextAssignees = new Set(
      [
        assignedToId,
        ...dto.phases.map((phase) => phase.assignedToId ?? null),
        ...dto.titles.map((title) => title.assignedToId ?? null),
      ].filter((id): id is string => Boolean(id)),
    );
    for (const userId of nextAssignees) {
      if (!previousAssignees.has(userId)) {
        await this.events.assigned(actor, project, userId, 'work on this plan');
      }
    }
    await this.syncTasks(actor, project, projectId);
    return this.get(actor, projectId);
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
    const assignedToId = effectiveWorkPlanAssigneeId(
      point.title.assignedToId,
      point.title.phase.assignedToId,
      point.title.phase.plan.assignedToId,
    );
    const openErrorChild = point.isError
      ? null
      : await this.prisma.projectWorkPlanPoint.findFirst({
          where: {
            parentPointId: point.id,
            isError: true,
            status: WORK_PLAN_POINT_STATUS.PENDING,
          },
          select: { id: true },
        });
    const actions = workPlanPointActions({
      status: point.status,
      startedById: point.startedById,
      actorId: actor.userId,
      canWork: flags.canWork,
      canTest: flags.canTest,
      canLead: flags.canLead,
      assignedToId,
      isError: point.isError,
      hasOpenErrorChild: Boolean(openErrorChild),
      timerPaused: isWorkPlanTimerFrozen(
        point.status,
        point.pausedRemainingSeconds,
        point.completedAt,
      ),
    });
    if (!actions.canStart) {
      if (openErrorChild) {
        throw new ConflictException('Start the error step to continue this timer');
      }
      if (flags.canTest && !flags.canLead) {
        throw new ForbiddenException('Testers start testing after the developer sends the point');
      }
      if (!flags.canLead && assignedToId !== actor.userId) {
        throw new ForbiddenException('This point is not assigned to you');
      }
      throw new ConflictException('This point cannot be started');
    }
    const now = new Date();
    if (point.isError && point.parentPointId) {
      return this.resumeParentFromError(actor, projectId, point, now);
    }
    const wasPaused = point.pausedRemainingSeconds != null;
    const startedAt = point.startedAt ?? now;
    // Resume from leftover seconds after Send to tester / logout; first Start still uses the estimate.
    const dueAt =
      point.pausedRemainingSeconds != null
        ? dueAtFromRemaining(now, point.pausedRemainingSeconds)
        : (point.dueAt ?? dueAtFromStart(startedAt, point.estimateMinutes));
    const remaining = remainingSeconds(
      point.dueAt,
      now,
      point.completedAt,
      point.pausedRemainingSeconds,
    );
    const overrunAtStart =
      point.overrunSeconds +
      extraThisRunSeconds(point.dueAt, now, remaining, point.pausedRemainingSeconds);
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
        startedAt,
        dueAt,
        pausedRemainingSeconds: null,
        startedById: point.startedById ?? actor.userId,
      },
    });
    await this.prisma.projectWorkPlanEvent.create({
      data: {
        organizationId: actor.organizationId,
        pointId: point.id,
        actorId: actor.userId,
        kind: wasPaused ? WORK_PLAN_EVENT_KIND.RESUMED : WORK_PLAN_EVENT_KIND.STARTED,
        elapsedSeconds: elapsedSeconds(point.startedAt ?? now, now),
        extraSeconds: overrunAtStart,
      },
    });
    await this.ensureScore(point.title.phase.planId, actor.userId);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_STARTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id, resumed: wasPaused },
    });
    return this.get(actor, projectId);
  }

  async submit(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (!actions.canSubmitTest) {
      throw new ForbiddenException('Send this point to the tester after you have started it');
    }
    await this.applyOverduePenalties(point.title.phase.planId);
    const now = new Date();
    const remaining = remainingSeconds(
      point.dueAt,
      now,
      point.completedAt,
      point.pausedRemainingSeconds,
    );
    const overrunSeconds =
      point.overrunSeconds + extraThisRunSeconds(point.dueAt, now, remaining, null);
    await this.prisma.$transaction(async (tx) => {
      await tx.projectWorkPlanPoint.update({
        where: { id: point.id },
        data: {
          status: WORK_PLAN_POINT_STATUS.AWAITING_TEST,
          submittedAt: now,
          pausedRemainingSeconds: remaining,
          overrunSeconds,
        },
      });
      await tx.projectWorkPlanEvent.create({
        data: {
          organizationId: actor.organizationId,
          pointId: point.id,
          actorId: actor.userId,
          kind: WORK_PLAN_EVENT_KIND.SENT_TO_TESTER,
          elapsedSeconds: elapsedSeconds(point.startedAt, now),
          extraSeconds: overrunSeconds,
        },
      });
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_SUBMITTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id },
    });
    await this.events.submittedForTest(actor, project, point.body);
    return this.get(actor, projectId);
  }

  async startTesting(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
  ): Promise<ProjectWorkPlan> {
    const { flags } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (!actions.canStartTest) {
      throw new ForbiddenException('Start testing after the developer sends this point');
    }
    const now = new Date();
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        status: WORK_PLAN_POINT_STATUS.TESTING,
        pausedRemainingSeconds:
          point.pausedRemainingSeconds ??
          remainingSeconds(point.dueAt, now, point.completedAt, point.pausedRemainingSeconds),
      },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_SUBMITTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id, status: WORK_PLAN_POINT_STATUS.TESTING },
    });
    return this.get(actor, projectId);
  }

  async complete(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
  ): Promise<ProjectWorkPlan> {
    const { flags } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (actions.canSubmitTest) {
      return this.submit(actor, projectId, pointId);
    }
    if (!actions.canPass) {
      throw new ForbiddenException('Only a tester or team lead can mark this done');
    }
    await this.applyOverduePenalties(point.title.phase.planId);
    const now = new Date();
    const remaining = remainingSeconds(
      point.dueAt,
      now,
      point.completedAt,
      point.pausedRemainingSeconds,
    );
    const extraSeconds =
      point.overrunSeconds +
      extraThisRunSeconds(point.dueAt, now, remaining, point.pausedRemainingSeconds);
    const testerSeconds = elapsedSeconds(point.submittedAt, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.projectWorkPlanPoint.update({
        where: { id: point.id },
        data: {
          status: WORK_PLAN_POINT_STATUS.COMPLETED,
          completedAt: now,
          completedById: actor.userId,
          overrunSeconds: extraSeconds,
        },
      });
      await tx.projectWorkPlanPoint.updateMany({
        where: {
          parentPointId: point.id,
          isError: true,
          completedAt: null,
        },
        data: {
          status: WORK_PLAN_POINT_STATUS.COMPLETED,
          completedAt: now,
          completedById: actor.userId,
        },
      });
      await tx.projectWorkPlanEvent.create({
        data: {
          organizationId: actor.organizationId,
          pointId: point.id,
          actorId: actor.userId,
          kind: WORK_PLAN_EVENT_KIND.PASSED,
          elapsedSeconds: elapsedSeconds(point.startedAt, now),
          sinceSubmitSeconds: testerSeconds,
          extraSeconds,
        },
      });
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

  async fail(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
    dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (!actions.canFail) {
      throw new ForbiddenException('Only a tester or team lead can send this back');
    }
    const body = dto.body.trim();
    const now = new Date();
    const pausedRemainingSeconds =
      point.pausedRemainingSeconds ??
      remainingSeconds(point.dueAt, now, point.completedAt, point.pausedRemainingSeconds);
    const file = dto.fileId ? await this.requireErrorFile(actor, projectId, dto.fileId) : null;
    const extraSeconds =
      point.overrunSeconds +
      extraThisRunSeconds(point.dueAt, now, pausedRemainingSeconds, pausedRemainingSeconds);
    await this.prisma.$transaction(async (tx) => {
      await tx.projectWorkPlanPoint.update({
        where: { id: point.id },
        data: { status: WORK_PLAN_POINT_STATUS.RETURNED, pausedRemainingSeconds },
      });
      const last = await tx.projectWorkPlanPoint.aggregate({
        where: { titleId: point.titleId },
        _max: { sortOrder: true },
      });
      await tx.projectWorkPlanPoint.create({
        data: {
          titleId: point.titleId,
          body,
          estimateMinutes: 1,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          isError: true,
          parentPointId: point.id,
          status: WORK_PLAN_POINT_STATUS.PENDING,
        },
      });
      await tx.projectWorkPlanEvent.create({
        data: {
          organizationId: actor.organizationId,
          pointId: point.id,
          actorId: actor.userId,
          kind: WORK_PLAN_EVENT_KIND.ERROR,
          body,
          elapsedSeconds: elapsedSeconds(point.startedAt, now),
          sinceSubmitSeconds: elapsedSeconds(point.submittedAt, now),
          extraSeconds,
        },
      });
      await this.postTaskErrorComment(tx, actor, point, body, file?.id ?? null);
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_RETURNED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id },
    });
    await this.events.returned(actor, project, point.startedById, body);
    await this.syncTasks(actor, project, projectId);
    return this.get(actor, projectId);
  }

  async note(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
    dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (!actions.canDoubt) {
      throw new ForbiddenException('You cannot add a note on this point');
    }
    const body = dto.body.trim();
    const kind = flags.canTest ? WORK_PLAN_NOTE_KIND.ISSUE : WORK_PLAN_NOTE_KIND.DOUBT;
    await this.prisma.projectWorkPlanNote.create({
      data: {
        organizationId: actor.organizationId,
        pointId: point.id,
        authorId: actor.userId,
        kind,
        body,
      },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_DOUBT,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id, kind },
    });
    if (kind === WORK_PLAN_NOTE_KIND.DOUBT) {
      await this.events.doubt(actor, project, body);
    } else {
      await this.events.returned(actor, project, point.startedById, body);
    }
    return this.get(actor, projectId);
  }

  async reply(
    actor: AuthenticatedUser,
    projectId: string,
    pointId: string,
    noteId: string,
    dto: WorkPlanNoteDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
    const point = await this.requirePoint(actor, projectId, pointId);
    const actions = this.actionsFor(actor, flags, point);
    if (!actions.canReply) {
      throw new ForbiddenException('You cannot reply on this point');
    }
    const parent = point.notes.find((note) => note.id === noteId);
    if (!parent) {
      throw new NotFoundException('Note not found');
    }
    const rootId = parent.parentId ?? parent.id;
    const body = dto.body.trim();
    await this.prisma.projectWorkPlanNote.create({
      data: {
        organizationId: actor.organizationId,
        pointId: point.id,
        parentId: rootId,
        authorId: actor.userId,
        kind: WORK_PLAN_NOTE_KIND.REPLY,
        body,
      },
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_DOUBT,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: point.id, parentId: rootId, kind: WORK_PLAN_NOTE_KIND.REPLY },
    });
    const threadAuthors = point.notes
      .filter((note) => note.id === rootId || note.parentId === rootId)
      .map((note) => note.authorId);
    const testers = project.members
      .filter((member) => member.role === 'TESTER')
      .map((member) => member.userId);
    await this.events.reply(actor, project, body, [
      ...threadAuthors,
      point.startedById,
      ...testers,
      project.managerUserId,
      project.leadUserId,
    ]);
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

  private existingToDto(row: WorkPlanRow): WorkPlanPhaseDto[] {
    return row.phases.map((phase) => ({
      id: phase.id,
      heading: phase.heading,
      titles: phase.titles.map((title) => ({
        id: title.id,
        title: title.title,
        points: title.points.map((point) => ({
          id: point.id,
          body: point.body,
          estimateMinutes: point.estimateMinutes,
        })),
      })),
    }));
  }

  private async draftForAdd(
    dto: AddWorkPlanWorkDto,
    existing: WorkPlanRow | null,
  ): Promise<WorkPlanDraftAddition[]> {
    if (this.gemini.isEnabled()) {
      try {
        const analysed = await this.gemini.expandWork({
          prompt: dto.prompt.trim(),
          outline: this.outline(existing),
        });
        if (analysed.length > 0) {
          return analysed;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`AI expand failed, using the typed request: ${reason}`);
      }
    }
    const fallback = workPlanFromFreeText(dto.prompt).map((phase) => ({
      phaseId: null,
      heading: phase.heading,
      titles: phase.titles,
    }));
    if (fallback.length === 0) {
      throw new BadRequestException('Describe the work in a bit more detail');
    }
    return fallback;
  }

  private mergeAddedWork(
    existing: WorkPlanRow | null,
    added: WorkPlanDraftAddition[],
  ): WorkPlanPhaseDto[] {
    const phases = existing ? this.existingToDto(existing) : [];
    for (const addition of added) {
      const titles =
        this.draftToDto([{ heading: addition.heading, titles: addition.titles }])[0]?.titles ?? [];
      if (titles.length === 0) {
        continue;
      }
      const target = matchWorkPlanAdditionPhase(addition, phases);
      if (target) {
        target.titles = [...target.titles, ...titles];
      } else {
        phases.push({ heading: addition.heading, titles });
      }
    }
    return phases;
  }

  private outline(row: WorkPlanRow | null): string {
    if (!row || row.phases.length === 0) {
      return '(empty plan)';
    }
    return row.phases
      .map((phase) => {
        const titles = phase.titles
          .map((title) => `  ${title.title}: ${title.points.map((point) => point.body).join('; ')}`)
          .join('\n');
        return `[${phase.id}] ${phase.heading}\n${titles}`;
      })
      .join('\n')
      .slice(0, 8_000);
  }

  private async applyNewWorkAssignment(
    row: WorkPlanRow,
    previous: { phases: Set<string>; titles: Set<string> },
    assignedToId: string | null,
    priority: (typeof PRIORITY)[keyof typeof PRIORITY] | null,
  ): Promise<void> {
    if (!assignedToId && !priority) {
      return;
    }
    const data = {
      ...(assignedToId ? { assignedToId, assignedAt: new Date() } : {}),
      ...(priority ? { priority } : {}),
    };
    for (const phase of row.phases) {
      if (!previous.phases.has(phase.id)) {
        await this.prisma.projectWorkPlanPhase.update({ where: { id: phase.id }, data });
        continue;
      }
      for (const title of phase.titles) {
        if (!previous.titles.has(title.id)) {
          await this.prisma.projectWorkPlanTitle.update({ where: { id: title.id }, data });
        }
      }
    }
  }

  private async syncTasks(
    actor: AuthenticatedUser,
    project: ProjectRow,
    projectId: string,
  ): Promise<void> {
    const row = await this.plans.findByProject(actor.organizationId, projectId);
    if (row) {
      await this.planTasks.sync(actor, project, row);
    }
  }

  private assertPhases(phases: WorkPlanPhaseDto[]): void {
    if (phases.length === 0) {
      throw new BadRequestException('Add at least one phase');
    }
  }

  private hasStartedWork(row: {
    phases: Array<{ titles: Array<{ points: Array<{ startedAt: Date | null }> }> }>;
  }): boolean {
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
        isError: false,
        pausedRemainingSeconds: null,
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

  private async flags(actor: AuthenticatedUser, projectId: string): Promise<WorkPlanActorFlags> {
    return (await this.access(actor, projectId)).flags;
  }

  private async access(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<{ flags: WorkPlanActorFlags; project: ProjectRow }> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients use the portal to see their projects');
    }
    const project = await this.projects.findById(actor.organizationId, projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const isAdmin = seesAllOrganizationProjects(actor.roleKey);
    const onProject =
      isAdmin ||
      project.createdById === actor.userId ||
      project.managerUserId === actor.userId ||
      project.leadUserId === actor.userId ||
      project.members.some((member) => member.userId === actor.userId) ||
      project.team?.leadUserId === actor.userId ||
      (project.team?.members.some((member) => member.userId === actor.userId) ?? false);
    if (!onProject) {
      throw new NotFoundException('Project not found');
    }
    const memberRole = project.members.find((member) => member.userId === actor.userId)?.role;
    const canManage =
      isAdmin || (onProject && actor.permissions.includes(PERMISSIONS.PROJECT_MANAGE));
    const canWork = isAdmin || (onProject && actor.permissions.includes(PERMISSIONS.TASK_WORK));
    const canTest =
      isAdmin ||
      actor.roleKey === ROLE_KEYS.TESTER ||
      memberRole === PROJECT_MEMBER_ROLE.TESTER ||
      actor.permissions.includes(PERMISSIONS.QA_RECORD_RESULT);
    const canLead =
      isAdmin ||
      project.leadUserId === actor.userId ||
      (onProject && actor.roleKey === ROLE_KEYS.TEAM_LEAD);
    const canAssign = canManage || canLead;
    return {
      flags: { canManage, canWork, canTest: canTest && onProject, canLead, canAssign },
      project,
    };
  }

  private detail(
    actor: AuthenticatedUser,
    flags: WorkPlanActorFlags,
    project: ProjectRow,
    row: Awaited<ReturnType<WorkPlanRepository['findByProject']>>,
  ): ProjectWorkPlan {
    return this.mapper.toDetail(
      row,
      actor,
      flags,
      project.id,
      new Date(),
      this.developersOn(project),
    );
  }

  private developersOn(project: ProjectRow): UserRef[] {
    const byId = new Map<string, UserRef>();
    for (const member of project.members) {
      if (member.role === PROJECT_MEMBER_ROLE.DEVELOPER) {
        byId.set(member.user.id, member.user);
      }
    }
    const blocked = new Set(
      project.members
        .filter((member) => member.role !== PROJECT_MEMBER_ROLE.DEVELOPER)
        .map((member) => member.userId),
    );
    for (const member of project.team?.members ?? []) {
      if (!blocked.has(member.userId)) {
        byId.set(member.user.id, member.user);
      }
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  private assertOptionalDeveloper(project: ProjectRow, userId: string | null) {
    if (userId) {
      this.assertDeveloper(project, userId);
    }
  }

  private assertDeveloper(project: ProjectRow, userId: string) {
    if (!this.developersOn(project).some((user) => user.id === userId)) {
      throw new BadRequestException('Assign work to a developer on this project');
    }
  }

  private async assignProject(planId: string, assignedToId: string | null) {
    const now = new Date();
    const current = await this.prisma.projectWorkPlan.findUnique({
      where: { id: planId },
      select: { assignedToId: true, assignedAt: true },
    });
    const stamp = this.assigneeStamp(
      current?.assignedToId ?? null,
      assignedToId,
      current?.assignedAt ?? null,
      now,
    );
    if (!assignedToId) {
      await this.prisma.$transaction([
        this.prisma.projectWorkPlan.update({
          where: { id: planId },
          data: stamp,
        }),
        this.prisma.projectWorkPlanPhase.updateMany({
          where: { planId },
          data: { assignedToId: null, assignedAt: null },
        }),
        this.prisma.projectWorkPlanTitle.updateMany({
          where: { phase: { planId } },
          data: { assignedToId: null, assignedAt: null },
        }),
      ]);
      return;
    }
    await this.prisma.$transaction([
      this.prisma.projectWorkPlan.update({ where: { id: planId }, data: stamp }),
      this.prisma.projectWorkPlanPhase.updateMany({
        where: { planId },
        data: { assignedToId: null, assignedAt: null },
      }),
      this.prisma.projectWorkPlanTitle.updateMany({
        where: { phase: { planId } },
        data: { assignedToId: null, assignedAt: null },
      }),
    ]);
  }

  private async assignPhase(phaseId: string, assignedToId: string | null) {
    const now = new Date();
    const current = await this.prisma.projectWorkPlanPhase.findUnique({
      where: { id: phaseId },
      select: { assignedToId: true, assignedAt: true },
    });
    const stamp = this.assigneeStamp(
      current?.assignedToId ?? null,
      assignedToId,
      current?.assignedAt ?? null,
      now,
    );
    if (!assignedToId) {
      await this.prisma.projectWorkPlanPhase.update({
        where: { id: phaseId },
        data: stamp,
      });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.projectWorkPlanPhase.update({ where: { id: phaseId }, data: stamp }),
      this.prisma.projectWorkPlanTitle.updateMany({
        where: { phaseId },
        data: { assignedToId: null, assignedAt: null },
      }),
    ]);
  }

  private async requireErrorFile(
    actor: AuthenticatedUser,
    projectId: string,
    fileId: string,
  ): Promise<{ id: string }> {
    const file = await this.files.findById(actor.organizationId, fileId);
    if (!file || file.uploadedById !== actor.userId) {
      throw new NotFoundException('File not found');
    }
    if (file.projectId && file.projectId !== projectId) {
      throw new ForbiddenException('This file is not on this project');
    }
    if (file.commentId) {
      throw new BadRequestException('This file is already attached');
    }
    return { id: file.id };
  }

  /** Tester error text (and screenshot) land on the topic's task so the developer sees them in comments. */
  private async postTaskErrorComment(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    point: { titleId: string; body: string },
    body: string,
    fileId: string | null,
  ): Promise<void> {
    const task = await tx.task.findFirst({
      where: {
        organizationId: actor.organizationId,
        workPlanTitleId: point.titleId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!task) {
      return;
    }
    const comment = await tx.comment.create({
      data: {
        organizationId: actor.organizationId,
        authorId: actor.userId,
        visibility: VISIBILITY.INTERNAL,
        taskId: task.id,
        body: `Error on "${point.body}"\n${body}`,
      },
    });
    if (!fileId) {
      return;
    }
    // A file may only hang off one parent column. The screenshot was uploaded on the project;
    // move it onto the task and the comment so it shows under Comments.
    await tx.file.update({
      where: { id: fileId },
      data: { commentId: comment.id, taskId: task.id, projectId: null },
    });
  }

  private async requirePoint(actor: AuthenticatedUser, projectId: string, pointId: string) {
    const point = await this.plans.findPoint(actor.organizationId, projectId, pointId);
    if (!point) {
      throw new NotFoundException('Point not found');
    }
    return point;
  }

  private actionsFor(
    actor: AuthenticatedUser,
    flags: WorkPlanActorFlags,
    point: {
      status: string;
      startedById: string | null;
      isError?: boolean;
      pausedRemainingSeconds?: number | null;
      completedAt?: Date | null;
      title: {
        assignedToId: string | null;
        phase: { assignedToId: string | null; plan: { assignedToId: string | null } };
      };
    },
  ) {
    const status = point.status as (typeof WORK_PLAN_POINT_STATUS)[keyof typeof WORK_PLAN_POINT_STATUS];
    return workPlanPointActions({
      status,
      startedById: point.startedById,
      actorId: actor.userId,
      canWork: flags.canWork,
      canTest: flags.canTest,
      canLead: flags.canLead,
      assignedToId: effectiveWorkPlanAssigneeId(
        point.title.assignedToId,
        point.title.phase.assignedToId,
        point.title.phase.plan.assignedToId,
      ),
      isError: Boolean(point.isError),
      timerPaused: isWorkPlanTimerFrozen(
        status,
        point.pausedRemainingSeconds,
        point.completedAt ?? null,
      ),
    });
  }

  private assigneeStamp(
    previousId: string | null,
    nextId: string | null,
    previousAt: Date | null,
    now: Date,
  ): { assignedToId: string | null; assignedAt: Date | null } {
    if (!nextId) {
      return { assignedToId: null, assignedAt: null };
    }
    if (nextId === previousId) {
      return { assignedToId: nextId, assignedAt: previousAt };
    }
    return { assignedToId: nextId, assignedAt: now };
  }

  private async resumeParentFromError(
    actor: AuthenticatedUser,
    projectId: string,
    errorPoint: { id: string; parentPointId: string | null; startedById: string | null },
    now: Date,
  ): Promise<ProjectWorkPlan> {
    if (!errorPoint.parentPointId) {
      throw new ConflictException('This error is not linked to a step');
    }
    const parent = await this.requirePoint(actor, projectId, errorPoint.parentPointId);
    const resumeParent =
      parent.status === WORK_PLAN_POINT_STATUS.RETURNED || parent.pausedRemainingSeconds != null;
    const dueAt = resumeParent
      ? dueAtFromRemaining(
          now,
          remainingSeconds(parent.dueAt, now, parent.completedAt, parent.pausedRemainingSeconds),
        )
      : parent.dueAt;
    await this.prisma.$transaction(async (tx) => {
      if (resumeParent) {
        await tx.projectWorkPlanPoint.update({
          where: { id: parent.id },
          data: {
            status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
            dueAt,
            pausedRemainingSeconds: null,
          },
        });
        await tx.projectWorkPlanEvent.create({
          data: {
            organizationId: actor.organizationId,
            pointId: parent.id,
            actorId: actor.userId,
            kind: WORK_PLAN_EVENT_KIND.RESUMED,
            body: 'Resumed via error step',
            elapsedSeconds: elapsedSeconds(parent.startedAt, now),
            extraSeconds: parent.overrunSeconds,
          },
        });
      }
      await tx.projectWorkPlanPoint.update({
        where: { id: errorPoint.id },
        data: {
          status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
          startedAt: now,
          startedById: errorPoint.startedById ?? actor.userId,
        },
      });
      await tx.projectWorkPlanEvent.create({
        data: {
          organizationId: actor.organizationId,
          pointId: errorPoint.id,
          actorId: actor.userId,
          kind: WORK_PLAN_EVENT_KIND.STARTED,
          elapsedSeconds: 0,
          extraSeconds: 0,
        },
      });
    });
    await this.ensureScore(parent.title.phase.planId, actor.userId);
    await this.auditLog.record({
      action: AUDIT_ACTION.WORK_PLAN_POINT_STARTED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { pointId: errorPoint.id, parentPointId: parent.id },
    });
    return this.get(actor, projectId);
  }
}
