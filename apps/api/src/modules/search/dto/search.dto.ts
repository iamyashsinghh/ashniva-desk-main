import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  SEARCH_DEFAULT_GROUP_LIMIT,
  SEARCH_MAX_GROUP_LIMIT,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
} from '@ashniva/types';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({
    description: `What to look for. At least ${SEARCH_MIN_QUERY_LENGTH} characters.`,
    minLength: SEARCH_MIN_QUERY_LENGTH,
    maxLength: SEARCH_MAX_QUERY_LENGTH,
  })
  @IsString()
  @MinLength(SEARCH_MIN_QUERY_LENGTH)
  @MaxLength(SEARCH_MAX_QUERY_LENGTH)
  q!: string;

  @ApiPropertyOptional({
    description: 'Rows per entity type',
    default: SEARCH_DEFAULT_GROUP_LIMIT,
    maximum: SEARCH_MAX_GROUP_LIMIT,
  })
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_GROUP_LIMIT)
  limit: number = SEARCH_DEFAULT_GROUP_LIMIT;
}
