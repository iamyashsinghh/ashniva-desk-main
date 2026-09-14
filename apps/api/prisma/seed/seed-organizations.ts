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

  const groupCompany = await prisma.organization.upsert({
    where: { slug: 'grouphr' },
    update: {},
    create: {
      name: 'GroupHR Services',
      slug: 'grouphr',
      type: ORGANIZATION_TYPE.OWN_GROUP,
    },
  });

  const acme = await prisma.organization.upsert({
    where: { slug: 'acme-retail' },
    update: {},
    create: {
      name: 'Acme Retail Pvt Ltd',
      slug: 'acme-retail',
      type: ORGANIZATION_TYPE.CORPORATE_CUSTOMER,
    },
  });

  const zenith = await prisma.organization.upsert({
    where: { slug: 'zenith-logistics' },
    update: {},
    create: {
      name: 'Zenith Logistics Ltd',
      slug: 'zenith-logistics',
      type: ORGANIZATION_TYPE.AMC_CLIENT,
    },
  });

  console.warn('Organizations: 4');
  return { serviceProvider, groupCompany, acme, zenith };
}
