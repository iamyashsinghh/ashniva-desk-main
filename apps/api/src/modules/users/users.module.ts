import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import { UserAvatarController } from './user-avatar.controller';
import { UserAvatarRepository } from './user-avatar.repository';
import { UserAvatarService } from './user-avatar.service';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * People and their memberships: list, create, edit, deactivate, change own password, and each
 * person's own profile picture.
 * AuthModule needs UsersRepository (login) and UsersService needs AuthModule's hashing and
 * refresh-token services, hence the forward reference.
 */
@Module({
  imports: [forwardRef(() => AuthModule), OrganizationsModule, RolesPermissionsModule],
  controllers: [UserAvatarController, UsersController],
  providers: [
    UsersRepository,
    UsersService,
    UserRolesService,
    UserAvatarRepository,
    UserAvatarService,
  ],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
