import { ROLE_KEYS, USER_STATUS, type RoleKey } from '@ashniva/types';
import argon2 from 'argon2';

import type { PrismaClient, User } from '../../src/generated/prisma/client';
import type { SeededOrganizations } from './seed-organizations';

export type SeedUserKey =
  | 'director'
  | 'pm'
  | 'lead'
  | 'developer'
  | 'developer2'
  | 'tester'
  | 'support'
  | 'employee'
  | 'clientAdmin'
  | 'clientEmployee'
  | 'zenithAdmin'
  | 'zenithEmployee';

interface DemoUser {
  key: SeedUserKey;
  email: string;
  name: string;
  title: string;
  roleKey: RoleKey;
  organization: keyof SeededOrganizations;
  showDevelopmentSection?: boolean;
}

/** Fictional people. Emails use the reserved example.com domain; never real customer data. */
export const DEMO_USERS: readonly DemoUser[] = [
  {
    key: 'director',
    email: 'director@example.com',
    name: 'Rahul K',
    title: 'Director',
    roleKey: ROLE_KEYS.SUPER_ADMIN,
    organization: 'serviceProvider',
    showDevelopmentSection: false,
  },
  {
    key: 'pm',
    email: 'pm@example.com',
    name: 'Anita R',
    title: 'Project Manager',
    roleKey: ROLE_KEYS.PROJECT_MANAGER,
    organization: 'serviceProvider',
    showDevelopmentSection: false,
  },
  {
    key: 'lead',
    email: 'lead@example.com',
    name: 'Sneha N',
    title: 'Team Lead',
    roleKey: ROLE_KEYS.TEAM_LEAD,
    organization: 'serviceProvider',
  },
  {
    key: 'developer',
    email: 'developer@example.com',
    name: 'Priya S',
    title: 'Developer',
    roleKey: ROLE_KEYS.DEVELOPER,
    organization: 'serviceProvider',
  },
  {
    key: 'developer2',
    email: 'developer2@example.com',
    name: 'Arjun M',
    title: 'Developer',
    roleKey: ROLE_KEYS.DEVELOPER,
    organization: 'serviceProvider',
  },
  {
    key: 'tester',
    email: 'tester@example.com',
    name: 'Kavya T',
    title: 'Tester / QA lead',
    roleKey: ROLE_KEYS.TESTER,
    organization: 'serviceProvider',
  },
  {
    key: 'support',
    email: 'support@example.com',
    name: 'Vikram J',
    title: 'Support Executive',
    roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
    organization: 'serviceProvider',
  },
  {
    key: 'employee',
    email: 'employee@example.com',
    name: 'Deepak B',
    title: 'Accounts',
    roleKey: ROLE_KEYS.INTERNAL_EMPLOYEE,
    organization: 'groupCompany',
  },
  {
    key: 'clientAdmin',
    email: 'client-admin@example.com',
    name: 'Sunita M',
    title: 'Operations Head',
    roleKey: ROLE_KEYS.CLIENT_ADMIN,
    organization: 'acme',
  },
  {
    key: 'clientEmployee',
    email: 'client-employee@example.com',
    name: 'Ramesh P',
    title: 'Store Manager',
    roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
    organization: 'acme',
  },
  {
    key: 'zenithAdmin',
    email: 'zenith-admin@example.com',
    name: 'Farah A',
    title: 'IT Manager',
    roleKey: ROLE_KEYS.CLIENT_ADMIN,
    organization: 'zenith',
  },
  {
    key: 'zenithEmployee',
    email: 'zenith-employee@example.com',
    name: 'Manoj D',
    title: 'Dispatch Supervisor',
    roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
    organization: 'zenith',
  },
];

export type SeededUsers = Record<SeedUserKey, User>;

interface SeedUsersContext {
  organizations: SeededOrganizations;
  rolesByKey: Map<RoleKey, string>;
}

/**
 * The password every demo user gets.
 *
 * The fallback exists because the seed is a development convenience and `pnpm db:seed` should
 * work straight after `cp .env.example .env`.
 *
 * Be exact about what the production branch below does, because it is easy to read as more than
 * it is. **`ALLOW_DEMO_SEED` is the control**: with `NODE_ENV=production` the seed refuses to run
 * at all unless it is set (`prisma/seed.ts`), so demo accounts and a real deployment cannot meet
 * by accident. This branch is narrower — it stops a *preview* silently inheriting a password
 * nobody chose, by making the operator name one. It does not fire for the case somebody might
 * hope it covers: `docker-compose.yml` and `.env.example` both set `SEED_USER_PASSWORD`, so on
 * the two paths that actually reach here with `NODE_ENV=production` the variable is always
 * present and the throw is unreachable. Tightening it further — refusing a placeholder-looking
 * password, say — would refuse the documented local preview, which is exactly what this file is
 * for, so it says what it does instead of claiming more.
 */
function seedPassword(): string {
  const configured = process.env.SEED_USER_PASSWORD;
  if (configured && configured.length > 0) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_USER_PASSWORD must be set when seeding with NODE_ENV=production. There is no default.',
    );
  }
  return 'ChangeMe123!';
}

export async function seedUsers(
  prisma: PrismaClient,
  context: SeedUsersContext,
): Promise<SeededUsers> {
  const password = seedPassword();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const users: Partial<SeededUsers> = {};

  for (const demoUser of DEMO_USERS) {
    const roleId = context.rolesByKey.get(demoUser.roleKey);
    if (!roleId) {
      throw new Error(`Role ${demoUser.roleKey} was not seeded`);
    }
    const organization = context.organizations[demoUser.organization];

    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: { name: demoUser.name, passwordHash, status: USER_STATUS.ACTIVE, deletedAt: null },
      create: {
        email: demoUser.email,
        name: demoUser.name,
        passwordHash,
        status: USER_STATUS.ACTIVE,
      },
    });

    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: {
        roleId,
        title: demoUser.title,
        showDevelopmentSection: demoUser.showDevelopmentSection ?? true,
        deletedAt: null,
      },
      create: {
        organizationId: organization.id,
        userId: user.id,
        roleId,
        title: demoUser.title,
        showDevelopmentSection: demoUser.showDevelopmentSection ?? true,
      },
    });
    users[demoUser.key] = user;
  }

  console.warn(`Demo users: ${DEMO_USERS.length} (password from SEED_USER_PASSWORD)`);
  return users as SeededUsers;
}
