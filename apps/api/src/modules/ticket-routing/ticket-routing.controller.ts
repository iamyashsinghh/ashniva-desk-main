import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type TicketRoutingDetail,
  type UnassignedTicketSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReassignTicketDto, RerouteTicketDto } from './dto/ticket-routing.dto';
import { RoutingEscalationService } from './routing-escalation.service';
import { RoutingQueryService } from './routing-query.service';
import { TicketRoutingService } from './ticket-routing.service';

/**
 * Routing, from the outside.
 *
 * Three different gates, on purpose. Acknowledging needs no permission at all — it is the assignee
 * saying they have it, and the service checks that they *are* the assignee. Reassigning needs
 * `ticket:reassign`, which is the permission that already governs putting a ticket on somebody.
 * Everything that inspects or re-runs the router needs `support-routing:manage`, the same
 * permission that configures it in package 8a.
 */
@ApiTags('Support routing')
@ApiBearerAuth()
@Controller('tickets')
export class TicketRoutingController {
  constructor(
    private readonly routing: TicketRoutingService,
    private readonly escalation: RoutingEscalationService,
    private readonly queries: RoutingQueryService,
  ) {}

  @Get('queue/unassigned')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Open tickets nobody is working: unassigned or parked by the router' })
  queue(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<UnassignedTicketSummary[]> {
    const parsed = Number(limit);
    return this.queries.queue(
      actor,
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50,
    );
  }

  @Get(':id/routing')
  @ApiOperation({
    summary: 'How this ticket was routed. The candidate trail needs support-routing:manage.',
  })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketRoutingDetail> {
    return this.queries.detail(actor, id);
  }

  @Post(':id/route')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Run the router over this ticket again' })
  async reroute(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RerouteTicketDto,
  ): Promise<TicketRoutingDetail> {
    await this.routing.route(actor.organizationId, id, {
      actorId: actor.userId,
      force: dto.force ?? false,
      // Somebody pressed the button: that is a deliberate second pass, not a repeat of the
      // trigger that raised the ticket.
      mode: 'reroute',
    });
    return this.queries.detail(actor, id);
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @ApiOperation({ summary: 'The assignee confirming they have picked this up' })
  async acknowledge(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketRoutingDetail> {
    await this.routing.acknowledge(actor, id);
    return this.queries.detail(actor, id);
  }

  @Post(':id/reassign')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TICKET_REASSIGN)
  @ApiOperation({ summary: 'Assign by hand, overriding the router until somebody re-routes' })
  async reassign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignTicketDto,
  ): Promise<TicketRoutingDetail> {
    await this.escalation.reassign(actor, id, dto.assignedToId, dto.reason);
    return this.queries.detail(actor, id);
  }
}
