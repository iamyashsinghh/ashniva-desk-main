import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReassignTicketDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedToId!: string;

  /**
   * Compulsory, and deliberately so: the specification asks that reassignment be allowed "only
   * with a compulsory reason", because a reassignment with no reason is exactly the record that
   * turns out to be useless six months later when somebody asks why.
   */
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RerouteTicketDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Route again even though somebody assigned this by hand. Without it a manual assignment stands.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
