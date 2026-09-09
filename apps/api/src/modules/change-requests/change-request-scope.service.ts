import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';

/** Referential checks shared by change-request writes: the client, its members, projects, contracts. */
@Injectable()
export class ChangeRequestScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsRepository,
  ) {}

  async assertClientOrganization(id: string): Promise<void> {
    const organization = await this.organizations.findById(id);
    if (!organization || organization.isServiceProvider || organization.deletedAt) {
      throw new BadRequestException('Choose a client organization');
    }
  }

  async assertMember(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, deletedAt: null },
    });
    if (!member) {
      throw new BadRequestException('The requester is not a member of that organization');
    }
  }

  async assertProject(
    organizationId: string,
    projectId: string | undefined,
    clientOrganizationId: string,
  ): Promise<void> {
    if (!projectId) {
      return;
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, clientOrganizationId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found for this client');
    }
  }

  async assertContract(
    organizationId: string,
    contractId: string | undefined,
    clientOrganizationId: string,
  ): Promise<void> {
    if (!contractId) {
      return;
    }
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, organizationId, clientOrganizationId, deletedAt: null },
    });
    if (!contract) {
      throw new NotFoundException('Contract not found for this client');
    }
  }
}
