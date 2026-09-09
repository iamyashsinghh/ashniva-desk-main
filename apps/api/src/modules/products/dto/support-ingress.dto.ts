import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_INGRESS_ATTACHMENTS,
  MAX_INGRESS_METADATA_KEYS,
  MAX_INGRESS_METADATA_VALUE_LENGTH,
  PRIORITY,
  TICKET_SOURCE,
  TICKET_TYPE,
  WORK_AREA_MAX_LENGTH,
  type Priority,
  type TicketSource,
  type TicketType,
} from '@ashniva/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  Validate,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ValidatorConstraint } from 'class-validator';

const SOURCES = Object.values(TICKET_SOURCE);
const TYPES = Object.values(TICKET_TYPE);
const PRIORITIES = Object.values(PRIORITY);

/**
 * Metadata is an allow-listed shape, not a free-form blob.
 *
 * A caller that can post arbitrary JSON can post megabytes of it, and every byte lands in a
 * ticket description somebody has to read. Bounding the key count and the value length keeps the
 * field useful — a browser version, a tenant id, a build number — without letting it become a
 * side channel for shipping data into Desk.
 */
@ValidatorConstraint({ name: 'ingressMetadata' })
class IngressMetadataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) {
      return true;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_INGRESS_METADATA_KEYS) {
      return false;
    }
    return entries.every(
      ([key, entry]) =>
        key.length > 0 &&
        key.length <= 60 &&
        typeof entry === 'string' &&
        entry.length <= MAX_INGRESS_METADATA_VALUE_LENGTH,
    );
  }

  defaultMessage(_args: ValidationArguments): string {
    return `metadata must be at most ${MAX_INGRESS_METADATA_KEYS} string values of ${MAX_INGRESS_METADATA_VALUE_LENGTH} characters`;
  }
}

export class SupportIngressAttachmentDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  filename!: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MaxLength(120)
  contentType!: string;

  /** Base64. The decoded size is what is checked, since base64 inflates by a third. */
  @ApiProperty({ description: 'Base64-encoded file content, 10 MB decoded at most' })
  @IsString()
  @MaxLength(15 * 1024 * 1024)
  content!: string;
}

export class RaiseSupportTicketDto {
  @ApiProperty({ minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ minLength: 3, maxLength: 10_000 })
  @IsString()
  @MinLength(3)
  @MaxLength(10_000)
  description!: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: TicketType;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Module or work area; must be one the product may raise' })
  @IsOptional()
  @IsString()
  @MaxLength(WORK_AREA_MAX_LENGTH)
  module?: string;

  /**
   * The build the reporter was on, in their own words.
   *
   * Free text rather than a release id: an integration reports whatever it knows about itself, and
   * "3.1.4-rc2 on the old server" is a more useful thing to group ten tickets by than a null.
   */
  @ApiPropertyOptional({ maxLength: 60, description: 'The product version the reporter is on' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  productVersion?: string;

  @ApiPropertyOptional({ enum: SOURCES, default: TICKET_SOURCE.API })
  @IsOptional()
  @IsIn(SOURCES)
  source?: TicketSource;

  @ApiPropertyOptional({ description: 'Your own case number, echoed back on status reads' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Your identifier for the person reporting this' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalUserId?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  requesterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  requesterEmail?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  requesterPhone?: string;

  @ApiPropertyOptional({ description: 'Screen or route where this happened', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  context?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  @Validate(IngressMetadataConstraint)
  metadata?: Record<string, string>;

  @ApiPropertyOptional({ type: [SupportIngressAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INGRESS_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => SupportIngressAttachmentDto)
  attachments?: SupportIngressAttachmentDto[];
}
