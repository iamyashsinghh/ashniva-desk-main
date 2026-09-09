import { APPROVAL_STATUS, APPROVAL_SUBJECT_TYPE, CHANGE_REQUEST_STATUS } from '@ashniva/types';

import type { ChangeRequest, PrismaClient } from '../../src/generated/prisma/client';
import type { SeededContracts } from './seed-contracts';
import { at, dayOffset, raiseCounter } from './seed-helpers';
import type { SeededMilestones } from './seed-milestones';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import type { SeedUserKey, SeededUsers } from './seed-users';

export interface SeededChangeRequests {
  /** Waiting for the client to decide: drives the portal "your decision is needed" state. */
  clientReview: ChangeRequest;
  /** Approved and already turned into work. */
  approved: ChangeRequest;
  /** The client is still writing it. */
  draft: ChangeRequest;
}

interface ChangeRequestSeed {
  key: keyof SeededChangeRequests;
  number: number;
  title: string;
  description: string;
  businessReason: string;
  scope: string;
  impact: string;
  status: (typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS];
  project: keyof SeededProjects;
  contract: keyof SeededContracts;
  requester: SeedUserKey;
  estimatedMinutes: number | null;
  costImpact: string | null;
  timelineImpactDays: number | null;
  internalNotes: string | null;
  submittedDaysAgo: number | null;
  path: ReadonlyArray<(typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS]>;
}

const CHANGE_REQUESTS: readonly ChangeRequestSeed[] = [
  {
    key: 'clientReview',
    number: 1,
    title: 'Add gift-card payments to the checkout',
    description:
      'Accept gift cards at the till, including partial redemption and a balance receipt line.',
    businessReason: 'Gift cards were the most requested feature in the last customer survey.',
    scope: 'Checkout screen, payment service and the receipt template.',
    impact: 'Two extra weeks of build and a change to the end-of-day reconciliation report.',
    status: CHANGE_REQUEST_STATUS.CLIENT_REVIEW,
    project: 'acmeStore',
    contract: 'acmeProject',
    requester: 'clientAdmin',
    estimatedMinutes: 56 * 60,
    costImpact: '84000.00',
    timelineImpactDays: 14,
    internalNotes: 'Reuses the voucher service; the estimate has a small buffer for testing.',
    submittedDaysAgo: 9,
    path: [
      CHANGE_REQUEST_STATUS.SUBMITTED,
      CHANGE_REQUEST_STATUS.INTERNAL_REVIEW,
      CHANGE_REQUEST_STATUS.CLIENT_REVIEW,
    ],
  },
  {
    key: 'approved',
    number: 2,
    title: 'Second receipt printer at the service desk',
    description: 'Support a second printer so returns can be processed away from the tills.',
    businessReason: 'Queues at the service desk during the weekend rush.',
    scope: 'Printer settings screen and the print routing rules.',
    impact: 'One week of work inside the current plan.',
    status: CHANGE_REQUEST_STATUS.APPROVED,
    project: 'acmePos',
    contract: 'acmeSupport',
    requester: 'clientAdmin',
    estimatedMinutes: 20 * 60,
    costImpact: '30000.00',
    timelineImpactDays: 5,
    internalNotes: 'Covered by the AMC hours; no separate invoice.',
    submittedDaysAgo: 26,
    path: [
      CHANGE_REQUEST_STATUS.SUBMITTED,
      CHANGE_REQUEST_STATUS.INTERNAL_REVIEW,
      CHANGE_REQUEST_STATUS.CLIENT_REVIEW,
      CHANGE_REQUEST_STATUS.APPROVED,
    ],
  },
  {
    key: 'draft',
    number: 3,
    title: 'Loyalty points on returns',
    description: 'Decide how points behave when a customer returns a discounted item.',
    businessReason: 'Store managers report confusion at the counter.',
    scope: 'To be agreed with the provider.',
    impact: 'Unknown until the provider estimates it.',
    status: CHANGE_REQUEST_STATUS.DRAFT,
    project: 'acmeStore',
    contract: 'acmeProject',
    requester: 'clientEmployee',
    estimatedMinutes: null,
    costImpact: null,
    timelineImpactDays: null,
    internalNotes: null,
    submittedDaysAgo: null,
    path: [],
  },
];

/** Change requests across the workflow, with history and a published client approval. */
export async function seedChangeRequests(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
  contracts: SeededContracts,
  milestones: SeededMilestones,
): Promise<SeededChangeRequests> {
  const organizationId = organizations.serviceProvider.id;
  const seeded: Partial<SeededChangeRequests> = {};

  for (const seed of CHANGE_REQUESTS) {
    const data = {
      organizationId,
      clientOrganizationId: organizations.acme.id,
      projectId: projects[seed.project].id,
      contractId: contracts[seed.contract].id,
      title: seed.title,
      description: seed.description,
      businessReason: seed.businessReason,
      scope: seed.scope,
      impact: seed.impact,
      estimatedMinutes: seed.estimatedMinutes,
      costImpact: seed.costImpact,
      currency: 'INR',
      timelineImpactDays: seed.timelineImpactDays,
      status: seed.status,
      internalNotes: seed.internalNotes,
      requestedById: users[seed.requester].id,
      createdById: users[seed.requester].id,
      submittedAt: seed.submittedDaysAgo === null ? null : at(-seed.submittedDaysAgo, 11),
      approvedAt: seed.status === CHANGE_REQUEST_STATUS.APPROVED ? at(-12, 15) : null,
      scheduledFor: seed.status === CHANGE_REQUEST_STATUS.APPROVED ? dayOffset(7) : null,
    };
    const changeRequest = await prisma.changeRequest.upsert({
      where: { organizationId_number: { organizationId, number: seed.number } },
      update: data,
      create: { ...data, organizationId, number: seed.number },
    });
    seeded[seed.key] = changeRequest;

    for (const [index, status] of seed.path.entries()) {
      const exists = await prisma.changeRequestHistory.findFirst({
        where: { changeRequestId: changeRequest.id, toStatus: status },
      });
      if (exists) {
        continue;
      }
      await prisma.changeRequestHistory.create({
        data: {
          changeRequestId: changeRequest.id,
          fromStatus: index === 0 ? CHANGE_REQUEST_STATUS.DRAFT : (seed.path[index - 1] ?? null),
          toStatus: status,
          note: index === 0 ? 'Raised from the client portal' : null,
          changedById:
            status === CHANGE_REQUEST_STATUS.SUBMITTED || status === CHANGE_REQUEST_STATUS.APPROVED
              ? users[seed.requester].id
              : users.pm.id,
          createdAt: at(-(seed.submittedDaysAgo ?? 1) + index, 12),
        },
      });
    }
  }

  const changeRequests = seeded as SeededChangeRequests;
  await raiseCounter(prisma, organizationId, 'CHANGE_REQUEST', CHANGE_REQUESTS.length);
  await linkApprovedWork(prisma, users, changeRequests, milestones);
  await seedChangeRequestApproval(prisma, organizations, users, projects, changeRequests);
  console.warn(`Change requests: ${CHANGE_REQUESTS.length}`);
  return changeRequests;
}

/** The approved change owns the internal hardening milestone, showing the traceability link. */
async function linkApprovedWork(
  prisma: PrismaClient,
  users: SeededUsers,
  changeRequests: SeededChangeRequests,
  milestones: SeededMilestones,
): Promise<void> {
  await prisma.milestone.update({
    where: { id: milestones.hardening.id },
    data: { changeRequestId: changeRequests.approved.id },
  });
  const task = await prisma.task.findFirst({
    where: { milestoneId: milestones.hardening.id },
    orderBy: { number: 'asc' },
  });
  if (task) {
    await prisma.task.update({
      where: { id: task.id },
      data: { changeRequestId: changeRequests.approved.id },
    });
  }
  await prisma.comment
    .findFirst({ where: { changeRequestId: changeRequests.approved.id } })
    .then(async (existing) => {
      if (existing) {
        return;
      }
      await prisma.comment.create({
        data: {
          organizationId: changeRequests.approved.organizationId,
          changeRequestId: changeRequests.approved.id,
          authorId: users.pm.id,
          body: 'Approved by the client; the work is scheduled for next week.',
          visibility: 'CLIENT',
        },
      });
    });
}

/** The change waiting for the client is published as an approval request. */
async function seedChangeRequestApproval(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
  changeRequests: SeededChangeRequests,
): Promise<void> {
  const subjectId = changeRequests.clientReview.id;
  const existing = await prisma.approvalRequest.findFirst({
    where: { subjectType: APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST, subjectId },
  });
  if (existing) {
    return;
  }
  const approval = await prisma.approvalRequest.create({
    data: {
      organizationId: organizations.serviceProvider.id,
      clientOrganizationId: organizations.acme.id,
      projectId: projects.acmeStore.id,
      changeRequestId: subjectId,
      subjectType: APPROVAL_SUBJECT_TYPE.CHANGE_REQUEST,
      subjectId,
      title: 'Approve: add gift-card payments to the checkout',
      summary:
        'Adds gift-card payments at the till. Estimated cost 84,000 INR and 14 extra days of delivery.',
      status: APPROVAL_STATUS.PUBLISHED,
      dueDate: dayOffset(4),
      requestedById: users.pm.id,
      internalReviewerId: users.director.id,
      internalReviewedAt: at(-6, 10),
      publishedById: users.pm.id,
      publishedAt: at(-5, 10),
    },
  });
  await prisma.approvalHistory.createMany({
    data: [
      {
        approvalId: approval.id,
        fromStatus: null,
        toStatus: APPROVAL_STATUS.DRAFT,
        side: 'INTERNAL',
        actorId: users.pm.id,
        createdAt: at(-7, 10),
      },
      {
        approvalId: approval.id,
        fromStatus: APPROVAL_STATUS.DRAFT,
        toStatus: APPROVAL_STATUS.INTERNAL_REVIEW,
        side: 'INTERNAL',
        actorId: users.pm.id,
        createdAt: at(-6, 10),
      },
      {
        approvalId: approval.id,
        fromStatus: APPROVAL_STATUS.INTERNAL_REVIEW,
        toStatus: APPROVAL_STATUS.PUBLISHED,
        side: 'INTERNAL',
        actorId: users.pm.id,
        createdAt: at(-5, 10),
      },
    ],
  });
}
