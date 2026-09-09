import {
  BILLING_PERIOD,
  CARRY_FORWARD_RULE,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  HOUR_LEDGER_KIND,
  PAYMENT_MILESTONE_STATUS,
} from '@ashniva/types';

import type { Contract, PrismaClient } from '../../src/generated/prisma/client';
import { periodContaining } from '../../src/modules/contracts/contract-periods';
import { dayOffset, raiseCounter } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import type { SeededUsers } from './seed-users';

export interface SeededContracts {
  /** Acme AMC with a monthly support-hour pot; the hour ledger hangs off this one. */
  acmeSupport: Contract;
  /** Fixed-price delivery contract with payment milestones. */
  acmeProject: Contract;
  /** Second client, kept separate so tenant isolation is visible in the demo. */
  zenith: Contract;
}

interface ContractSeed {
  key: keyof SeededContracts;
  numberLabel: string;
  number: number;
  type: (typeof CONTRACT_TYPE)[keyof typeof CONTRACT_TYPE];
  title: string;
  scope: string;
  client: 'acme' | 'zenith';
  project: keyof SeededProjects | null;
  status: (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];
  startDaysAgo: number;
  endDaysAhead: number;
  renewalDaysAhead: number;
  contractValue: string;
  internalCost: string;
  includedMinutesPerPeriod: number;
  lowHoursThresholdMinutes: number;
  clientNotes: string;
  internalNotes: string;
}

const CONTRACTS: readonly ContractSeed[] = [
  {
    key: 'acmeSupport',
    numberLabel: 'CT-2026-0001',
    number: 1,
    type: CONTRACT_TYPE.AMC,
    title: 'Acme Retail — annual maintenance and support',
    scope: 'Application support for the POS and inventory modules, 40 support hours per month.',
    client: 'acme',
    project: 'acmePos',
    status: CONTRACT_STATUS.ACTIVE,
    startDaysAgo: 120,
    endDaysAhead: 240,
    renewalDaysAhead: 210,
    contractValue: '480000.00',
    internalCost: '260000.00',
    includedMinutesPerPeriod: 40 * 60,
    lowHoursThresholdMinutes: 5 * 60,
    clientNotes: 'Support hours reset on the first of every month.',
    internalNotes: 'Renewal talk with the client is planned two months before the end date.',
  },
  {
    key: 'acmeProject',
    numberLabel: 'CT-2026-0002',
    number: 2,
    type: CONTRACT_TYPE.FIXED_PRICE,
    title: 'Acme Retail — store rollout delivery',
    scope: 'Design, build and roll-out of the new store systems, billed against four milestones.',
    client: 'acme',
    project: 'acmeStore',
    status: CONTRACT_STATUS.ACTIVE,
    startDaysAgo: 60,
    endDaysAhead: 25,
    renewalDaysAhead: 20,
    contractValue: '900000.00',
    internalCost: '520000.00',
    includedMinutesPerPeriod: 0,
    lowHoursThresholdMinutes: 0,
    clientNotes: 'Invoices follow the payment milestones below.',
    internalNotes: 'Ends soon: this contract drives the "expiring" figure on the dashboard.',
  },
  {
    key: 'zenith',
    numberLabel: 'CT-2026-0003',
    number: 3,
    type: CONTRACT_TYPE.SUPPORT_HOURS,
    title: 'Zenith Logistics — support hours pack',
    scope: 'A pack of 20 support hours per quarter for the fleet application.',
    client: 'zenith',
    project: 'zenithFleet',
    status: CONTRACT_STATUS.ACTIVE,
    startDaysAgo: 45,
    endDaysAhead: 320,
    renewalDaysAhead: 300,
    contractValue: '150000.00',
    internalCost: '80000.00',
    includedMinutesPerPeriod: 20 * 60,
    lowHoursThresholdMinutes: 4 * 60,
    clientNotes: 'Unused hours carry forward for one quarter, capped at 10 hours.',
    internalNotes: 'Keeps Zenith data separate from Acme in every demo walkthrough.',
  },
];

/** Demo contracts with their current billing period, hour ledger and payment milestones. */
export async function seedContracts(
  prisma: PrismaClient,
  organizations: SeededOrganizations,
  users: SeededUsers,
  projects: SeededProjects,
): Promise<SeededContracts> {
  const organizationId = organizations.serviceProvider.id;
  const seeded: Partial<SeededContracts> = {};

  for (const seed of CONTRACTS) {
    const data = {
      organizationId,
      clientOrganizationId: organizations[seed.client].id,
      projectId: seed.project ? projects[seed.project].id : null,
      number: seed.number,
      numberLabel: seed.numberLabel,
      type: seed.type,
      title: seed.title,
      scope: seed.scope,
      status: seed.status,
      startDate: dayOffset(-seed.startDaysAgo),
      endDate: dayOffset(seed.endDaysAhead),
      renewalDate: dayOffset(seed.renewalDaysAhead),
      autoRenew: seed.type === CONTRACT_TYPE.AMC,
      currency: 'INR',
      contractValue: seed.contractValue,
      internalCost: seed.internalCost,
      includedMinutesPerPeriod: seed.includedMinutesPerPeriod,
      billingPeriod: seed.key === 'zenith' ? BILLING_PERIOD.QUARTERLY : BILLING_PERIOD.MONTHLY,
      carryForwardRule: seed.key === 'zenith' ? CARRY_FORWARD_RULE.CAPPED : CARRY_FORWARD_RULE.NONE,
      carryForwardCapMinutes: seed.key === 'zenith' ? 10 * 60 : null,
      lowHoursThresholdMinutes: seed.lowHoursThresholdMinutes,
      clientNotes: seed.clientNotes,
      internalNotes: seed.internalNotes,
      createdById: users.pm.id,
    };
    const existing = await prisma.contract.findFirst({
      where: { organizationId, numberLabel: seed.numberLabel },
    });
    const contract = existing
      ? await prisma.contract.update({ where: { id: existing.id }, data })
      : await prisma.contract.create({ data });
    seeded[seed.key] = contract;
  }

  const contracts = seeded as SeededContracts;
  await raiseCounter(prisma, organizationId, 'CONTRACT', CONTRACTS.length);
  await seedHourLedger(prisma, organizationId, users, contracts);
  await seedPaymentMilestones(prisma, contracts);
  console.warn(`Contracts: ${CONTRACTS.length}`);
  return contracts;
}

/**
 * Opening credit, two consumptions and one audited manual adjustment in the contract's *current*
 * billing period — the same period the service computes, so the balance the app shows includes
 * them.
 */
async function seedHourLedger(
  prisma: PrismaClient,
  organizationId: string,
  users: SeededUsers,
  contracts: SeededContracts,
): Promise<void> {
  for (const contract of [contracts.acmeSupport, contracts.zenith]) {
    const period = periodContaining(contract, new Date());
    const periodStart = period.start;
    const periodEnd = period.end;
    await prisma.contractPeriod.upsert({
      where: { contractId_periodStart: { contractId: contract.id, periodStart } },
      update: { periodEnd },
      create: { contractId: contract.id, periodStart, periodEnd },
    });

    const included = contract.includedMinutesPerPeriod;
    const rows = [
      {
        kind: HOUR_LEDGER_KIND.INCLUDED,
        minutes: included,
        balance: included,
        reason: 'Hours included in this billing period',
        key: `${contract.id}:included`,
      },
      {
        kind: HOUR_LEDGER_KIND.CONSUMED,
        minutes: -180,
        balance: included - 180,
        reason: 'Approved work logs',
        key: `${contract.id}:consumed-1`,
      },
      {
        kind: HOUR_LEDGER_KIND.CONSUMED,
        minutes: -120,
        balance: included - 300,
        reason: 'Approved work logs',
        key: `${contract.id}:consumed-2`,
      },
      {
        kind: HOUR_LEDGER_KIND.ADJUSTMENT,
        minutes: 60,
        balance: included - 240,
        reason: 'Goodwill hour returned after the duplicate ticket was merged',
        key: `${contract.id}:adjustment`,
      },
    ];
    for (const row of rows) {
      const existing = await prisma.contractHourLedger.findFirst({
        where: { contractId: contract.id, idempotencyKey: row.key },
      });
      if (existing) {
        continue;
      }
      await prisma.contractHourLedger.create({
        data: {
          organizationId,
          contractId: contract.id,
          kind: row.kind,
          minutes: row.minutes,
          balanceAfterMinutes: row.balance,
          periodStart,
          periodEnd,
          reason: row.reason,
          idempotencyKey: row.key,
          createdById: users.pm.id,
        },
      });
    }
  }
}

async function seedPaymentMilestones(
  prisma: PrismaClient,
  contracts: SeededContracts,
): Promise<void> {
  const payments = [
    {
      title: 'Kick-off',
      amount: '270000.00',
      dueDaysAhead: -45,
      status: PAYMENT_MILESTONE_STATUS.PAID,
    },
    {
      title: 'Design sign-off',
      amount: '180000.00',
      dueDaysAhead: -10,
      status: PAYMENT_MILESTONE_STATUS.INVOICED,
    },
    {
      title: 'Pilot store live',
      amount: '270000.00',
      dueDaysAhead: 20,
      status: PAYMENT_MILESTONE_STATUS.PENDING,
    },
    {
      title: 'Roll-out complete',
      amount: '180000.00',
      dueDaysAhead: 60,
      status: PAYMENT_MILESTONE_STATUS.PENDING,
    },
  ];
  for (const [index, payment] of payments.entries()) {
    const existing = await prisma.paymentMilestone.findFirst({
      where: { contractId: contracts.acmeProject.id, title: payment.title },
    });
    const data = {
      contractId: contracts.acmeProject.id,
      title: payment.title,
      amount: payment.amount,
      currency: 'INR',
      dueDate: dayOffset(payment.dueDaysAhead),
      status: payment.status,
      invoiceReference:
        payment.status === PAYMENT_MILESTONE_STATUS.PENDING ? null : `INV-2026-${100 + index}`,
      paidAt: payment.status === PAYMENT_MILESTONE_STATUS.PAID ? dayOffset(-40) : null,
      sortOrder: index,
    };
    if (existing) {
      await prisma.paymentMilestone.update({ where: { id: existing.id }, data });
    } else {
      await prisma.paymentMilestone.create({ data });
    }
  }
}
