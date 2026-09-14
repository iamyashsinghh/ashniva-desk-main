import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ParseWorkPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fileId!: string;
}

export class WorkPlanPointDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  estimateMinutes!: number;
}

export class WorkPlanTitleDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ type: [WorkPlanPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanPointDto)
  points!: WorkPlanPointDto[];
}

export class WorkPlanPhaseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  heading!: string;

  @ApiProperty({ type: [WorkPlanTitleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanTitleDto)
  titles!: WorkPlanTitleDto[];
}

export class SaveWorkPlanDto {
  @ApiProperty({ type: [WorkPlanPhaseDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => WorkPlanPhaseDto)
  phases!: WorkPlanPhaseDto[];
}
