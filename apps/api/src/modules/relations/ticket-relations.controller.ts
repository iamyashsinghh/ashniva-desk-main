import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type TicketRelationCandidatesResponse,
  type TicketRelationsResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateTicketRelationDto } from './dto/relation.dto';
import { TicketRelationCandidatesService } from './ticket-relation-candidates.service';
import { TicketRelationsService } from './ticket-relations.service';

/**
 * Duplicate and related tickets.
 *
 * Reading is `ticket:read`, which every client role holds, because a client should see that their
 * own two reports are the same thing. The service is what keeps that safe: a client is only ever
 * shown a link whose far end is their own organization's, and the database says the same thing
 * again in `ticket_relations`' row-level policy.
 *
 * Writing is `ticket:triage`, the permission that already gates converting a ticket and cancelling
 * one as a duplicate. It is not in CLIENT_SAFE_PERMISSIONS, so no client role can hold it; the
 * service asserts an internal actor anyway rather than relying on that list staying as it is.
 */
@ApiTags('Ticket relations')
@ApiBearerAuth()
@Controller('tickets')
export class TicketRelationsController {
  constructor(
    private readonly relations: TicketRelationsService,
    private readonly candidates: TicketRelationCandidatesService,
  ) {}

  @Get(':id/relations')
  @RequirePermissions(PERMISSIONS.TICKET_READ)
  @ApiOperation({
    summary: 'Duplicates and related tickets, filtered to what the caller may open',
    description:
      'A link whose far end the caller cannot read comes back with no id and no title, and for a client it does not come back at all.',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketRelationsResponse> {
    return this.relations.list(actor, id);
  }

  @Get(':id/relations/candidates')
  @RequirePermissions(PERMISSIONS.TICKET_TRIAGE)
  @ApiOperation({
    summary: 'Likely duplicates for the link dialog, ranked, with the reasons for each',
    description:
      'The same fingerprint and keyword matcher the recurring-issues package uses; nothing new is computed.',
  })
  candidatesFor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TicketRelationCandidatesResponse> {
    return this.candidates.candidates(actor, id);
  }

  @Post(':id/relations')
  @RequirePermissions(PERMISSIONS.TICKET_TRIAGE)
  @ApiOperation({
    summary: 'Link this ticket to another as a duplicate or a related ticket',
    description:
      'A duplicate is a pointer plus a status: nothing is moved, merged or deleted on either ticket.',
  })
  link(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketRelationDto,
  ): Promise<TicketRelationsResponse> {
    return this.relations.link(actor, id, dto);
  }

  @Delete(':id/relations/:relationId')
  @RequirePermissions(PERMISSIONS.TICKET_TRIAGE)
  @ApiOperation({
    summary: 'Remove a link',
    description:
      'Deletes the pointer and nothing else. A duplicate that was closed stays closed; the audit entry says so.',
  })
  unlink(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('relationId', ParseUUIDPipe) relationId: string,
  ): Promise<TicketRelationsResponse> {
    return this.relations.unlink(actor, id, relationId);
  }
}
