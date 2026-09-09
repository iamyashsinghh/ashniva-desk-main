import {
  APPROVAL_STATUS,
  APPROVAL_SUBJECT_TYPE,
  NOTIFICATION_TYPE,
  type ApprovalStatus,
  type ApprovalSubjectType,
} from '@ashniva/types';

import type { PrismaClient } from '../../src/generated/prisma/client';
import { at, dayOffset } from './seed-helpers';
import type { SeededMilestones } from './seed-milestones';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import type { SeededUsers } from './seed-users';

interface ApprovalSeed {
  subjectType: ApprovalSubjectType;
  subject: keyof SeededMilestones;
  title: string;
  summary: string;
  status: ApprovalStatus;
  dueDaysAhead: number;
  decided: boolean;
}

const APPROVALS: readonly ApprovalSeed[] = [
  {
    subjectType: APPROVAL_SUBJECT_TYPE.MILESTONE,
    subject: 'discovery',
    title: 'Sign off: discovery and design',
    summary: 'The design pack and roll-out plan agreed in the workshop on the 12th.',
    status: APPROVAL_STATUS.CLIENT_APPROVED,
    dueDaysAhead: -25,
    decided: true,
  },
  {
    subjectType: APPROVAL_SUBJECT_TYPE.MILESTONE,
    subject: 'pilot',
    title: 'Sign off: pilot store',
    summary: 'Confirm the pilot store is running the new checkout to your satisfaction.',
    status: APPROVAL_STATUS.PUBLISHED,
    dueDaysAhead: 6,
    decided: false,
  },
];

/** Milestone sign-offs: one already approved, one waiting for the client. */
export async function seedApprovals(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
  milestones: SeededMilestones,
): Promise<void> {
  for (const seed of APPROVALS) {
    const subjectId = milestones[seed.subject].id;
    const existing = await prisma.approvalRequest.findFirst({
      where: { subjectType: seed.subjectType, subjectId },
    });
    if (existing) {
      continue;
    }
    const approval = await prisma.approvalRequest.create({
      data: {
        organizationId: organizations.serviceProvider.id,
        clientOrganizationId: organizations.acme.id,
        projectId: projects.acmeStore.id,
        subjectType: seed.subjectType,
        subjectId,
        title: seed.title,
        summary: seed.summary,
        status: seed.status,
        dueDate: dayOffset(seed.dueDaysAhead),
        requestedById: users.pm.id,
        internalReviewerId: users.director.id,
        internalReviewedAt: at(-10, 11),
        publishedById: users.pm.id,
        publishedAt: at(-9, 11),
        decidedById: seed.decided ? users.clientAdmin.id : null,
        decidedAt: seed.decided ? at(-26, 15) : null,
        decisionComment: seed.decided ? 'Looks good, please proceed.' : null,
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
          createdAt: at(-11, 11),
        },
        {
          approvalId: approval.id,
          fromStatus: APPROVAL_STATUS.DRAFT,
          toStatus: APPROVAL_STATUS.PUBLISHED,
          side: 'INTERNAL',
          actorId: users.pm.id,
          createdAt: at(-9, 11),
        },
        ...(seed.decided
          ? [
              {
                approvalId: approval.id,
                fromStatus: APPROVAL_STATUS.PUBLISHED,
                toStatus: APPROVAL_STATUS.CLIENT_APPROVED,
                side: 'CLIENT' as const,
                comment: 'Looks good, please proceed.',
                actorId: users.clientAdmin.id,
                createdAt: at(-26, 15),
              },
            ]
          : []),
      ],
    });
  }
  console.warn(`Approvals: ${APPROVALS.length + 1}`);
}

/** A handful of unread in-app notifications so the bell and inbox are not empty. */
export async function seedNotifications(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
): Promise<void> {
  const rows = [
    {
      user: users.support,
      organizationId: organizations.serviceProvider.id,
      type: NOTIFICATION_TYPE.SLA_BREACH,
      title: 'SLA breached: T-1',
      body: 'The first-response target passed 90 minutes ago.',
      link: '/tickets',
      minutesAgo: 90,
    },
    {
      user: users.support,
      organizationId: organizations.serviceProvider.id,
      type: NOTIFICATION_TYPE.TICKET_NEW,
      title: 'New ticket from Acme Retail',
      body: 'Checkout freezes when a gift card is scanned.',
      link: '/tickets',
      minutesAgo: 240,
    },
    {
      user: users.pm,
      organizationId: organizations.serviceProvider.id,
      type: NOTIFICATION_TYPE.CHANGE_REQUEST_STATUS,
      title: 'CR-0001 is waiting for the client',
      body: 'Gift-card payments: sent for client approval.',
      link: '/change-requests',
      minutesAgo: 60 * 24 * 5,
    },
    {
      user: users.clientAdmin,
      organizationId: organizations.acme.id,
      type: NOTIFICATION_TYPE.APPROVAL_REQUESTED,
      title: 'Your approval is needed',
      body: 'Sign off: pilot store.',
      link: '/portal/approvals',
      minutesAgo: 60 * 24,
    },
    {
      user: users.clientAdmin,
      organizationId: organizations.acme.id,
      type: NOTIFICATION_TYPE.SUPPORT_HOURS_LOW,
      title: 'Support hours running low',
      body: 'Less than 5 hours remain in this billing period.',
      link: '/portal/contracts',
      minutesAgo: 60 * 30,
    },
  ];

  for (const row of rows) {
    const dedupeKey = `seed:${row.user.id}:${row.type}`;
    const existing = await prisma.notification.findFirst({
      where: { userId: row.user.id, dedupeKey },
    });
    if (existing) {
      continue;
    }
    const createdAt = new Date(Date.now() - row.minutesAgo * 60 * 1000);
    await prisma.notification.create({
      data: {
        organizationId: row.organizationId,
        userId: row.user.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        dedupeKey,
        deliveredAt: createdAt,
        createdAt,
      },
    });
  }
  console.warn(`Notifications: ${rows.length}`);
}
