import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INTEGRATION_PROVIDER, type IntegrationProvider } from '@ashniva/types';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const PROVIDERS = Object.values(INTEGRATION_PROVIDER);

export class ProviderParamDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider!: IntegrationProvider;
}

/**
 * Credentials arrive here once and are encrypted before they touch the database. The field is
 * write-only: no response type contains it, and the mapper is an explicit allow-list so it cannot
 * be added back by accident.
 */
export class ConnectIntegrationDto {
  @ApiProperty({
    description:
      'Provider credential (personal access token, app token, API key). Stored encrypted.',
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  credential!: string;

  @ApiPropertyOptional({
    description: 'Shared secret used to verify inbound webhooks.',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  webhookSecret?: string;

  @ApiPropertyOptional({ description: 'Label shown in the UI, e.g. the GitHub organization.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Non-secret provider settings (base URL, sender name, …). Never put a token here.',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, string | number | boolean | null>;
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional({ description: 'Pause the integration without discarding its credentials.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Non-secret provider settings only.' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, string | number | boolean | null>;
}

export class ListEventsQueryDto {
  @ApiPropertyOptional({ enum: PROVIDERS })
  @IsOptional()
  @IsIn(PROVIDERS)
  provider?: IntegrationProvider;
}
