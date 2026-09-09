import type { PrismaClient, Team } from '../../src/generated/prisma/client';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededUsers, SeedUserKey } from './seed-users';

export interface SeededTeams {
  web: Team;
  support: Team;
}

interface TeamSeed {
  key: keyof SeededTeams;
  name: string;
  description: string;
  lead: SeedUserKey;
  members: SeedUserKey[];
}

const TEAMS: readonly TeamSeed[] = [
  {
    key: 'web',
    name: 'Web Team',
    description: 'Builds and maintains client web and POS applications',
    lead: 'lead',
    members: ['lead', 'developer', 'developer2', 'tester'],
  },
  {
    key: 'support',
    name: 'Support Desk',
    description: 'First response for client and internal tickets',
    lead: 'support',
    members: ['support', 'developer2'],
  },
];

export async function seedTeams(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
): Promise<SeededTeams> {
  const organizationId = organizations.serviceProvider.id;
  const teams: Partial<SeededTeams> = {};

  for (const seed of TEAMS) {
    const team = await prisma.team.upsert({
      where: { organizationId_name: { organizationId, name: seed.name } },
      update: { description: seed.description, leadUserId: users[seed.lead].id, deletedAt: null },
      create: {
        organizationId,
        name: seed.name,
        description: seed.description,
        leadUserId: users[seed.lead].id,
      },
    });
    await prisma.teamMember.deleteMany({ where: { teamId: team.id } });
    await prisma.teamMember.createMany({
      data: seed.members.map((member) => ({ teamId: team.id, userId: users[member].id })),
    });
    teams[seed.key] = team;
  }

  console.warn(`Teams: ${TEAMS.length}`);
  return teams as SeededTeams;
}
