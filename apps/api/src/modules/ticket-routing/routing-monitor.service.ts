import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { RoutingEscalationService } from './routing-escalation.service';
import { TicketRoutingRepository } from './ticket-routing.repository';

export interface RoutingMonitorResult {
  acknowledgementsOverdue: number;
  escalated: number;
}

/** One sweep never touches more than this, so a backlog is worked through rather than swallowed. */
const BATCH = 50;

/**
 * The two timers, swept.
 *
 * Runs as the system rather than as a tenant: the sweep crosses every organization, and the
 * row-level policies pass when `app_tenant_id()` is null precisely so background work like this
 * can see what it has to.
 *
 * Every ticket is handled in its own try/catch. One project with a broken configuration must not
 * stop the sweep from reaching the next one — the failure mode that would otherwise strand every
 * ticket behind the first bad row.
 */
@Injectable()
export class RoutingMonitorService {
  constructor(
    private readonly routing: TicketRoutingRepository,
    private readonly escalation: RoutingEscalationService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RoutingMonitorService.name);
  }

  run(now = new Date()): Promise<RoutingMonitorResult> {
    return this.tenantContext.runAsSystem(() => this.sweep(now));
  }

  private async sweep(now: Date): Promise<RoutingMonitorResult> {
    const result: RoutingMonitorResult = { acknowledgementsOverdue: 0, escalated: 0 };

    for (const state of await this.routing.dueForAcknowledgement(now, BATCH)) {
      try {
        const outcome = await this.escalation.onAcknowledgementOverdue(
          state.organizationId,
          state.ticketId,
          now,
        );
        if (outcome !== 'skipped') {
          result.acknowledgementsOverdue += 1;
        }
      } catch (error) {
        this.logger.warn({ err: error, ticketId: state.ticketId }, 'Acknowledgement sweep failed');
      }
    }

    for (const state of await this.routing.dueForEscalation(now, BATCH)) {
      try {
        const row = await this.escalation.escalate(
          state.organizationId,
          state.ticketId,
          'Not resolved within the escalation window',
          now,
        );
        if (row) {
          result.escalated += 1;
        }
      } catch (error) {
        this.logger.warn({ err: error, ticketId: state.ticketId }, 'Escalation sweep failed');
      }
    }

    return result;
  }
}
