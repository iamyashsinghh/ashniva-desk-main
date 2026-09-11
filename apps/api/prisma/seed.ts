// Development seed. Idempotent: safe to run repeatedly.
// Creates permissions, system and custom roles, fictional organizations, demo users for every
// role, teams, projects, tasks in every workflow status, tickets, client updates, work logs,
// daily reports, audit records, and the Phase 2 data: contracts with a support-hour ledger and
// payment milestones, delivery milestones, SLA policies with ticket clocks, change requests,
// client approvals and in-app notifications. NEVER put real customer data here. Demo passwords
// come from SEED_USER_PASSWORD and must never be used in production.
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { seedApprovals, seedNotifications } from './seed/seed-approvals';
import { seedChangeRequests } from './seed/seed-change-requests';
import { seedContracts } from './seed/seed-contracts';
import { seedCustomRole } from './seed/seed-custom-role';
import { seedMilestones } from './seed/seed-milestones';
import { seedOrganizations } from './seed/seed-organizations';
import { seedPermissions } from './seed/seed-permissions';
import { seedProjects, seedTaskCategories } from './seed/seed-projects';
import { seedAuditLogs, seedDailyReports } from './seed/seed-reports-and-audit';
import { seedRoles } from './seed/seed-roles';
import { seedSla } from './seed/seed-sla';
import { seedTasks } from './seed/seed-tasks';
import { seedTeams } from './seed/seed-teams';
import { seedTickets } from './seed/seed-tickets';
import { seedUsers } from './seed/seed-users';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    // Demo accounts with a shared password must never end up in a real deployment.
    throw new Error(
      'Refusing to seed demo data with NODE_ENV=production (set ALLOW_DEMO_SEED=true only for local previews)',
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const permissionsByKey = await seedPermissions(prisma);
    const rolesByKey = await seedRoles(prisma, permissionsByKey);
    const organizations = await seedOrganizations(prisma);
    const users = await seedUsers(prisma, { organizations, rolesByKey });
    
    // The rest of the seeders are commented out as requested.
    // const teams = await seedTeams(prisma, organizations, users);
    // const categories = await seedTaskCategories(prisma, organizations);
    // const projects = await seedProjects(prisma, organizations, users, teams);
    // const tasksByNumber = await seedTasks(prisma, { organizations, users, projects, categories });
    // await seedTickets(prisma, { organizations, users, projects, teams, tasksByNumber });
    // await seedDailyReports(prisma, organizations, users);
    // await seedAuditLogs(prisma, organizations, users, projects, tasksByNumber);
    // await seedCustomRole(prisma, organizations, permissionsByKey);
    // const contracts = await seedContracts(prisma, organizations, users, projects);
    // const milestones = await seedMilestones(prisma, organizations, users, projects, contracts);
    // await seedSla(prisma, organizations);
    // await seedChangeRequests(prisma, organizations, users, projects, contracts, milestones);
    // await seedApprovals(prisma, organizations, users, projects, milestones);
    // await seedNotifications(prisma, organizations, users);
    console.warn('Seed completed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
