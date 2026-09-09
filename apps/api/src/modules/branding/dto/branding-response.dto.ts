import { ApiProperty } from '@nestjs/swagger';
import { DEFAULT_THEME_DOCUMENT, THEME_DOCUMENT_VERSION, type Branding } from '@ashniva/types';

export class BrandingColorsDto {
  @ApiProperty({ example: '#3b5fa0' })
  primary!: string;

  @ApiProperty({ example: '#1b1c1e' })
  secondary!: string;

  @ApiProperty({ example: '#1f6b43' })
  accent!: string;
}

/** Swagger model for GET /branding. The runtime shape is `Branding` from packages/types. */
export class BrandingResponseDto implements Branding {
  @ApiProperty({ example: 'Ashniva Desk' })
  productName!: string;

  @ApiProperty({
    example: 'AD',
    description: 'Text shown in the logo slot until a logo is uploaded',
  })
  logoText!: string;

  @ApiProperty({ nullable: true, example: null })
  logoUrl!: string | null;

  @ApiProperty({
    nullable: true,
    format: 'uuid',
    example: null,
    description: 'An uploaded logo; fetch it from GET /branding/logo, not from /files',
  })
  logoFileId!: string | null;

  @ApiProperty({ type: BrandingColorsDto })
  colors!: BrandingColorsDto;

  @ApiProperty({
    example: DEFAULT_THEME_DOCUMENT,
    description:
      `The complete token document, version ${THEME_DOCUMENT_VERSION}. Every token is present: ` +
      'a tenant’s overrides layered over the built-in Ashniva Desk theme. Consumers write these ' +
      'into CSS custom properties through the shared allow-listed applier.',
  })
  theme!: Branding['theme'];
}
