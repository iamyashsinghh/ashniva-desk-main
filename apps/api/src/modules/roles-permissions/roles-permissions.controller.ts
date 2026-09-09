import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  PERMISSIONS,
  REAUTH_HEADER,
  type AuthenticatedUser,
  type CustomRoleDetail,
  type PermissionCatalogEntry,
  type RoleChangeHistoryEntry,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import { CreateRoleDto, RolesQueryDto, UpdateRoleDto } from './dto/role.dto';
import { RolesPermissionsService } from './roles-permissions.service';

const SENSITIVE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@RequirePermissions(PERMISSIONS.ROLE_MANAGE)
export class RolesPermissionsController {
  constructor(private readonly roles: RolesPermissionsService) {}

  @Get()
  @ApiOperation({
    summary: 'System roles and the custom roles of an organization, with permissions',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: RolesQueryDto,
  ): Promise<CustomRoleDetail[]> {
    return this.roles.list(actor, query.organizationId);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Permission catalogue grouped by module, with client-safe flags' })
  catalog(): PermissionCatalogEntry[] {
    return this.roles.catalog();
  }

  @Post()
  @RequireRecentAuth()
  @Throttle(SENSITIVE_THROTTLE)
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({
    summary: 'Create a custom role from a system template (re-authentication required)',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
  ): Promise<CustomRoleDetail> {
    return this.roles.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One role with its permissions' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RolesQueryDto,
  ): Promise<CustomRoleDetail> {
    return this.roles.get(actor, id, query.organizationId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Audit history of a role' })
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleChangeHistoryEntry[]> {
    return this.roles.history(actor, id);
  }

  @Patch(':id')
  @RequireRecentAuth()
  @Throttle(SENSITIVE_THROTTLE)
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({
    summary: 'Rename a custom role or change its permissions (re-authentication required)',
  })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<CustomRoleDetail> {
    return this.roles.update(actor, id, dto);
  }

  @Delete(':id')
  @RequireRecentAuth()
  @Throttle(SENSITIVE_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({ summary: 'Delete an unused custom role (re-authentication required)' })
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.roles.remove(actor, id);
  }
}
