import { ApiProperty } from '@nestjs/swagger';
import {
  ALL_PERMISSION_KEYS,
  ALL_ROLE_KEYS,
  type PermissionKey,
  type RoleKey,
  type SessionOrganization,
  type SessionResponse,
  type SessionUser,
} from '@ashniva/types';

/** Swagger models only; the runtime shapes come from packages/types. */
export class SessionOrganizationDto implements SessionOrganization {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isServiceProvider!: boolean;
}

export class SessionUserDto implements SessionUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  title!: string | null;

  @ApiProperty({ enum: ALL_ROLE_KEYS })
  roleKey!: RoleKey;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty()
  roleName!: string;

  @ApiProperty()
  isCustomRole!: boolean;

  @ApiProperty({ enum: ALL_PERMISSION_KEYS, isArray: true })
  permissions!: PermissionKey[];

  @ApiProperty()
  showDevelopmentSection!: boolean;

  @ApiProperty({ type: SessionOrganizationDto })
  organization!: SessionOrganizationDto;

  @ApiProperty({ type: [SessionOrganizationDto] })
  organizations!: SessionOrganizationDto[];
}

export class SessionResponseDto implements SessionResponse {
  @ApiProperty({ description: 'Short-lived JWT; send as `Authorization: Bearer …`' })
  accessToken!: string;

  @ApiProperty()
  accessTokenExpiresInSeconds!: number;

  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;
}
