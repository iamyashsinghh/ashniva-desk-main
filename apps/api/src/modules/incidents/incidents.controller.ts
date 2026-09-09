import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type IncidentDetail,
  type IncidentSummary,
  type PaginatedResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AddIncidentLinkDto,
  AddIncidentNoteDto,
  CloseIncidentDto,
  CreateIncidentDto,
  EmergencyFixDecisionDto,
  EmergencyFixRequestDto,
  ListIncidentsQueryDto,
  PublishClientSummaryDto,
  ResolveIncidentDto,
  UpdateIncidentDto,
} from './dto/incident.dto';
import { EmergencyFixService } from './emergency-fix.service';
import { IncidentActionsService } from './incident-actions.service';
import { IncidentsService } from './incidents.service';

type Actor = AuthenticatedUser;
const id = () => Param('id', ParseUUIDPipe);

/**
 * Incidents are internal end to end: they name what broke, who was affected, which release did it
 * and what was tried. There is no portal counterpart to this controller. The single thing a
 * client may ever be told is the client summary, and publishing it is its own deliberate action.
 */
@ApiTags('Incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly actions: IncidentActionsService,
    private readonly emergencyFix: EmergencyFixService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INCIDENT_READ)
  @ApiOperation({ summary: 'Incidents, filterable by status, project, problem and owner' })
  list(
    @CurrentUser() actor: Actor,
    @Query() query: ListIncidentsQueryDto,
  ): Promise<PaginatedResponse<IncidentSummary>> {
    return this.incidents.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Open an incident (something is broken right now)' })
  create(@CurrentUser() actor: Actor, @Body() dto: CreateIncidentDto): Promise<IncidentDetail> {
    return this.incidents.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INCIDENT_READ)
  @ApiOperation({ summary: 'Detail with the timeline, the links and the emergency-fix state' })
  get(@CurrentUser() actor: Actor, @id() incidentId: string): Promise<IncidentDetail> {
    return this.incidents.get(actor, incidentId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({
    summary: 'Edit an incident and move it through the working statuses',
    description:
      'Saving a client summary here stores a draft; it reaches nobody until publish-client-summary.',
  })
  update(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentDetail> {
    return this.incidents.update(actor, incidentId, dto);
  }

  @Post(':id/request-emergency-fix')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Ask to ship outside the release process, with a reason. Once only.' })
  requestEmergencyFix(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: EmergencyFixRequestDto,
  ): Promise<IncidentDetail> {
    return this.emergencyFix.request(actor, incidentId, dto);
  }

  @Post(':id/approve-emergency-fix')
  @RequirePermissions(PERMISSIONS.INCIDENT_APPROVE_EMERGENCY_FIX)
  @ApiOperation({
    summary: 'Approve or refuse an emergency fix',
    description:
      'A reason is required either way: an approval nobody explained is the record a later review cannot use.',
  })
  decideEmergencyFix(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: EmergencyFixDecisionDto,
  ): Promise<IncidentDetail> {
    return this.emergencyFix.decide(actor, incidentId, dto);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'The impact ended; record what stopped it' })
  resolve(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: ResolveIncidentDto,
  ): Promise<IncidentDetail> {
    return this.actions.resolve(actor, incidentId, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'The follow-up is done; reopening is a new incident' })
  close(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: CloseIncidentDto,
  ): Promise<IncidentDetail> {
    return this.actions.close(actor, incidentId, dto);
  }

  @Post(':id/links')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Link a ticket, a task or a release to the incident' })
  addLink(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: AddIncidentLinkDto,
  ): Promise<IncidentDetail> {
    return this.actions.addLink(actor, incidentId, dto);
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Append a note to the timeline' })
  addNote(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: AddIncidentNoteDto,
  ): Promise<IncidentDetail> {
    return this.actions.addNote(actor, incidentId, dto);
  }

  @Post(':id/publish-client-summary')
  @RequirePermissions(PERMISSIONS.INCIDENT_MANAGE)
  @ApiOperation({
    summary: 'Publish what clients may be told',
    description: 'Never automatic. Records who published it, when, and the exact wording.',
  })
  publishClientSummary(
    @CurrentUser() actor: Actor,
    @id() incidentId: string,
    @Body() dto: PublishClientSummaryDto,
  ): Promise<IncidentDetail> {
    return this.actions.publishClientSummary(actor, incidentId, dto);
  }
}
