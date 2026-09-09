import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * People and their memberships: list, create, edit, deactivate, change own password.
 * AuthModule needs UsersRepository (login) and UsersService needs AuthModule's hashing and
 * refresh-token services, hence the forward reference.
 */
@Module({
  imports: [forwardRef(() => AuthModule), OrganizationsModule, RolesPermissionsModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UserRolesService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}
