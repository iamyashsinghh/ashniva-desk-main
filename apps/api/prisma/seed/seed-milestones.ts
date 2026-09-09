import { MILESTONE_STATUS } from '@ashniva/types';

import type { Milestone, PrismaClient } from '../../src/generated/prisma/client';
import type { SeededContracts } from './seed-contracts';
import { dayOffset } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import type { SeededUsers } from './seed-users';

export interface SeededMilestones {
  discovery: Milestone;
  pilot: Milestone;
  rollout: Milestone;
  /** Internal-only milestone, used to show what a client must never see. */
  hardening: Milestone;
}

interface MilestoneSeed {
  key: keyof SeededMilestones;
  name: string;
  description: string;
  project: keyof SeededProjects;
  contract: keyof SeededContracts | null;
  status: (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];
  startDaysAgo: number;
  dueDaysAhead: number;
  clientVisible: boolean;
  requiresApproval: boolean;
  progressPercent: number;
  deliverables: ReadonlyArray<{ title: string; isDone: boolean }>;
}

const MILESTONES: readonly MilestoneSeed[] = [
  {
    key: 'discovery',
    name: 'Discovery and design sign-off',
    description: 'Store visits, current-state notes and the approved design pack.',
    project: 'acmeStore',
    contract: 'acmeProject',
    status: MILESTONE_STATUS.COMPLETED,
    startDaysAgo: 60,
    dueDaysAhead: -30,
    clientVisible: true,
    requiresApproval: true,
    progressPercent: 100,
    deliverables: [
      { title: 'Current-state assessment', isDone: true },
      { title: 'Design pack', isDone: true },
      { title: 'Roll-out plan', isDone: true },
    ],
  },
  {
    key: 'pilot',
    name: 'Pilot store live',
    description: 'One store running the new checkout flow end to end.',
    project: 'acmeStore',
    contract: 'acmeProject',
    status: MILESTONE_STATUS.IN_PROGRESS,
    startDaysAgo: 25,
    dueDaysAhead: 12,
    clientVisible: true,
    requiresApproval: true,
    progressPercent: 45,
    deliverables: [
      { title: 'Checkout flow deployed to the pilot store', isDone: true },
      { title: 'Staff training session', isDone: false },
      { title: 'Two weeks of pilot feedback', isDone: false },
    ],
  },
  {
    key: 'rollout',
    name: 'Roll-out to all stores',
    description: 'Remaining stores migrated after a successful pilot.',
    project: 'acmeStore',
    contract: 'acmeProject',
    status: MILESTONE_STATUS.PLANNED,
    startDaysAgo: -10,
    dueDaysAhead: 55,
    clientVisible: true,
    requiresApproval: false,
    progressPercent: 0,
    deliverables: [
      { title: 'Store migration runbook', isDone: false },
      { title: 'All stores migrated', isDone: false },
    ],
  },
  {
    key: 'hardening',
    name: 'Internal hardening sprint',
    description: 'Performance and security work we do not bill separately.',
    project: 'acmePos',
    contract: 'acmeSupport',
    status: MILESTONE_STATUS.IN_PROGRESS,
    startDaysAgo: 14,
    dueDaysAhead: 20,
    clientVisible: false,
    requiresApproval: false,
    progressPercent: 30,
    deliverables: [
      { title: 'Query plan review', isDone: true },
      { title: 'Dependency upgrades', isDone: false },
    ],
  },
];

/** Delivery milestones with deliverables and one dependency chain. */
export async function seedMilestones(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
  contracts: SeededContracts,
): Promise<SeededMilestones> {
  const organizationId = organizations.serviceProvider.id;
  const seeded: Partial<SeededMilestones> = {};

  for (const [index, seed] of MILESTONES.entries()) {
    const projectId = projects[seed.project].id;
    const data = {
      organizationId,
      projectId,
      contractId: seed.contract ? contracts[seed.contract].id : null,
      name: seed.name,
      description: seed.description,
      ownerUserId: users.lead.id,
      startDate: dayOffset(-seed.startDaysAgo),
      dueDate: dayOffset(seed.dueDaysAhead),
      status: seed.status,
      progressPercent: seed.progressPercent,
      clientVisible: seed.clientVisible,
      requiresApproval: seed.requiresApproval,
      sortOrder: index,
      completedAt: seed.status === MILESTONE_STATUS.COMPLETED ? dayOffset(-30) : null,
      createdById: users.pm.id,
    };
    const existing = await prisma.milestone.findFirst({
      where: { organizationId, projectId, name: seed.name },
    });
    const milestone = existing
      ? await prisma.milestone.update({ where: { id: existing.id }, data })
      : await prisma.milestone.create({ data });
    seeded[seed.key] = milestone;

    for (const [order, deliverable] of seed.deliverables.entries()) {
      const row = await prisma.milestoneDeliverable.findFirst({
        where: { milestoneId: milestone.id, title: deliverable.title },
      });
      const payload = {
        milestoneId: milestone.id,
        title: deliverable.title,
        isDone: deliverable.isDone,
        doneAt: deliverable.isDone ? dayOffset(-5) : null,
        sortOrder: order,
      };
      if (row) {
        await prisma.milestoneDeliverable.update({ where: { id: row.id }, data: payload });
      } else {
        await prisma.milestoneDeliverable.create({ data: payload });
      }
    }

    const historyExists = await prisma.milestoneHistory.findFirst({
      where: { milestoneId: milestone.id, kind: 'CREATED' },
    });
    if (!historyExists) {
      await prisma.milestoneHistory.create({
        data: {
          milestoneId: milestone.id,
          kind: 'CREATED',
          toValue: seed.status,
          changedById: users.pm.id,
        },
      });
    }
  }

  const milestones = seeded as SeededMilestones;
  // The roll-out can only start once the pilot is signed off.
  await prisma.milestoneDependency.upsert({
    where: {
      milestoneId_dependsOnId: {
        milestoneId: milestones.rollout.id,
        dependsOnId: milestones.pilot.id,
      },
    },
    update: {},
    create: { milestoneId: milestones.rollout.id, dependsOnId: milestones.pilot.id },
  });
  console.warn(`Milestones: ${MILESTONES.length}`);
  return milestones;
}
