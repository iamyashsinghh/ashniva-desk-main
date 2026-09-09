import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALL_PERMISSION_KEYS,
  ALL_ROLE_KEYS,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({ enum: ALL_ROLE_KEYS, description: 'System role used as the safe starting point' })
  @IsIn(ALL_ROLE_KEYS)
  templateKey!: RoleKey;

  @ApiPropertyOptional({
    enum: ALL_PERMISSION_KEYS,
    isArray: true,
    description: 'Defaults to the template’s permissions, capped by your own',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions?: PermissionKey[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Provider staff may create a role for a client organization',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ enum: ALL_PERMISSION_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions?: PermissionKey[];
}

export class RolesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to your own organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
