import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROBLEM_TICKET_RELATION,
  RECURRING_GROUP_BY,
  SIMILARITY_DECISION,
  type ProblemTicketRelation,
  type RecurringGroupBy,
  type SimilarityDecision,
} from '@ashniva/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const DECIDABLE = [SIMILARITY_DECISION.LINKED, SIMILARITY_DECISION.DISMISSED];
const RELATIONS = Object.values(PROBLEM_TICKET_RELATION);
const GROUPINGS = Object.values(RECURRING_GROUP_BY);

export class DecideSimilarityDto {
  @ApiProperty({
    enum: DECIDABLE,
    description:
      'LINKED needs problem:manage; with only problem:suggest-duplicate it is stored as a suggestion.',
  })
  @IsIn(DECIDABLE)
  decision!: Extract<SimilarityDecision, 'LINKED' | 'DISMISSED'>;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Which problem to link into. Omit to use the group’s own, or to open one.',
  })
  @IsOptional()
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ enum: RELATIONS, default: PROBLEM_TICKET_RELATION.DUPLICATE })
  @IsOptional()
  @IsIn(RELATIONS)
  relation?: ProblemTicketRelation;
}

/** The window the "frequency" column counts over. A quarter is the longest the screen offers. */
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;
export const DEFAULT_WINDOW_DAYS = 30;

export class RecurringReportQueryDto {
  @ApiPropertyOptional({ enum: GROUPINGS, default: RECURRING_GROUP_BY.MODULE })
  @IsOptional()
  @IsIn(GROUPINGS)
  by?: RecurringGroupBy;

  @ApiPropertyOptional({
    minimum: MIN_WINDOW_DAYS,
    maximum: MAX_WINDOW_DAYS,
    default: DEFAULT_WINDOW_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_WINDOW_DAYS)
  @Max(MAX_WINDOW_DAYS)
  windowDays?: number;

  /**
   * Narrows the report to one project, and with it the threshold the "over threshold" column uses.
   *
   * The threshold is configured per project, so a report spanning every project has no single one
   * to apply and falls back to the default the settings screen shows.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
