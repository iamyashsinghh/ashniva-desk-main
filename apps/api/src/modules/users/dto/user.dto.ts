import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_ROLE_KEYS, USER_STATUS, type RoleKey, type UserStatus } from '@ashniva/types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const lowercaseTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ListUsersQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to your own organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Matches name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ALL_ROLE_KEYS })
  @IsOptional()
  @IsIn(ALL_ROLE_KEYS)
  roleKey?: RoleKey;

  @ApiPropertyOptional({ enum: Object.values(USER_STATUS) })
  @IsOptional()
  @IsIn(Object.values(USER_STATUS))
  status?: UserStatus;
}

export class CreateUserDto {
  @ApiProperty({ example: 'new.person@example.com' })
  @Transform(lowercaseTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    minLength: 10,
    description:
      'Optional: without a password the person receives an invitation link and chooses their own',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password?: string;

  @ApiPropertyOptional({ enum: ALL_ROLE_KEYS, description: 'System role (or use roleId)' })
  @IsOptional()
  @IsIn(ALL_ROLE_KEYS)
  roleKey?: RoleKey;

  @ApiPropertyOptional({ format: 'uuid', description: 'Custom role of the organization' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to your own organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  showDevelopmentSection?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  teamIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Membership to edit; defaults to your own organization',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDevelopmentSection?: boolean;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  teamIds?: string[];
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}

/** Role changes are sensitive: separate endpoint, re-authentication required. */
export class ChangeUserRoleDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to your own organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ enum: ALL_ROLE_KEYS })
  @IsOptional()
  @IsIn(ALL_ROLE_KEYS)
  roleKey?: RoleKey;

  @ApiPropertyOptional({ format: 'uuid', description: 'Custom role of the organization' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
