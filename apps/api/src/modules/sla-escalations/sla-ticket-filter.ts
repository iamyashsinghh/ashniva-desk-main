import { OPEN_TICKET_STATUSES } from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

export type SlaRisk = 'at-risk' | 'breached';

/**
 * Open tickets whose SLA clock is past its warning (at-risk) or due (breached) time.
 *
 * Judged from the stored instants rather than the stored status, so the answer is right between
 * monitor runs. The dashboard KPI and the ticket list view both call this, so the number on the
 * card and the list it links to can never drift apart.
 */
export function slaTicketWhere(kind: SlaRisk, now = new Date()): Prisma.TicketWhereInput {
  const field = kind === 'breached' ? 'DueAt' : 'WarnAt';
  return {
    status: { in: [...OPEN_TICKET_STATUSES] },
    sla: {
      pausedAt: null,
      OR: [
        { firstResponseAt: null, [`firstResponse${field}`]: { lte: now } },
        { resolvedAt: null, [`resolution${field}`]: { lte: now } },
      ],
    },
  };
}
