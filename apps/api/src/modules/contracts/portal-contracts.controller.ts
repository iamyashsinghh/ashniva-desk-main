import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type PortalContractDetail,
  type PortalContractSummary,
  type PortalMilestoneSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MilestonesService } from '../milestones/milestones.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { PortalMilestonesQueryDto } from './dto/portal-contracts.dto';
import { PortalContractsService } from './portal-contracts.service';

/** Client portal: the client's own contracts and client-visible milestones, allow-listed. */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal')
export class PortalContractsController {
  constructor(
    private readonly contracts: PortalContractsService,
    private readonly milestones: MilestonesService,
    private readonly organizations: OrganizationsRepository,
  ) {}

  @Get('contracts')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Your organization’s contracts with remaining hours' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<PortalContractSummary[]> {
    return this.contracts.list(actor);
  }

  @Get('contracts/:id')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({
    summary: 'One contract: scope, client notes, client-visible milestones and documents',
  })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalContractDetail> {
    return this.contracts.get(actor, id);
  }

  @Get('milestones')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Client-visible milestones of your projects' })
  async milestonesForPortal(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PortalMilestonesQueryDto,
  ): Promise<PortalMilestoneSummary[]> {
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      return [];
    }
    return this.milestones.listForPortal(actor, provider.id, query.projectId);
  }
}
