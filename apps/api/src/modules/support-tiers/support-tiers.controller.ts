import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ALL_SUPPORT_TIERS,
  PERMISSIONS,
  type AuthenticatedUser,
  type SupportTier,
  type SupportTierPolicySummary,
} from '@ashniva/types';
import { BadRequestException } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { UpdateSupportTierPolicyDto } from './dto/support-tier.dto';
import { SupportTiersService } from './support-tiers.service';

/**
 * What each support tier entitles a product to.
 *
 * Reading needs `product:read` — a support executive looking at a PRIORITY ticket has a reason to
 * know what PRIORITY promises. Changing it needs `support-tier:manage`, which is its own key
 * rather than `product:manage`: registering a product is an operational act, while deciding what a
 * tier is worth is a commercial one, and the two are not the same job.
 */
@ApiTags('Support tiers')
@ApiBearerAuth()
@Controller('support-tiers')
export class SupportTiersController {
  constructor(private readonly tiers: SupportTiersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Every tier, configured or running on the neutral defaults' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<SupportTierPolicySummary[]> {
    return this.tiers.list(actor);
  }

  @Put(':tier')
  @RequirePermissions(PERMISSIONS.SUPPORT_TIER_MANAGE)
  @ApiOperation({ summary: 'Set what one tier entitles a product to' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('tier') tier: string,
    @Body() dto: UpdateSupportTierPolicyDto,
  ): Promise<SupportTierPolicySummary> {
    return this.tiers.update(actor, assertTier(tier), dto);
  }
}

/** A path parameter is a caller's string until something checks it against the enum. */
function assertTier(value: string): SupportTier {
  const tier = ALL_SUPPORT_TIERS.find((entry) => entry === value.toUpperCase());
  if (!tier) {
    throw new BadRequestException(`Unknown support tier ${value}`);
  }
  return tier;
}
