import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_WORK_RELATION_TYPES, type WorkRelationType } from '@ashniva/types';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const TYPES = [...ALL_WORK_RELATION_TYPES];

/** A note is a sentence on a panel, not a document; the column is text and the screen is not. */
const MAX_NOTE_LENGTH = 500;

export class CreateTicketRelationDto {
  @ApiProperty({
    enum: TYPES,
    description:
      'DUPLICATE_OF is directed — this ticket is the copy, the target is the one being kept. RELATED_TO is symmetric.',
  })
  @IsIn(TYPES)
  type!: WorkRelationType;

  @ApiProperty({ format: 'uuid', description: 'The other ticket. For a duplicate, the one kept.' })
  @IsUUID()
  targetTicketId!: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, description: 'Why. Internal only.' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether marking a duplicate also closes it, naming what it duplicates. The closure is a status change with its own history entry — no reply, attachment, SLA record or audit entry moves between the two tickets.',
  })
  @IsOptional()
  @IsBoolean()
  closeDuplicate?: boolean;
}

export class CreateTaskRelationDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: WorkRelationType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetTaskId!: string;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string;
}
