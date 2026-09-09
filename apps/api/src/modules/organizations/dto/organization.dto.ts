import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORGANIZATION_TYPE, type OrganizationType } from '@ashniva/types';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const ORGANIZATION_TYPES = Object.values(ORGANIZATION_TYPE);

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description:
      'URL-safe identifier (lowercase letters, digits, dashes). Derived from the name when omitted.',
    example: 'acme-retail',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(60)
  slug?: string;

  @ApiProperty({ enum: ORGANIZATION_TYPES })
  @IsIn(ORGANIZATION_TYPES)
  type!: OrganizationType;

  @ApiPropertyOptional({ default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ORGANIZATION_TYPES })
  @IsOptional()
  @IsIn(ORGANIZATION_TYPES)
  type?: OrganizationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}
