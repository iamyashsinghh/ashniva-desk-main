import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@ashniva/types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query parameters shared by every list endpoint. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cursor returned by the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}
