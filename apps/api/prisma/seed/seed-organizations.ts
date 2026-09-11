import { DEFAULT_BRANDING, ORGANIZATION_TYPE } from '@ashniva/types';

import type { Organization, PrismaClient } from '../../src/generated/prisma/client';

export interface SeededOrganizations {
  /** Ashniva Technologies — runs the system, owns every project and ticket. */
  serviceProvider: Organization;
  /** A company of the same group whose employees raise internal tickets. */
  groupCompany: Organization;
  /** Client 1 */
  acme: Organization;
  /** Client 2 — completely separate from Acme; used by the tenant-isolation tests. */
  zenith: Organization;
}

/** Fictional organizations used for local development and tests. */
export async function seedOrganizations(prisma: PrismaClient): Promise<SeededOrganizations> {
  const serviceProvider = await prisma.organization.upsert({
    where: { slug: 'ashniva' },
    update: { isServiceProvider: true },
    create: {
      name: 'Ashniva Technologies',
      slug: 'ashniva',
      type: ORGANIZATION_TYPE.OWN_GROUP,
      isServiceProvider: true,
      settings: { branding: DEFAULT_BRANDING },
    },
  });

  console.warn('Organizations: 1');
  return { serviceProvider } as unknown as SeededOrganizations;
}
