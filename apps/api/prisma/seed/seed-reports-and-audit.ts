import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@ashniva/types';

import type { PrismaClient, Task } from '../../src/generated/prisma/client';
import { refreshDailyReport } from '../../src/modules/reports/daily-report-collector';
import { at, dayOffset, toDateString } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import type { SeededUsers, SeedUserKey } from './seed-users';

const REPORT_USERS: readonly SeedUserKey[] = ['developer', 'developer2', 'lead', 'tester'];
const REPORT_DAYS = [0, -1, -2, -3, -4, -5, -6];

/** Daily report snapshots for the last week, built with the same code the API uses. */
export async function seedDailyReports(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
): Promise<void> {
  let count = 0;
  for (const userKey of REPORT_USERS) {
    for (const offset of REPORT_DAYS) {
      await refreshDailyReport(
        prisma,
        organizations.serviceProvider.id,
        users[userKey].id,
        toDateString(dayOffset(offset)),
      );
      count += 1;
    }
  }
  console.warn(`Daily reports: ${count}`);
}

const SEED_REQUEST_ID = 'seed';

/**
 * A few audit rows so the Audit History screen is not empty on first run. Audit logs are
 * append-only, so the seed inserts them once (recognised by request_id = "seed").
 */
export async function seedAuditLogs(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
  tasksByNumber: Map<number, Task>,
): Promise<void> {
  const existing = await prisma.auditLog.count({ where: { requestId: SEED_REQUEST_ID } });
  if (existing > 0) {
    console.warn('Audit logs: already seeded');
    return;
  }
  const provider = organizations.serviceProvider.id;
  const task1 = tasksByNumber.get(1);
  const task4 = tasksByNumber.get(4);

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: provider,
        actorUserId: users.director.id,
        action: AUDIT_ACTION.AUTH_LOGIN,
        entityType: AUDIT_ENTITY_TYPE.AUTH,
        entityId: users.director.id,
        createdAt: at(0, 8, 5),
      },
      {
        organizationId: provider,
        actorUserId: users.director.id,
        action: AUDIT_ACTION.USER_CREATED,
        entityType: AUDIT_ENTITY_TYPE.USER,
        entityId: users.developer2.id,
        after: { email: users.developer2.email, role: 'DEVELOPER' },
        createdAt: at(-7, 10),
      },
      {
        organizationId: provider,
        actorUserId: users.director.id,
        action: AUDIT_ACTION.ORGANIZATION_CREATED,
        entityType: AUDIT_ENTITY_TYPE.ORGANIZATION,
        entityId: organizations.zenith.id,
        after: { name: organizations.zenith.name, type: organizations.zenith.type },
        createdAt: at(-8, 9),
      },
      {
        organizationId: provider,
        actorUserId: users.pm.id,
        action: AUDIT_ACTION.PROJECT_CREATED,
        entityType: AUDIT_ENTITY_TYPE.PROJECT,
        entityId: projects.acmePos.id,
        after: { code: 'ACM', name: projects.acmePos.name },
        createdAt: at(-6, 11),
      },
      ...(task1
        ? [
            {
              organizationId: provider,
              actorUserId: users.lead.id,
              action: AUDIT_ACTION.TASK_CREATED,
              entityType: AUDIT_ENTITY_TYPE.TASK,
              entityId: task1.id,
              after: { title: task1.title, assignedTo: users.developer.email },
              createdAt: at(-3, 9, 30),
            },
            {
              organizationId: provider,
              actorUserId: users.tester.id,
              action: AUDIT_ACTION.TASK_STATUS_CHANGED,
              entityType: AUDIT_ENTITY_TYPE.TASK,
              entityId: task1.id,
              before: { status: 'IN_REVIEW' },
              after: { status: 'COMPLETED' },
              createdAt: at(0, 14, 45),
            },
            {
              organizationId: provider,
              actorUserId: users.lead.id,
              action: AUDIT_ACTION.CLIENT_UPDATE_PUBLISHED,
              entityType: AUDIT_ENTITY_TYPE.CLIENT_UPDATE,
              entityId: task1.id,
              after: { title: task1.title, client: organizations.acme.name },
              createdAt: at(0, 15, 10),
            },
          ]
        : []),
      ...(task4
        ? [
            {
              organizationId: provider,
              actorUserId: users.tester.id,
              action: AUDIT_ACTION.TASK_REVIEWED,
              entityType: AUDIT_ENTITY_TYPE.TASK,
              entityId: task4.id,
              before: { status: 'IN_REVIEW' },
              after: { status: 'RETURNED_TO_DEV', outcome: 'rejected' },
              createdAt: at(-1, 16),
            },
          ]
        : []),
      {
        organizationId: provider,
        actorUserId: users.support.id,
        action: AUDIT_ACTION.TICKET_ASSIGNED,
        entityType: AUDIT_ENTITY_TYPE.TICKET,
        entityId: null,
        after: { ticket: 'T-4', assignedTo: users.developer2.email },
        createdAt: at(-1, 10, 20),
      },
      {
        organizationId: provider,
        actorUserId: users.developer.id,
        action: AUDIT_ACTION.AUTH_LOGIN_FAILED,
        entityType: AUDIT_ENTITY_TYPE.AUTH,
        entityId: null,
        after: { email: users.developer.email, reason: 'invalid_credentials' },
        createdAt: at(-1, 8, 50),
      },
    ].map((row) => ({ ...row, requestId: SEED_REQUEST_ID })),
  });
  console.warn('Audit logs: seeded');
}
