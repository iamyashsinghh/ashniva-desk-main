import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class BrandingQueryDto {
  @ApiPropertyOptional({ description: 'Organization slug. Defaults to the service provider.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, { message: 'organization must be a lowercase slug' })
  organization?: string;
}
