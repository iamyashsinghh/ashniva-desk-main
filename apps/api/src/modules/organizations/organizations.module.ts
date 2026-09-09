import { Module } from '@nestjs/common';

import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

/** Tenants: own group companies and client organizations (Companies & clients screen). */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
