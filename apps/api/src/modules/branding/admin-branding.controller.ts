import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AdminBrandingView,
  type AuthenticatedUser,
  type ThemeSourceReadiness,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AdminBrandingService } from './admin-branding.service';
import { BrandingService } from './branding.service';
import { parseBrandingUpdate, UpdateBrandingDto } from './dto/branding-update.dto';

/**
 * Editing the branding of the signed-in user's own organization.
 *
 * There is no organization parameter on any route here. An administrator changes their own
 * tenant's theme, and there is nothing they could send to change somebody else's — the tenant
 * boundary is the shape of the endpoint rather than a check inside it.
 */
@ApiTags('Branding')
@ApiBearerAuth()
@Controller('admin/branding')
export class AdminBrandingController {
  constructor(
    private readonly admin: AdminBrandingService,
    private readonly branding: BrandingService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({
    summary: 'The effective branding, this tenant’s overrides, and the theme source',
  })
  view(@CurrentUser() actor: AuthenticatedUser): Promise<AdminBrandingView> {
    return this.admin.view(actor);
  }

  /**
   * The body is `unknown` rather than a DTO class, and is parsed by the shared Zod schema.
   *
   * A theme document is a nested, discriminated shape whose *values* are the security boundary —
   * a colour must be a colour and a length must be a length, because both end up in a CSS custom
   * property. Class-validator would need that rule restated per field, and the global
   * `forbidNonWhitelisted` pipe would reject the nested document before the rule ran. One schema
   * in `packages/types`, applied identically to an administrator's edit and to a Theme Manager's
   * response, is the only version of this that cannot drift.
   */
  @Patch()
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiBody({ type: UpdateBrandingDto })
  @ApiOperation({
    summary: 'Change the product name, logo or theme tokens. Audited.',
    description:
      'Every field is optional; an absent field is left alone and a null logo field clears it. ' +
      'A logo is uploaded through POST /files and referenced here by id — there is no second ' +
      'upload path.',
  })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AdminBrandingView> {
    return this.admin.update(actor, parseBrandingUpdate(body));
  }

  /**
   * What the configured theme source can do, and what it still needs.
   *
   * Deliberately here rather than in `GET /health`. Desk is required to work when the Theme
   * Manager is unreachable, and a component that cannot make the product unhealthy has no
   * business in a readiness probe that a load balancer acts on — a theme outage would start
   * taking API instances out of rotation. See `docs/theme-manager-integration.md`.
   */
  @Get('theme-source')
  @RequirePermissions(PERMISSIONS.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Readiness of the configured theme source, and what it is missing' })
  themeSource(@CurrentUser() actor: AuthenticatedUser): Promise<ThemeSourceReadiness> {
    return this.branding.themeSourceReadiness(actor.organizationId);
  }
}
