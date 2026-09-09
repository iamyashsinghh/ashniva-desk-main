import { PRIORITY, SLA_TARGET_STATUS, TICKET_STATUS, type SlaTargetStatus } from '@ashniva/types';

import type { PrismaClient, SlaPolicy } from '../../src/generated/prisma/client';
import type { SeededOrganizations } from './seed-organizations';

interface PolicySeed {
  name: string;
  description: string;
  isDefault: boolean;
  client: 'acme' | null;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  rules: ReadonlyArray<{
    priority: (typeof PRIORITY)[keyof typeof PRIORITY];
    firstResponseMinutes: number;
    resolutionMinutes: number;
  }>;
}

const POLICIES: readonly PolicySeed[] = [
  {
    name: 'Standard support',
    description: 'Applies to every client without their own policy.',
    isDefault: true,
    client: null,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessDays: [1, 2, 3, 4, 5],
    rules: [
      { priority: PRIORITY.CRITICAL, firstResponseMinutes: 60, resolutionMinutes: 480 },
      { priority: PRIORITY.HIGH, firstResponseMinutes: 120, resolutionMinutes: 960 },
      { priority: PRIORITY.MEDIUM, firstResponseMinutes: 240, resolutionMinutes: 1920 },
      { priority: PRIORITY.LOW, firstResponseMinutes: 480, resolutionMinutes: 2880 },
    ],
  },
  {
    name: 'Acme Retail — extended hours',
    description: 'Acme trades on Saturdays, so their clocks run six days a week.',
    isDefault: false,
    client: 'acme',
    businessHoursStart: '08:00',
    businessHoursEnd: '20:00',
    businessDays: [1, 2, 3, 4, 5, 6],
    rules: [
      { priority: PRIORITY.CRITICAL, firstResponseMinutes: 30, resolutionMinutes: 240 },
      { priority: PRIORITY.HIGH, firstResponseMinutes: 60, resolutionMinutes: 600 },
      { priority: PRIORITY.MEDIUM, firstResponseMinutes: 180, resolutionMinutes: 1440 },
      { priority: PRIORITY.LOW, firstResponseMinutes: 480, resolutionMinutes: 2880 },
    ],
  },
];

const MINUTE = 60 * 1000;

/**
 * SLA policies plus clocks on the open demo tickets: one comfortably on track, one close to its
 * first-response target and one already breached, so every dashboard state is visible.
 */
export async function seedSla(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
): Promise<void> {
  const organizationId = organizations.serviceProvider.id;
  const policies = new Map<string, SlaPolicy>();

  for (const seed of POLICIES) {
    const clientOrganizationId = seed.client ? organizations[seed.client].id : null;
    const data = {
      organizationId,
      clientOrganizationId,
      projectId: null,
      name: seed.name,
      description: seed.description,
      isDefault: seed.isDefault,
      timezone: 'Asia/Kolkata',
      businessHoursStart: seed.businessHoursStart,
      businessHoursEnd: seed.businessHoursEnd,
      businessDays: seed.businessDays,
      pauseStatuses: [TICKET_STATUS.WAITING_CLIENT],
      warningPercent: 80,
    };
    const existing = await prisma.slaPolicy.findFirst({
      where: { organizationId, name: seed.name },
    });
    const policy = existing
      ? await prisma.slaPolicy.update({ where: { id: existing.id }, data })
      : await prisma.slaPolicy.create({ data });
    for (const rule of seed.rules) {
      await prisma.slaPolicyRule.upsert({
        where: { policyId_priority: { policyId: policy.id, priority: rule.priority } },
        update: {
          firstResponseMinutes: rule.firstResponseMinutes,
          resolutionMinutes: rule.resolutionMinutes,
        },
        create: { policyId: policy.id, ...rule },
      });
    }
    policies.set(seed.name, policy);
  }

  await seedTicketClocks(prisma, organizationId, policies);
  console.warn(`SLA policies: ${POLICIES.length}`);
}

/** Minutes left on the first-response clock → the state the dashboards show. */
function firstResponseStatusFor(minutesLeft: number): SlaTargetStatus {
  if (minutesLeft < 0) {
    return SLA_TARGET_STATUS.BREACHED;
  }
  return minutesLeft < 60 ? SLA_TARGET_STATUS.AT_RISK : SLA_TARGET_STATUS.ON_TRACK;
}

async function seedTicketClocks(
  prisma: PrismaClient,
  organizationId: string,
  policies: Map<string, SlaPolicy>,
): Promise<void> {
  const openTickets = await prisma.ticket.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED] },
    },
    include: { clientOrganization: { select: { slug: true } } },
    orderBy: { number: 'asc' },
  });
  const now = Date.now();
  // Deliberate spread: breached, at risk, then on track for everything else.
  const offsets = [-90, 25, 240];

  for (const [index, ticket] of openTickets.entries()) {
    const policy =
      (ticket.clientOrganization.slug === 'acme-retail'
        ? policies.get('Acme Retail — extended hours')
        : policies.get('Standard support')) ?? policies.get('Standard support');
    if (!policy) {
      return;
    }
    const offsetMinutes = offsets[Math.min(index, offsets.length - 1)] ?? 240;
    const firstResponseDueAt = new Date(now + offsetMinutes * MINUTE);
    const resolutionDueAt = new Date(now + (offsetMinutes + 480) * MINUTE);
    const status = firstResponseStatusFor(offsetMinutes);
    const paused = ticket.status === TICKET_STATUS.WAITING_CLIENT;

    await prisma.ticketSla.upsert({
      where: { ticketId: ticket.id },
      update: {
        policyId: policy.id,
        firstResponseDueAt,
        firstResponseWarnAt: new Date(firstResponseDueAt.getTime() - 30 * MINUTE),
        firstResponseStatus: paused ? SLA_TARGET_STATUS.PAUSED : status,
        resolutionDueAt,
        resolutionWarnAt: new Date(resolutionDueAt.getTime() - 60 * MINUTE),
        resolutionStatus: paused ? SLA_TARGET_STATUS.PAUSED : SLA_TARGET_STATUS.ON_TRACK,
        pausedAt: paused ? new Date(now - 120 * MINUTE) : null,
      },
      create: {
        ticketId: ticket.id,
        policyId: policy.id,
        firstResponseDueAt,
        firstResponseWarnAt: new Date(firstResponseDueAt.getTime() - 30 * MINUTE),
        firstResponseStatus: paused ? SLA_TARGET_STATUS.PAUSED : status,
        resolutionDueAt,
        resolutionWarnAt: new Date(resolutionDueAt.getTime() - 60 * MINUTE),
        resolutionStatus: paused ? SLA_TARGET_STATUS.PAUSED : SLA_TARGET_STATUS.ON_TRACK,
        pausedAt: paused ? new Date(now - 120 * MINUTE) : null,
        clockStartedAt: ticket.createdAt,
      },
    });

    const started = await prisma.slaEvent.findFirst({
      where: { ticketId: ticket.id, kind: 'STARTED' },
    });
    if (!started) {
      await prisma.slaEvent.create({
        data: {
          ticketId: ticket.id,
          kind: 'STARTED',
          detail: `${policy.name}: first response due ${firstResponseDueAt.toISOString()}`,
          createdAt: ticket.createdAt,
        },
      });
    }
  }
}
