import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type IvrPolicySummary,
  type IvrReadiness,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SaveIvrPolicyDto } from './dto/ivr-policy.dto';
import { IvrConnectionService } from './ivr-connection.service';
import { IVR_PROVIDER, type IvrProvider } from './ivr-provider.interface';
import { IvrPolicyService } from './ivr-policy.service';

/**
 * Configuring how a product's support calls work.
 *
 * One gate throughout: `ivr:manage`. Reading a policy is as privileged as writing it, because the
 * policy says who may listen to recordings — a list of who can hear a client's voice is not
 * something to hand to everybody who can read a product page.
 */
@ApiTags('IVR')
@ApiBearerAuth()
@Controller()
export class IvrController {
  constructor(
    private readonly policies: IvrPolicyService,
    private readonly connections: IvrConnectionService,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {}

  @Get('products/:id/ivr-policy')
  @RequirePermissions(PERMISSIONS.IVR_MANAGE)
  @ApiOperation({ summary: "A product's calling and recording policy" })
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IvrPolicySummary> {
    return this.policies.read(actor, id);
  }

  @Put('products/:id/ivr-policy')
  @RequirePermissions(PERMISSIONS.IVR_MANAGE)
  @ApiOperation({ summary: "Change a product's calling and recording policy (audited)" })
  save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveIvrPolicyDto,
  ): Promise<IvrPolicySummary> {
    return this.policies.save(actor, id, dto);
  }

  /**
   * The adapter's readiness, for this caller's organization.
   *
   * Scoped to the caller's own connection rather than to the installation: whether an IVR works is
   * a per-tenant fact, and an administrator asking why their calls do not connect wants the answer
   * about their account, not about somebody else's.
   */
  @Get('ivr/health')
  @RequirePermissions(PERMISSIONS.IVR_MANAGE)
  @ApiOperation({
    summary: 'Whether the configured IVR adapter can place a call, and what is missing',
  })
  async health(@CurrentUser() actor: AuthenticatedUser): Promise<IvrReadiness> {
    const account = await this.connections.account(actor.organizationId);
    const result = await this.provider.readiness(account);
    return { provider: this.provider.key, ...result };
  }
}
