import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type PortalClientUpdate,
  type CommentSummary,
  type FileSummary,
  type PaginatedResponse,
  type PortalHome,
  type PortalProjectDetail,
  type PortalProjectPlan,
  type PortalProjectProgress,
  type PortalProjectSummary,
  type PortalTicketDetail,
  type PortalTicketSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateTicketDto,
  ListTicketsQueryDto,
  ReopenTicketDto,
  TicketCommentDto,
} from '../tickets/dto/ticket.dto';
import { PortalUpdatesQueryDto } from './dto/portal.dto';
import { PortalPlanService } from './portal-plan.service';
import { PortalProgressService } from './portal-progress.service';
import { PortalTicketsService } from './portal-tickets.service';
import { PortalService } from './portal.service';

/** Client portal: only the caller's organization, only client-visible data. */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly portalTickets: PortalTicketsService,
    private readonly portalProgress: PortalProgressService,
    private readonly portalPlan: PortalPlanService,
  ) {}

  @Get('home')
  @ApiOperation({ summary: 'Client overview: KPIs, projects, published updates, open tickets' })
  home(@CurrentUser() actor: AuthenticatedUser): Promise<PortalHome> {
    return this.portal.home(actor);
  }

  @Get('projects')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Your projects with progress' })
  projects(@CurrentUser() actor: AuthenticatedUser): Promise<PortalProjectSummary[]> {
    return this.portal.listProjects(actor);
  }

  @Get('projects/:id')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'One project: visible tasks, published updates, shared files' })
  project(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalProjectDetail> {
    return this.portal.getProject(actor, id);
  }

  /**
   * Its own route rather than more fields on `projects/:id`, which already pulls a hundred tasks,
   * fifty updates and every project file before this page's reads would start.
   */
  @Get('projects/:id/progress')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'What the team did today on this project, and what is next' })
  progress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalProjectProgress> {
    return this.portalProgress.forProject(actor, id);
  }

  @Get('projects/:id/plan')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'The milestones you were shown, on a calendar, with their progress' })
  plan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalProjectPlan> {
    return this.portalPlan.forProject(actor, id);
  }

  @Get('updates')
  @ApiOperation({ summary: 'Published updates (completed today / this week)' })
  updates(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PortalUpdatesQueryDto,
  ): Promise<PortalClientUpdate[]> {
    return this.portal.listUpdates(actor, query.from, query.to);
  }

  @Get('files')
  @ApiOperation({ summary: 'Files shared with your organization' })
  files(@CurrentUser() actor: AuthenticatedUser): Promise<FileSummary[]> {
    return this.portal.listFiles(actor);
  }

  @Get('tickets')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Your organization’s tickets' })
  tickets(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
  ): Promise<PaginatedResponse<PortalTicketSummary>> {
    return this.portalTickets.list(actor, query);
  }

  @Post('tickets')
  @RequirePermissions(PERMISSIONS.TICKET_RAISE)
  @ApiOperation({ summary: 'Raise a ticket' })
  raise(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<PortalTicketDetail> {
    return this.portalTickets.raise(actor, dto);
  }

  @Get('tickets/:id')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Ticket with its public thread' })
  ticket(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalTicketDetail> {
    return this.portalTickets.get(actor, id);
  }

  @Post('tickets/:id/reply')
  @RequirePermissions(PERMISSIONS.TICKET_REPLY_PUBLIC)
  @ApiOperation({ summary: 'Reply on the public thread' })
  reply(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketCommentDto,
  ): Promise<CommentSummary> {
    return this.portalTickets.reply(actor, id, dto);
  }

  @Post('tickets/:id/close')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Confirm the resolution and close the ticket' })
  close(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalTicketDetail> {
    return this.portalTickets.close(actor, id);
  }

  @Post('tickets/:id/reopen')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({ summary: 'Reopen a resolved or closed ticket' })
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenTicketDto,
  ): Promise<PortalTicketDetail> {
    return this.portalTickets.reopen(actor, id, dto.reason);
  }
}
