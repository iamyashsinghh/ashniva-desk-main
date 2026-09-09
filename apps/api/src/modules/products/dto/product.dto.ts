import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_ORIGIN_LENGTH,
  MAX_PRODUCT_ALLOWED_ORIGINS,
  MAX_WORK_AREAS,
  PRIORITY,
  SUPPORT_TIER,
  TICKET_SOURCE,
  TICKET_TYPE,
  WORK_AREA_MAX_LENGTH,
  type Priority,
  type SupportTier,
  type TicketSource,
  type TicketType,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const SOURCES = Object.values(TICKET_SOURCE);
const TYPES = Object.values(TICKET_TYPE);
const PRIORITIES = Object.values(PRIORITY);
const TIERS = Object.values(SUPPORT_TIER);

export class CreateProductDto {
  @ApiProperty({ example: 'CARELIX', description: 'Short stable key, unique in the organization' })
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'The project whose team owns this product’s support. Ingress refuses without it.',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'The Desk identity that stands as requester on tickets this product raises',
  })
  @IsOptional()
  @IsUUID()
  supportRequesterId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  supportEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoRouteEnabled?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Configuration only in 8c; package 9 reads it to decide whether to offer a call',
  })
  @IsOptional()
  @IsBoolean()
  ivrEnabled?: boolean;

  @ApiPropertyOptional({ enum: TIERS, default: SUPPORT_TIER.STANDARD })
  @IsOptional()
  @IsIn(TIERS)
  supportTier?: SupportTier;

  @ApiPropertyOptional({ enum: SOURCES, isArray: true, description: 'Empty means any source' })
  @IsOptional()
  @IsArray()
  @IsIn(SOURCES, { each: true })
  @ArrayMaxSize(SOURCES.length)
  allowedSources?: TicketSource[];

  @ApiPropertyOptional({ isArray: true, type: String, description: 'Empty means any work area' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  allowedWorkAreas?: string[];

  /**
   * Browser origins the embedded support widget may run on.
   *
   * Literal origins only — `https://app.example.com`, never a pattern. Each one is normalised and
   * validated in the service; anything carrying a path, a wildcard or a scheme other than HTTPS
   * (or loopback HTTP, for development) is refused rather than trimmed into shape. Empty means the
   * product is server-to-server only and no widget session can be minted for it.
   */
  @ApiPropertyOptional({ isArray: true, type: String, description: 'Empty means no widget' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(MAX_ORIGIN_LENGTH, { each: true })
  @ArrayMaxSize(MAX_PRODUCT_ALLOWED_ORIGINS)
  allowedOrigins?: string[];

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  defaultPriority?: Priority;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  defaultType?: TicketType;
}

/** Everything on create is editable afterwards except the code, which other systems configure. */
export class UpdateProductDto implements Omit<CreateProductDto, 'code' | 'name'> {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  supportRequesterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  supportEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoRouteEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ivrEnabled?: boolean;

  @ApiPropertyOptional({ enum: TIERS })
  @IsOptional()
  @IsIn(TIERS)
  supportTier?: SupportTier;

  @ApiPropertyOptional({ enum: SOURCES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(SOURCES, { each: true })
  @ArrayMaxSize(SOURCES.length)
  allowedSources?: TicketSource[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(WORK_AREA_MAX_LENGTH, { each: true })
  @ArrayMaxSize(MAX_WORK_AREAS)
  allowedWorkAreas?: string[];

  @ApiPropertyOptional({ isArray: true, type: String, description: 'Empty means no widget' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(MAX_ORIGIN_LENGTH, { each: true })
  @ArrayMaxSize(MAX_PRODUCT_ALLOWED_ORIGINS)
  allowedOrigins?: string[];

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  defaultPriority?: Priority;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  defaultType?: TicketType;
}

export class IssueCredentialDto {
  @ApiProperty({ maxLength: 80, description: 'What this credential is for — "Carelix production"' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;
}
