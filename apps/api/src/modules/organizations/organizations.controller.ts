import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type OrganizationOption,
  type OrganizationSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /**
   * The administrative list, with each client's user, project and open-ticket counts. That is the
   * Companies & clients screen and nothing else, so it asks for the permission that screen asks
   * for. Every picker and filter in the product uses `/organizations/options` instead.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Companies and clients with their counts (administration)' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<OrganizationSummary[]> {
    return this.organizations.list(actor);
  }

  /**
   * Names for a company picker, and only names.
   *
   * A ticket's "on behalf of", a contract's client, a report filter and the invoice editor all
   * need this list, and they are held by different jobs, so the floor is what all of them already
   * have: reading a project, or raising a ticket for an internal employee who has neither.
   */
  @Get('options')
  @RequireAnyPermission(PERMISSIONS.PROJECT_READ, PERMISSIONS.TICKET_RAISE)
  @ApiOperation({ summary: 'Companies you may pick from: id and name only' })
  options(@CurrentUser() actor: AuthenticatedUser): Promise<OrganizationOption[]> {
    return this.organizations.options(actor);
  }

  /**
   * No decorator, because this route answers two different callers.
   *
   * A client reads their own company here and must keep getting 404 — not 403 — for anybody
   * else's id, so that ids cannot be probed; a decorator would answer 403 for every id including
   * their own. Internal staff need `organization:manage` for the same counts the list carries,
   * and the service applies it.
   */
  @Get(':id')
  @ApiOperation({ summary: 'One organization with user, project and open-ticket counts' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrganizationSummary> {
    return this.organizations.get(actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Create a group company or client organization' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizations.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Edit an organization' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationSummary> {
    return this.organizations.update(actor, id, dto);
  }
}
