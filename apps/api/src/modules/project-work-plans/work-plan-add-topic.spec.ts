import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ROLE_KEYS, type AuthenticatedUser } from '@ashniva/types';

import type { WorkPlanPhaseDto } from './dto/work-plan.dto';
import { WorkPlanService } from './work-plan.service';

const ORG = 'org-1';
const PROJECT = 'project-1';
const DEV = 'dev-1';
const LEAD = 'lead-1';

const admin: AuthenticatedUser = {
  userId: 'admin-1',
  organizationId: ORG,
  roleKey: ROLE_KEYS.SUPER_ADMIN,
  permissions: [],
  isServiceProvider: true,
};

const project = {
  id: PROJECT,
  code: 'ACM',
  createdById: 'someone',
  managerUserId: 'pm-1',
  leadUserId: LEAD,
  team: null,
  members: [
    { userId: DEV, role: 'DEVELOPER', user: { id: DEV, name: 'Dev One' } },
    { userId: LEAD, role: 'LEAD', user: { id: LEAD, name: 'Lead One' } },
  ],
};

interface Row {
  id: string;
  source: string;
  sourceFileId: string | null;
  phases: Array<{
    id: string;
    heading: string;
    titles: Array<{
      id: string;
      title: string;
      points: Array<{ id: string; body: string; estimateMinutes: number }>;
    }>;
  }>;
}

const existingPlan: Row = {
  id: 'plan-1',
  source: 'MANUAL',
  sourceFileId: null,
  phases: [
    {
      id: 'phase-1',
      heading: 'Phase 1 — Setup',
      titles: [
        {
          id: 'title-1',
          title: 'Login',
          points: [{ id: 'point-1', body: 'Login form', estimateMinutes: 30 }],
        },
      ],
    },
  ],
};

/** Saves the phases it receives the way the repository does: existing ids kept, new ones minted. */
function toRow(phases: WorkPlanPhaseDto[]): Row {
  let next = 0;
  const id = (prefix: string, given?: string) => given ?? `${prefix}-new-${++next}`;
  return {
    id: 'plan-1',
    source: 'MANUAL',
    sourceFileId: null,
    phases: phases.map((phase) => ({
      id: id('phase', phase.id),
      heading: phase.heading,
      titles: phase.titles.map((title) => ({
        id: id('title', title.id),
        title: title.title,
        points: title.points.map((point) => ({
          id: id('point', point.id),
          body: point.body,
          estimateMinutes: point.estimateMinutes,
        })),
      })),
    })),
  };
}

function setup(existing: Row | null = existingPlan) {
  let saved: Row | null = null;
  const plans = {
    findByProject: jest.fn(async () => saved ?? existing),
    savePhases: jest.fn(async (...args: unknown[]) => {
      saved = toRow(args[5] as WorkPlanPhaseDto[]);
      return saved;
    }),
  };
  const prisma = {
    projectWorkPlanPhase: { update: jest.fn(async () => ({})) },
    projectWorkPlanTitle: { update: jest.fn(async () => ({})) },
  };
  const planTasks = {
    sync: jest.fn(async () => undefined),
    scheduleTitleTask: jest.fn(async () => ({ id: 'task-1', number: 42 })),
  };
  const auditLog = { record: jest.fn(async () => undefined) };
  const service = new WorkPlanService(
    plans as never,
    { toDetail: jest.fn(() => ({ projectId: PROJECT })) } as never,
    { findById: jest.fn(async () => project) } as never,
    {} as never,
    {} as never,
    prisma as never,
    auditLog as never,
    { isEnabled: () => false } as never,
    {} as never,
    planTasks as never,
  );
  return { service, plans, prisma, planTasks, auditLog };
}

describe('WorkPlanService.addTopic', () => {
  it('adds the topic to the chosen phase, keeps the plan, assigns it and returns its task', async () => {
    const { service, plans, prisma, planTasks } = setup();

    const result = await service.addTopic(admin, PROJECT, {
      phaseId: 'phase-1',
      title: 'Forgot password',
      points: [{ body: 'Reset email', estimateMinutes: 45 }],
      assignedToId: DEV,
      priority: 'HIGH',
      dueDate: '2026-10-15',
      reviewerId: LEAD,
    });

    const phases = plans.savePhases.mock.calls[0]?.[5] as WorkPlanPhaseDto[];
    expect(phases).toHaveLength(1);
    expect(phases[0]?.titles.map((title) => title.title)).toEqual(['Login', 'Forgot password']);
    expect(phases[0]?.titles[0]?.points[0]?.id).toBe('point-1');
    expect(prisma.projectWorkPlanTitle.update).toHaveBeenCalledWith({
      where: { id: result.titleId },
      data: expect.objectContaining({ assignedToId: DEV, priority: 'HIGH' }),
    });
    expect(planTasks.sync).toHaveBeenCalled();
    expect(planTasks.scheduleTitleTask).toHaveBeenCalledWith(ORG, result.titleId, {
      dueDate: '2026-10-15',
      reviewerId: LEAD,
    });
    expect(result.phaseId).toBe('phase-1');
    expect(result.task).toEqual({ id: 'task-1', number: 42, key: 'ACM-42' });
  });

  it('opens a new phase when no phase has that heading, and reuses one that does', async () => {
    const opened = setup();
    const created = await opened.service.addTopic(admin, PROJECT, {
      phaseHeading: 'Phase 2 — Payments',
      title: 'Razorpay',
      points: [{ body: 'Checkout', estimateMinutes: 60 }],
    });
    const openedPhases = opened.plans.savePhases.mock.calls[0]?.[5] as WorkPlanPhaseDto[];
    expect(openedPhases.map((phase) => phase.heading)).toEqual([
      'Phase 1 — Setup',
      'Phase 2 — Payments',
    ]);
    expect(created.phaseId).not.toBe('phase-1');

    const reused = setup();
    const matched = await reused.service.addTopic(admin, PROJECT, {
      phaseHeading: '  phase 1 — setup ',
      title: 'Logout',
      points: [{ body: 'Logout button', estimateMinutes: 15 }],
    });
    expect(matched.phaseId).toBe('phase-1');
  });

  it('adds the steps to an existing topic and gives an unassigned topic its developer', async () => {
    const { service, plans, prisma } = setup();

    const result = await service.addTopic(admin, PROJECT, {
      titleId: 'title-1',
      points: [{ body: 'Remember me', estimateMinutes: 20 }],
      assignedToId: DEV,
    });

    const phases = plans.savePhases.mock.calls[0]?.[5] as WorkPlanPhaseDto[];
    expect(phases[0]?.titles).toHaveLength(1);
    expect(phases[0]?.titles[0]?.points.map((point) => point.body)).toEqual([
      'Login form',
      'Remember me',
    ]);
    expect(prisma.projectWorkPlanTitle.update).toHaveBeenCalledWith({
      where: { id: 'title-1' },
      data: expect.objectContaining({ assignedToId: DEV }),
    });
    expect(result).toMatchObject({ phaseId: 'phase-1', titleId: 'title-1' });

    await expect(
      service.addTopic(admin, PROJECT, {
        titleId: '00000000-0000-0000-0000-000000000000',
        points: [{ body: 'Step', estimateMinutes: 10 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('starts a plan for a project that has none', async () => {
    const { service, plans } = setup(null);
    await service.addTopic(admin, PROJECT, {
      phaseHeading: 'Phase 1',
      title: 'First work',
      points: [{ body: 'Kick-off', estimateMinutes: 30 }],
    });
    const phases = plans.savePhases.mock.calls[0]?.[5] as WorkPlanPhaseDto[];
    expect(phases).toEqual([
      {
        heading: 'Phase 1',
        titles: [{ title: 'First work', points: [{ body: 'Kick-off', estimateMinutes: 30 }] }],
      },
    ]);
  });

  it('refuses an unknown phase, a developer or reviewer off the project, and people who cannot assign', async () => {
    const { service } = setup();
    const topic = { title: 'X work', points: [{ body: 'Step', estimateMinutes: 10 }] };

    await expect(service.addTopic(admin, PROJECT, { ...topic, phaseId: 'nope' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.addTopic(admin, PROJECT, { ...topic, phaseId: 'phase-1', assignedToId: 'stranger' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addTopic(admin, PROJECT, { ...topic, phaseId: 'phase-1', reviewerId: 'stranger' }),
    ).rejects.toThrow(BadRequestException);

    const developer: AuthenticatedUser = {
      ...admin,
      userId: DEV,
      roleKey: ROLE_KEYS.DEVELOPER,
      permissions: [],
    };
    await expect(
      service.addTopic(developer, PROJECT, { ...topic, phaseId: 'phase-1' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
