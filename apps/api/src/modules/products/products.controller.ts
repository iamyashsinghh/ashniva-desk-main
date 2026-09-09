import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CreatedProductCredential,
  type ProductCredentialSummary,
  type ProductDetail,
  type ProductSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateProductDto, IssueCredentialDto, UpdateProductDto } from './dto/product.dto';
import { ProductCredentialsService } from './product-credentials.service';
import { ProductsService } from './products.service';

/**
 * Administering the registry.
 *
 * Reading needs `product:read`, which a team lead and a support executive hold — knowing which
 * product a ticket came from is ordinary support context. Changing anything, and issuing
 * credentials, needs `product:manage`, which does not leave Super Admin and Project Manager: a
 * machine credential is a standing key into ticket creation, and handing one out is closer to
 * adding a user than to editing a setting.
 */
@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly credentials: ProductCredentialsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Registered products and their support settings' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<ProductSummary[]> {
    return this.products.list(actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'One product, with its credentials — never their secrets' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductDetail> {
    return this.products.get(actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Register a product' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductDetail> {
    return this.products.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Change a product’s project link, support switches or ticket defaults' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    return this.products.update(actor, id, dto);
  }

  /**
   * Issues a credential and returns its secret — the only response in the product that ever
   * carries one. There is no endpoint to read it back, because the stored form is a hash.
   */
  @Post(':id/credentials')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({
    summary: 'Issue a machine credential. The secret is shown once and never again.',
  })
  issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueCredentialDto,
  ): Promise<CreatedProductCredential> {
    return this.credentials.issue(actor, id, dto.label);
  }

  @Post(':id/credentials/:credentialId/rotate')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({ summary: 'Replace a credential’s secret and key id, keeping its place' })
  rotate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<CreatedProductCredential> {
    return this.credentials.rotate(actor, id, credentialId);
  }

  @Delete(':id/credentials/:credentialId')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @ApiOperation({
    summary: 'Revoke a credential. It stops working immediately and stays on record.',
  })
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<ProductCredentialSummary> {
    return this.credentials.revoke(actor, id, credentialId);
  }
}
