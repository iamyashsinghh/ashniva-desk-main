import type { Prisma } from '../../generated/prisma/client';
import type { SlaClockInputs } from './sla-clock';

/** What the engine needs to know about a ticket to start or recompute its clocks. */
export interface TicketForSla {
  id: string;
  organizationId: string;
  clientOrganizationId: string;
  projectId: string | null;
  priority: string;
  status: string;
  /**
   * The product this ticket came from, for its support tier.
   *
   * Optional because most tickets have none — a portal ticket was raised by a person, not by a
   * registered product — and a ticket without one keeps exactly the policy precedence it had
   * before tiers existed.
   */
  product?: { supportTier: string } | null;
}

export const slaRowInclude = {
  policy: { include: { rules: true } },
  ticket: {
    select: {
      id: true,
      number: true,
      organizationId: true,
      clientOrganizationId: true,
      projectId: true,
      priority: true,
      status: true,
      product: { select: { supportTier: true } },
    },
  },
} satisfies Prisma.TicketSlaInclude;

export type TicketSlaRow = Prisma.TicketSlaGetPayload<{ include: typeof slaRowInclude }>;
export type SlaPolicyWithRules = TicketSlaRow['policy'];
export type SlaRule = SlaPolicyWithRules['rules'][number];

export function slaInputs(policy: SlaPolicyWithRules, rule: SlaRule): SlaClockInputs {
  return {
    calendar: policy,
    warningPercent: policy.warningPercent,
    firstResponseMinutes: rule.firstResponseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
  };
}

/** The rule that applies to the row's ticket at its current priority. */
export function ruleFor(row: TicketSlaRow): SlaRule | undefined {
  return row.policy.rules.find((entry) => entry.priority === row.ticket.priority);
}
