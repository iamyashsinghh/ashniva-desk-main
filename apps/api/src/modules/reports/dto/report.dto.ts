import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class DailyReportQueryDto {
  @ApiPropertyOptional({ format: 'date', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to you' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class DailyReportHistoryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  from!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  to!: string;
}
