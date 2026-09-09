import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONVERSATION_MEMBER_ROLE,
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_GROUP_MEMBERS,
  type ConversationMemberRole,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * The request shapes for conversations that have no project.
 *
 * Separate from `communication.dto.ts` because every field there describes a project, a task or a
 * ticket, and the whole point of these kinds is that they describe none of them. Validation here
 * is shape only: whether the people named may actually be reached is a live decision made by
 * `MessagingScopeService`, and no validator can stand in for it.
 */

const MEMBER_ROLES = Object.values(CONVERSATION_MEMBER_ROLE);

/** Starting a direct message with one colleague inside the caller's management scope. */
export class CreateScopeDirectDto {
  @ApiProperty({ format: 'uuid', description: 'The colleague to message' })
  @IsUUID()
  userId!: string;
}

/** Starting a group. */
export class CreateGroupDto {
  @ApiProperty({ maxLength: MAX_CONVERSATION_TITLE_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONVERSATION_TITLE_LENGTH)
  title!: string;

  @ApiProperty({
    isArray: true,
    format: 'uuid',
    description: 'Who the group starts with. Every one of them is checked against your scope.',
  })
  @IsArray()
  @ArrayMinSize(1)
  // One less than the maximum, because the person creating it is in it too.
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @IsUUID(undefined, { each: true })
  memberIds!: string[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A file already uploaded through the files module, to use as the group picture.',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;
}

/**
 * Renaming a group, or changing its picture.
 *
 * `imageFileId` is nullable rather than merely optional, and the difference is the feature:
 * absent means "leave the picture alone", `null` means "take it off". `@ValidateIf` is what lets
 * an explicit null through a `@IsUUID` that would otherwise reject it.
 */
export class UpdateConversationDto {
  @ApiPropertyOptional({ maxLength: MAX_CONVERSATION_TITLE_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONVERSATION_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  imageFileId?: string | null;
}

/** Adding one person to a group. */
export class AddConversationMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: MEMBER_ROLES, default: CONVERSATION_MEMBER_ROLE.MEMBER })
  @IsOptional()
  // OWNER is refused: a group has the one owner who made it, and handing that over is a different
  // act from adding somebody.
  @IsIn([CONVERSATION_MEMBER_ROLE.ADMIN, CONVERSATION_MEMBER_ROLE.MEMBER])
  role?: ConversationMemberRole;
}

/** The messaging directory: who the caller may reach outside a project. */
export class MessagingDirectoryQueryDto {
  @ApiPropertyOptional({ description: 'Match against name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
