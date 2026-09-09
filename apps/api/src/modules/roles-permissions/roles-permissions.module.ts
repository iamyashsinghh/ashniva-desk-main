import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RolesPermissionsController } from './roles-permissions.controller';
import { RolesPermissionsService } from './roles-permissions.service';
import { RolesRepository } from './roles.repository';

/** System roles (read-only) and per-organization custom roles with granular permissions. */
@Module({
  imports: [AuditLogsModule],
  controllers: [RolesPermissionsController],
  providers: [RolesRepository, RolesPermissionsService],
  exports: [RolesRepository],
})
export class RolesPermissionsModule {}
