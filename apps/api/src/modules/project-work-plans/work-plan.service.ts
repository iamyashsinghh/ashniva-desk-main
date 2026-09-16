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
  dueAtFromStart,
  effectiveWorkPlanAssigneeId,
  parseWorkPlanFromText,
  scoreAfterPenalty,
  seesAllOrganizationProjects,
  workPlanPointActions,
  type AuthenticatedUser,
  type ProjectWorkPlan,
  type UserRef,
  type WorkPlanDraftPhase,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { FilesRepository } from '../files/files.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import type {
  AssignWorkPlanDto,
  ParseWorkPlanDto,
  SaveWorkPlanAssignmentsDto,
  SaveWorkPlanDto,
  WorkPlanNoteDto,
  WorkPlanPhaseDto,
} from './dto/work-plan.dto';
import { bufferFromStream, extractPdfText, looksLikePdf } from './work-plan-pdf';
import { WorkPlanEventsService } from './work-plan-events.service';
import { WorkPlanGeminiService } from './work-plan-gemini';
import { WorkPlanMapper, type WorkPlanActorFlags } from './work-plan.mapper';
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
    return this.detail(actor, flags, project, row);
  }

  async parse(
    actor: AuthenticatedUser,
    projectId: string,
    dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    const { flags, project } = await this.access(actor, projectId);
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
    return this.detail(actor, flags, project, row);
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
        data: { assignedToId },
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
    await this.prisma.$transaction([
      this.prisma.projectWorkPlan.update({
        where: { id: row.id },
        data: { assignedToId, priority },
      }),
      ...dto.phases.map((phase) =>
        this.prisma.projectWorkPlanPhase.update({
          where: { id: phase.id },
          data: {
            assignedToId: phase.assignedToId ?? null,
            priority: phase.priority ?? null,
          },
        }),
      ),
      ...dto.titles.map((title) =>
        this.prisma.projectWorkPlanTitle.update({
          where: { id: title.id },
          data: {
            assignedToId: title.assignedToId ?? null,
            priority: title.priority ?? null,
          },
        }),
      ),
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
    const actions = workPlanPointActions({
      status: point.status,
      startedById: point.startedById,
      actorId: actor.userId,
      canWork: flags.canWork,
      canTest: flags.canTest,
      canLead: flags.canLead,
      assignedToId,
    });
    if (!actions.canStart) {
      if (flags.canTest && !flags.canLead) {
        throw new ForbiddenException('Testers start testing after the developer sends the point');
      }
      if (!flags.canLead && assignedToId !== actor.userId) {
        throw new ForbiddenException('This point is not assigned to you');
      }
      throw new ConflictException('This point cannot be started');
    }
    const startedAt = point.startedAt ?? new Date();
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
        startedAt,
        dueAt: point.dueAt ?? dueAtFromStart(startedAt, point.estimateMinutes),
        startedById: point.startedById ?? actor.userId,
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
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        status: WORK_PLAN_POINT_STATUS.AWAITING_TEST,
        submittedAt: new Date(),
      },
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
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: { status: WORK_PLAN_POINT_STATUS.TESTING },
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
      if (actions.canStartTest) {
        throw new ForbiddenException('Start testing first');
      }
      throw new ForbiddenException('Only a tester or team lead can mark this done');
    }
    await this.applyOverduePenalties(point.title.phase.planId);
    await this.prisma.projectWorkPlanPoint.update({
      where: { id: point.id },
      data: {
        status: WORK_PLAN_POINT_STATUS.COMPLETED,
        completedAt: new Date(),
        completedById: actor.userId,
      },
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
      if (actions.canStartTest) {
        throw new ForbiddenException('Start testing first');
      }
      throw new ForbiddenException('Only a tester or team lead can send this back');
    }
    const body = dto.body.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.projectWorkPlanPoint.update({
        where: { id: point.id },
        data: { status: WORK_PLAN_POINT_STATUS.RETURNED },
      });
      await tx.projectWorkPlanNote.create({
        data: {
          organizationId: actor.organizationId,
          pointId: point.id,
          authorId: actor.userId,
          kind: WORK_PLAN_NOTE_KIND.ISSUE,
          body,
        },
      });
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
    if (!assignedToId) {
      await this.prisma.projectWorkPlan.update({
        where: { id: planId },
        data: { assignedToId: null },
      });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.projectWorkPlan.update({ where: { id: planId }, data: { assignedToId } }),
      this.prisma.projectWorkPlanPhase.updateMany({
        where: { planId },
        data: { assignedToId: null },
      }),
      this.prisma.projectWorkPlanTitle.updateMany({
        where: { phase: { planId } },
        data: { assignedToId: null },
      }),
    ]);
  }

  private async assignPhase(phaseId: string, assignedToId: string | null) {
    if (!assignedToId) {
      await this.prisma.projectWorkPlanPhase.update({
        where: { id: phaseId },
        data: { assignedToId: null },
      });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.projectWorkPlanPhase.update({ where: { id: phaseId }, data: { assignedToId } }),
      this.prisma.projectWorkPlanTitle.updateMany({
        where: { phaseId },
        data: { assignedToId: null },
      }),
    ]);
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
      title: {
        assignedToId: string | null;
        phase: { assignedToId: string | null; plan: { assignedToId: string | null } };
      };
    },
  ) {
    return workPlanPointActions({
      status: point.status as (typeof WORK_PLAN_POINT_STATUS)[keyof typeof WORK_PLAN_POINT_STATUS],
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
    });
  }
}
