import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type ProductCallbackEndpointSummary,
  type ProductCallbackEndpointWithSecret,
  type SupportCallbackDeliverySummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CallbackEndpointsService } from './callback-endpoints.service';
import { CallbackRedeliveryService } from './callback-redelivery.service';
import { CallbackDeliveryQueryDto, UpsertCallbackEndpointDto } from './dto/support-callback.dto';

/**
 * Where a product's status callbacks go, and what happened to them.
 *
 * Configuring the endpoint needs `product:manage`, which does not leave Super Admin and Project
 * Manager: a callback URL is a standing instruction to post ticket data to somebody else's server,
 * which is closer to issuing a credential than to editing a setting. Reading the delivery log
 * needs only `product:read`, because "did the customer get told" is ordinary support context.
 */
@ApiTags('Support callbacks')
@ApiBearerAuth()
@Controller('products/:id/callbacks')
export class SupportCallbacksController {
  constructor(
    private readonly endpoints: CallbackEndpointsService,
    private readonly redelivery: CallbackRedeliveryService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'The callback endpoint, or null — never its signing secret' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductCallbackEndpointSummary | null> {
    return this.endpoints.get(actor, id);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({
    summary: 'Configure the callback endpoint',
    description:
      'The signing secret is returned only when the endpoint is first created, and is shown ' +
      'once. Editing a URL or a subscription never returns it; rotate it deliberately instead.',
  })
  upsert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCallbackEndpointDto,
  ): Promise<ProductCallbackEndpointWithSecret | { endpoint: ProductCallbackEndpointSummary }> {
    return this.endpoints.upsert(actor, id, dto);
  }

  @Post('secret')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Replace the signing secret. Shown once and never again.' })
  rotate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductCallbackEndpointWithSecret> {
    return this.endpoints.rotateSecret(actor, id);
  }

  @Get('deliveries')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'What was sent, when, and how the endpoint answered' })
  deliveries(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CallbackDeliveryQueryDto,
  ): Promise<SupportCallbackDeliverySummary[]> {
    return this.endpoints.history(actor, id, query);
  }

  @Post('deliveries/:deliveryId/redeliver')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({
    summary: 'Send a settled delivery again, with the same delivery id',
    description:
      'The receiver is expected to deduplicate on X-Ashniva-Delivery, so a redelivery of an ' +
      'event it already processed is a no-op on its side.',
  })
  redeliver(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<SupportCallbackDeliverySummary> {
    return this.redelivery.redeliver(actor, deliveryId);
  }
}
