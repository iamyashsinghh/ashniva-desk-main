import { ApiPropertyOptional } from '@nestjs/swagger';
import { RELEASE_APPROVER_ROLE, type ReleaseApproverRole } from '@ashniva/types';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';

const APPROVER_ROLES = Object.values(RELEASE_APPROVER_ROLE);

/**
 * What a project insists on before a release may go out.
 *
 * Every field is optional so a caller can change one gate without restating the rest; omitted
 * fields keep their current value rather than silently reverting to the schema default.
 */
export class UpdateProjectReleasePolicyDto {
  @ApiPropertyOptional({
    enum: APPROVER_ROLES,
    isArray: true,
    description: 'Roles that must sign off. Empty means no approval step.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(APPROVER_ROLES.length)
  @IsIn(APPROVER_ROLES, { each: true })
  approverRoles?: ReleaseApproverRole[];

  @ApiPropertyOptional({ description: 'Every QA and retest on the release must have passed' })
  @IsOptional()
  @IsBoolean()
  requiresQaPass?: boolean;

  @ApiPropertyOptional({ description: 'The client must have signed off the UAT request' })
  @IsOptional()
  @IsBoolean()
  requiresClientUat?: boolean;

  @ApiPropertyOptional({
    description: 'Live verification must pass before the release is VERIFIED',
  })
  @IsOptional()
  @IsBoolean()
  requiresLiveVerification?: boolean;

  @ApiPropertyOptional({ description: 'Publishing asks the operator to type the version back' })
  @IsOptional()
  @IsBoolean()
  requiresTypedConfirmation?: boolean;
}
