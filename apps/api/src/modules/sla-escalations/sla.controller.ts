import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type SlaEventSummary,
  type SlaPolicySummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../database/prisma.service';
import { CreateSlaPolicyDto, UpdateSlaPolicyDto } from './dto/sla-policy.dto';
import { SlaMonitorService, type SlaMonitorResult } from './sla-monitor.service';
import { SlaPoliciesService } from './sla-policies.service';
import { TicketSlaService } from './ticket-sla.service';

@ApiTags('SLA')
@ApiBearerAuth()
@Controller('sla')
export class SlaController {
  constructor(
    private readonly policies: SlaPoliciesService,
    private readonly ticketSla: TicketSlaService,
    private readonly monitor: SlaMonitorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The policy catalogue is an administrative list, not ticket data. `ticket:read` is held by
   * every internal role and by every client role, so gating on it meant the whole of the
   * provider's SLA commitments — per client, per project — was readable by anyone who could open
   * a ticket. The screen that shows this list is behind `sla:manage`; so is the list.
   */
  @Get('policies')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @ApiOperation({ summary: 'SLA policies: default, per client, per project, with their rules' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<SlaPolicySummary[]> {
    return this.policies.list(actor);
  }

  @Post('policies')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @ApiOperation({ summary: 'Create a policy (re-applies to open tickets)' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSlaPolicyDto,
  ): Promise<SlaPolicySummary> {
    return this.policies.create(actor, dto);
  }

  @Get('policies/:id')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @ApiOperation({ summary: 'One policy' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SlaPolicySummary> {
    return this.policies.get(actor, id);
  }

  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @ApiOperation({ summary: 'Edit a policy (re-applies to open tickets)' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSlaPolicyDto,
  ): Promise<SlaPolicySummary> {
    return this.policies.update(actor, id, dto);
  }

  @Delete('policies/:id')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a policy; its open tickets fall back to the next matching one' })
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.policies.remove(actor, id);
  }

  @Get('tickets/:ticketId/events')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'SLA history of a ticket (started, paused, warnings, breaches, met)' })
  async events(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<SlaEventSummary[]> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException(
        'SLA history is internal; the portal shows the resolution target',
      );
    }
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!ticket) {
      throw new ForbiddenException('Ticket not found');
    }
    return this.ticketSla.eventsFor(ticketId);
  }

  @Post('monitor/run')
  @RequirePermissions(PERMISSIONS.SLA_MANAGE)
  @ApiOperation({ summary: 'Run the SLA monitor now (the queue runs it every two minutes)' })
  runMonitor(): Promise<SlaMonitorResult> {
    return this.monitor.run();
  }
}
