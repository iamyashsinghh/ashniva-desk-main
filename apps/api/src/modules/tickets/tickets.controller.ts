import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CommentSummary,
  type PaginatedResponse,
  type TicketDetail,
  type TicketSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AssignTicketDto,
  ConvertTicketDto,
  CreateTicketDto,
  ListTicketsQueryDto,
  ReopenTicketDto,
  ResolveTicketDto,
  TicketCommentDto,
  TicketNoteDto,
} from './dto/ticket.dto';
import { TicketTransitionsService } from './ticket-transitions.service';
import { TicketsService } from './tickets.service';

/** Internal ticket desk. Clients use /portal/tickets, which maps to the same services. */
@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly transitions: TicketTransitionsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({
    summary: 'Ticket list by view (open, new, mine, waiting, critical, resolved, all)',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
  ): Promise<PaginatedResponse<TicketSummary>> {
    return this.tickets.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TICKET_RAISE)
  @ApiOperation({ summary: 'Raise a ticket (staff may raise on behalf of a client)' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketDetail> {
    return this.tickets.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({
    summary: 'Ticket detail with thread, notes, linked tasks, files and allowed actions',
  })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketDetail> {
    return this.tickets.get(actor, id);
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Public reply (visible to the client) or internal note' })
  comment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketCommentDto,
  ): Promise<CommentSummary> {
    return this.tickets.addComment(actor, id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Assign / reassign, optionally setting team, type and priority' })
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
  ): Promise<TicketDetail> {
    return this.transitions.assign(actor, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Start working on the ticket' })
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketNoteDto,
  ): Promise<TicketDetail> {
    return this.transitions.start(actor, id, dto.note);
  }

  @Post(':id/wait-client')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Mark as waiting for the client' })
  waitClient(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketNoteDto,
  ): Promise<TicketDetail> {
    return this.transitions.waitForClient(actor, id, dto.note);
  }

  @Post(':id/resume')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Back in progress after the client answered' })
  resume(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketNoteDto,
  ): Promise<TicketDetail> {
    return this.transitions.resume(actor, id, dto.note);
  }

  @Post(':id/review')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Fix ready: under review / testing' })
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketNoteDto,
  ): Promise<TicketDetail> {
    return this.transitions.review(actor, id, dto.note);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Resolve with a resolution the client will read' })
  resolve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveTicketDto,
  ): Promise<TicketDetail> {
    return this.transitions.resolve(actor, id, dto.resolution);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Close a resolved ticket' })
  close(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketNoteDto,
  ): Promise<TicketDetail> {
    return this.transitions.close(actor, id, dto.note);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Reopen a resolved or closed ticket' })
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTicketDto,
  ): Promise<TicketDetail> {
    return this.transitions.reopen(actor, id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.TICKET_TRIAGE)
  @ApiOperation({ summary: 'Cancel a ticket (duplicate, invalid)' })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTicketDto,
  ): Promise<TicketDetail> {
    return this.transitions.cancel(actor, id, dto.reason);
  }

  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.TICKET_TRIAGE)
  @ApiOperation({ summary: 'Convert the ticket into one or more linked tasks' })
  convert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertTicketDto,
  ): Promise<TicketDetail> {
    return this.transitions.convert(actor, id, dto);
  }
}
