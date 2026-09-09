import {
  DEFAULT_TASK_CATEGORIES,
  PROJECT_MEMBER_ROLE,
  PROJECT_STATUS,
  PROJECT_TYPE,
  type ProjectMemberRole,
  type ProjectStatus,
  type ProjectType,
} from '@ashniva/types';

import type { PrismaClient, Project, TaskCategory } from '../../src/generated/prisma/client';
import { dayOffset } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededTeams } from './seed-teams';
import type { SeededUsers, SeedUserKey } from './seed-users';

export type SeedProjectKey =
  'acmePos' | 'acmeStore' | 'zenithFleet' | 'groupPayroll' | 'internalDesk';

export type SeededProjects = Record<SeedProjectKey, Project>;

interface ProjectSeed {
  key: SeedProjectKey;
  code: string;
  name: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  client: keyof SeededOrganizations | null;
  manager: SeedUserKey;
  lead: SeedUserKey;
  team: keyof SeededTeams;
  startDaysAgo: number;
  targetDaysAhead: number;
  members: Array<[SeedUserKey, ProjectMemberRole]>;
}

const PROJECTS: readonly ProjectSeed[] = [
  {
    key: 'acmePos',
    code: 'ACM',
    name: 'Acme Retail POS',
    description:
      'Point-of-sale application for 40 Acme stores: billing, inventory and daily closing.',
    type: PROJECT_TYPE.FIXED_PRICE,
    status: PROJECT_STATUS.ACTIVE,
    client: 'acme',
    manager: 'pm',
    lead: 'lead',
    team: 'web',
    startDaysAgo: 60,
    targetDaysAhead: 45,
    members: [
      ['pm', PROJECT_MEMBER_ROLE.MANAGER],
      ['lead', PROJECT_MEMBER_ROLE.LEAD],
      ['developer', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['developer2', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['tester', PROJECT_MEMBER_ROLE.TESTER],
      ['support', PROJECT_MEMBER_ROLE.SUPPORT],
      ['clientAdmin', PROJECT_MEMBER_ROLE.CLIENT_CONTACT],
    ],
  },
  {
    key: 'acmeStore',
    code: 'ACW',
    name: 'Acme Web Store',
    description: 'Online store and loyalty programme, monthly development contract.',
    type: PROJECT_TYPE.MONTHLY_CONTRACT,
    status: PROJECT_STATUS.ACTIVE,
    client: 'acme',
    manager: 'pm',
    lead: 'lead',
    team: 'web',
    startDaysAgo: 120,
    targetDaysAhead: 200,
    members: [
      ['pm', PROJECT_MEMBER_ROLE.MANAGER],
      ['lead', PROJECT_MEMBER_ROLE.LEAD],
      ['developer', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['tester', PROJECT_MEMBER_ROLE.TESTER],
      ['clientAdmin', PROJECT_MEMBER_ROLE.CLIENT_CONTACT],
    ],
  },
  {
    key: 'zenithFleet',
    code: 'ZEN',
    name: 'Zenith Fleet Tracker',
    description: 'Vehicle tracking and dispatch dashboard under an annual maintenance contract.',
    type: PROJECT_TYPE.AMC,
    status: PROJECT_STATUS.ACTIVE,
    client: 'zenith',
    manager: 'pm',
    lead: 'lead',
    team: 'web',
    startDaysAgo: 300,
    targetDaysAhead: 65,
    members: [
      ['pm', PROJECT_MEMBER_ROLE.MANAGER],
      ['lead', PROJECT_MEMBER_ROLE.LEAD],
      ['developer2', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['tester', PROJECT_MEMBER_ROLE.TESTER],
      ['support', PROJECT_MEMBER_ROLE.SUPPORT],
      ['zenithAdmin', PROJECT_MEMBER_ROLE.CLIENT_CONTACT],
    ],
  },
  {
    key: 'groupPayroll',
    code: 'GHR',
    name: 'GroupHR Payroll',
    description: 'Payroll and leave module for the group HR company.',
    type: PROJECT_TYPE.INTERNAL_WORK,
    status: PROJECT_STATUS.ON_HOLD,
    client: 'groupCompany',
    manager: 'pm',
    lead: 'lead',
    team: 'web',
    startDaysAgo: 40,
    targetDaysAhead: 90,
    members: [
      ['pm', PROJECT_MEMBER_ROLE.MANAGER],
      ['lead', PROJECT_MEMBER_ROLE.LEAD],
      ['developer', PROJECT_MEMBER_ROLE.DEVELOPER],
    ],
  },
  {
    key: 'internalDesk',
    code: 'ADK',
    name: 'Ashniva Desk (internal)',
    description: 'Our own product. No client can see this project.',
    type: PROJECT_TYPE.INTERNAL_PRODUCT,
    status: PROJECT_STATUS.ACTIVE,
    client: null,
    manager: 'director',
    lead: 'lead',
    team: 'web',
    startDaysAgo: 30,
    targetDaysAhead: 120,
    members: [
      ['director', PROJECT_MEMBER_ROLE.MANAGER],
      ['lead', PROJECT_MEMBER_ROLE.LEAD],
      ['developer', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['developer2', PROJECT_MEMBER_ROLE.DEVELOPER],
      ['tester', PROJECT_MEMBER_ROLE.TESTER],
    ],
  },
];

export async function seedTaskCategories(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
): Promise<Map<string, TaskCategory>> {
  const organizationId = organizations.serviceProvider.id;
  const byName = new Map<string, TaskCategory>();
  for (const [index, category] of DEFAULT_TASK_CATEGORIES.entries()) {
    const row = await prisma.taskCategory.upsert({
      where: { organizationId_name: { organizationId, name: category.name } },
      update: { kind: category.kind, sortOrder: index, isActive: true },
      create: { organizationId, name: category.name, kind: category.kind, sortOrder: index },
    });
    byName.set(category.name, row);
  }
  console.warn(`Task categories: ${byName.size}`);
  return byName;
}

export async function seedProjects(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  teams: SeededTeams,
): Promise<SeededProjects> {
  const organizationId = organizations.serviceProvider.id;
  const projects: Partial<SeededProjects> = {};

  for (const seed of PROJECTS) {
    const data = {
      name: seed.name,
      description: seed.description,
      type: seed.type,
      status: seed.status,
      clientOrganizationId: seed.client ? organizations[seed.client].id : null,
      managerUserId: users[seed.manager].id,
      leadUserId: users[seed.lead].id,
      teamId: teams[seed.team].id,
      startDate: dayOffset(-seed.startDaysAgo),
      targetDate: dayOffset(seed.targetDaysAhead),
      deletedAt: null,
    };
    const project = await prisma.project.upsert({
      where: { organizationId_code: { organizationId, code: seed.code } },
      update: data,
      create: { ...data, organizationId, code: seed.code, createdById: users[seed.manager].id },
    });
    await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
    await prisma.projectMember.createMany({
      data: seed.members.map(([member, role]) => ({
        projectId: project.id,
        userId: users[member].id,
        role,
      })),
    });
    projects[seed.key] = project;
  }

  console.warn(`Projects: ${PROJECTS.length}`);
  return projects as SeededProjects;
}
