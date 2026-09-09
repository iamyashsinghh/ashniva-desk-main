import { ApiPropertyOptional } from '@nestjs/swagger';
import { brandingUpdateSchema, THEME_DOCUMENT_VERSION, type ThemeDocument } from '@ashniva/types';
import { BadRequestException } from '@nestjs/common';

/**
 * What `PATCH /admin/branding` accepts.
 *
 * Validated by the Zod schema in `packages/types` rather than by class-validator decorators, and
 * that is a deliberate exception to the house pattern. These values become CSS custom properties,
 * so the validation *is* the security boundary — and it has to be the same rule wherever a
 * document enters, whether that is an administrator's form, a Theme Manager's response, or a row
 * read back out of the database. Three decorator sets that were meant to agree would eventually
 * not, and the loosest one would be the hole.
 *
 * The class exists so Swagger has a body to document; `parse` is what actually runs.
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({ maxLength: 60, example: 'Acme Desk' })
  productName?: string;

  @ApiPropertyOptional({ maxLength: 4, example: 'AC' })
  logoText?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'An externally hosted logo. Null clears it. http(s) only.',
  })
  logoUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'A logo uploaded through POST /files. Null clears it.',
  })
  logoFileId?: string | null;

  @ApiPropertyOptional({
    description:
      `A partial theme document, version ${THEME_DOCUMENT_VERSION}. Every token is optional and ` +
      'overrides the built-in default; every value is validated against its own kind.',
    example: { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: '#3b5fa0' } },
  })
  theme?: ThemeDocument;
}

/** Parses the body, turning a schema failure into the API's ordinary 400. */
export function parseBrandingUpdate(body: unknown) {
  const parsed = brandingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
    );
  }
  return parsed.data;
}
