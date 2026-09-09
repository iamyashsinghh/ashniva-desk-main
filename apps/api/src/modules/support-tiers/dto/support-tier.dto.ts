import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PRIORITY,
  SUPPORT_AVAILABILITY_WINDOW,
  SUPPORT_FALLBACK_STRATEGY,
  type Priority,
  type SupportAvailabilityWindow,
  type SupportFallbackStrategy,
} from '@ashniva/types';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const PRIORITIES = Object.values(PRIORITY);
const STRATEGIES = Object.values(SUPPORT_FALLBACK_STRATEGY);
const WINDOWS = Object.values(SUPPORT_AVAILABILITY_WINDOW);

/** A day, in minutes. Longer than that is a policy nobody is honouring, not a target. */
const MAX_TIMING_MINUTES = 24 * 60;

/**
 * What one tier entitles a product to.
 *
 * Every field is optional and every omitted field means "leave it as it is" — the same convention
 * the rest of the product uses for a partial update, and the same convention the resolver uses for
 * a null column. Nothing here is priced: an amount would make a commercial decision into a schema.
 */
export class UpdateSupportTierPolicyDto {
  @ApiPropertyOptional({ description: 'Whether this tier may raise tickets at all' })
  @IsOptional()
  @IsBoolean()
  admissionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'SLA policy this tier selects; null clears the selection' })
  @IsOptional()
  @IsUUID()
  slaPolicyId?: string | null;

  @ApiPropertyOptional({ enum: PRIORITIES, description: 'Lowest priority a ticket is filed at' })
  @IsOptional()
  @IsIn(PRIORITIES)
  minimumPriority?: Priority | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  callsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requesterInitiatedCalls?: boolean;

  @ApiPropertyOptional({
    description:
      'Recorded for the support agreement. It does not yet drive routing: who a ticket reaches ' +
      'is unchanged by this setting.',
  })
  @IsOptional()
  @IsBoolean()
  dedicatedOwnership?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_TIMING_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TIMING_MINUTES)
  ackMinutes?: number | null;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_TIMING_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TIMING_MINUTES)
  escalationMinutes?: number | null;

  @ApiPropertyOptional({
    enum: STRATEGIES,
    description:
      'Recorded for the support agreement. It does not yet drive routing: an unanswered ticket ' +
      'stays in the support queue whichever value is set here.',
  })
  @IsOptional()
  @IsIn(STRATEGIES)
  fallbackStrategy?: SupportFallbackStrategy;

  @ApiPropertyOptional({
    enum: WINDOWS,
    description:
      'Recorded for the support agreement. It does not yet drive routing or the SLA clock, which ' +
      'follow the selected SLA policy’s business hours.',
  })
  @IsOptional()
  @IsIn(WINDOWS)
  availabilityWindow?: SupportAvailabilityWindow;
}
