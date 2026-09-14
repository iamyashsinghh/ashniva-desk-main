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
  type DirectoryEntry,
  type UserCreatedResponse,
  type UserSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import {
  ChangePasswordDto,
  ChangeUserRoleDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UserRolesService } from './user-roles.service';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly userRoles: UserRolesService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'People in an organization (defaults to your own)' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserSummary[]> {
    return this.users.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @RequireRecentAuth()
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({
    summary: 'Create a person (or add an existing person to an organization)',
    description:
      'Without a password the person is invited and the invitation link is returned. ' +
      'Re-authentication is required: this route chooses a role and hands back a credential ' +
      'for the account it just made, so a stolen access token alone must not be enough.',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ): Promise<UserCreatedResponse> {
    return this.users.create(actor, dto);
  }

  @Post(':id/invitations')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @RequireRecentAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({
    summary:
      'Issue a fresh invitation link for a person who has not signed in yet ' +
      '(re-authentication required)',
    description:
      'The link is a bearer-equivalent credential for that account — accepting it sets a ' +
      'password and returns a session — so minting one asks for the password again.',
  })
  invite(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<{ link: string; expiresAt: string }> {
    return this.userRoles.invite(actor, id, query.organizationId);
  }

  @Post(':id/role')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @RequireRecentAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({ summary: 'Change a person’s role (re-authentication required, audited)' })
  changeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserRoleDto,
  ): Promise<UserSummary> {
    return this.userRoles.changeRole(actor, id, dto);
  }

  @Get('directory')
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'People of your organization for assignee pickers (name, role, title)' })
  directory(@CurrentUser() actor: AuthenticatedUser): Promise<DirectoryEntry[]> {
    return this.users.directory(actor);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change your own password (signs out other devices)' })
  changePassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.users.changePassword(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'One person inside an organization' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserSummary> {
    return this.users.get(actor, id, query.organizationId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  // Deliberately not the role: a role change is POST /users/:id/role, which asks for the password
  // again and is audited. Saying "role" here invites someone to make this route honour roleId too.
  @ApiOperation({
    summary: 'Edit email, password, profile, title, teams or the Development-section toggle',
  })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserSummary> {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Suspend a person and sign them out everywhere' })
  deactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserSummary> {
    return this.users.deactivate(actor, id, query.organizationId);
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Re-activate a suspended person' })
  activate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserSummary> {
    return this.users.activate(actor, id, query.organizationId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently remove a person from the organization (soft delete)' })
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ): Promise<void> {
    return this.users.remove(actor, id, query.organizationId);
  }
}
