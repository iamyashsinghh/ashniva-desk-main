import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ClientBillingProfile } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import { toClientBillingProfile } from './billing.mapper';
import { ClientBillingProfileService } from './client-billing-profile.service';
import { SaveClientBillingProfileDto } from './dto/billing.dto';

/**
 * Who the invoice is *to*: the provider's record of each client's billing particulars.
 *
 * Deliberately not reachable from the portal. This is the provider's record of how it invoices a
 * client, not the client's record of itself: `PortalBillingController` exposes no route here, the
 * permissions below are ones no client role holds, and the table's row-level-security policy
 * admits only a provider tenant reading its own rows. A client cannot change how it is billed.
 */
@ApiTags('Billing')
@ApiBearerAuth()
@Controller('settings/billing/clients')
export class ClientBillingController {
  constructor(private readonly profiles: ClientBillingProfileService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Billing particulars recorded for each client' })
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<ClientBillingProfile[]> {
    return (await this.profiles.list(actor)).map(toClientBillingProfile);
  }

  @Get(':clientOrganizationId')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'One client’s billing particulars' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('clientOrganizationId', ParseUUIDPipe) clientOrganizationId: string,
  ): Promise<ClientBillingProfile> {
    const row = await this.profiles.get(actor, clientOrganizationId);
    if (!row) {
      throw new NotFoundException('No billing particulars have been recorded for this client');
    }
    return toClientBillingProfile(row);
  }

  /**
   * The same permission and the same password prompt as the provider's own billing profile.
   *
   * These particulars are not the payee — they do not move money — but they are the recipient
   * name and GSTIN on a tax document, which decides whether the client can claim the input tax
   * credit, and they are edited from the same screen under the same permission. Guarding one card
   * of that screen and not the other would be an inconsistency someone has to remember. The
   * permission is held only by an administrator, so the prompt lands on a rare act.
   */
  @Put(':clientOrganizationId')
  @RequirePermissions(PERMISSIONS.BILLING_PROFILE_MANAGE)
  @RequireRecentAuth()
  @ApiOperation({
    summary: 'Record how a client is billed',
    description:
      'Frozen onto each invoice at issue, so a later correction does not change a document ' +
      'already sent. No tax setting lives here: the invoice’s place of supply decides that.',
  })
  async save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('clientOrganizationId', ParseUUIDPipe) clientOrganizationId: string,
    @Body() dto: SaveClientBillingProfileDto,
  ): Promise<ClientBillingProfile> {
    return toClientBillingProfile(await this.profiles.save(actor, clientOrganizationId, dto));
  }
}
