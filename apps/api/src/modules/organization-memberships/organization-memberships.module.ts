import { Module } from '@nestjs/common';

import { OrganizationMembershipsRepository } from './organization-memberships.repository';

/**
 * Which users belong to which organizations, with which role.
 * Phase 1 adds invitation, role change and removal endpoints (see README.md).
 */
@Module({
  providers: [OrganizationMembershipsRepository],
  exports: [OrganizationMembershipsRepository],
})
export class OrganizationMembershipsModule {}
