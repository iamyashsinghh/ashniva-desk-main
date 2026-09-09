import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * The approved RCA form's ten questions, in the order it asks them.
 *
 * Six of them are required and four are not, and the split is not arbitrary: what happened, why,
 * who was affected, what was introduced by what, the permanent fix and the prevention are the
 * analysis. A workaround that was never offered, a test that was not needed and a target date for
 * work already done are all legitimately empty, and demanding them would only teach people to
 * type "n/a".
 *
 * Every field is optional *here*, though, because this shape carries a draft as well as a
 * submission. A ten-question form written over two days has to be saveable half-finished, and a
 * validator that refused an empty draft would make "Save draft" a button that never worked.
 * `RcaService.submit` is what insists on the six, and only when the answers are actually being
 * submitted — which is also the only place that knows which of the two this is.
 */
export class SubmitRcaDto {
  @ApiPropertyOptional({ maxLength: 5000, description: '1. What happened?' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  what?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '2. Why did it happen?' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  why?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '3. Clients and versions affected' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  affectedClientsVersions?: string;

  @ApiPropertyOptional({
    maxLength: 5000,
    description: '4. Introduced by — a release, a change, in words',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  introducedBy?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '5. Workaround offered meanwhile' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  workaround?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '6. Permanent solution' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  permanentFix?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '7. Prevention' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  prevention?: string;

  @ApiPropertyOptional({ maxLength: 5000, description: '8. Tests added' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  testsAdded?: string;

  @ApiPropertyOptional({ format: 'uuid', description: '9. Owner' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ format: 'date', description: '10. Target date' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The release this analysis blames. The words above stay either way.',
  })
  @IsOptional()
  @IsUUID()
  introducedByReleaseId?: string;

  /**
   * Saving without submitting.
   *
   * A ten-question form written over two days needs somewhere to keep half of it. A draft stays a
   * draft: it does not move the problem, and `problemClosureGate` does not accept it.
   */
  @ApiPropertyOptional({ default: false, description: 'Save the answers without submitting them' })
  @IsOptional()
  @IsIn([true, false])
  draft?: boolean;
}

export class ReviewRcaDto {
  @ApiProperty({ enum: ['APPROVED', 'CHANGES_REQUESTED'] })
  @IsIn(['APPROVED', 'CHANGES_REQUESTED'])
  decision!: 'APPROVED' | 'CHANGES_REQUESTED';

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required when asking for changes: what has to be different',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
