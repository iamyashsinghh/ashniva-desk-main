import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Branding } from '@ashniva/types';

import { Public } from '../../common/decorators/public.decorator';
import { AdminBrandingService } from './admin-branding.service';
import { BrandingService } from './branding.service';
import { BrandingQueryDto } from './dto/branding-query.dto';
import { BrandingResponseDto } from './dto/branding-response.dto';

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(
    private readonly brandingService: BrandingService,
    private readonly admin: AdminBrandingService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Product name, logo and the theme document for the sign-in page and app shell',
  })
  @ApiOkResponse({ type: BrandingResponseDto })
  getBranding(@Query() query: BrandingQueryDto): Promise<Branding> {
    return this.brandingService.getBranding(query.organization);
  }

  /**
   * The uploaded logo, for the sign-in page.
   *
   * Public because the page that needs it is: an unauthenticated browser cannot carry a bearer
   * token to `/files/:id/download`. It takes no file id — only an organization slug, which is
   * already public — and serves whichever file that organization's own branding names. So this is
   * a way to see a tenant's logo and not a way to reach a tenant's attachments.
   */
  @Get('logo')
  @Public()
  @ApiOperation({ summary: 'The organization’s uploaded logo image' })
  async logo(@Query() query: BrandingQueryDto): Promise<StreamableFile> {
    const logo = await this.admin.logo(query.organization);
    return new StreamableFile(logo.stream, {
      type: logo.contentType,
      length: logo.sizeBytes,
    });
  }
}
