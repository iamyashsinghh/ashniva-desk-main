import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/**
 * Referential checks shared by every QA write.
 *
 * They all take the caller's `organizationId`, so a project, environment or user id from another
 * tenant reads as "not found" rather than as a hint that the row exists.
 */
@Injectable()
export class QaScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async assertProject(organizationId: string, projectId: string): Promise<void> {
    const count = await this.prisma.project.count({
      where: { id: projectId, organizationId, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Project not found');
    }
  }

  /** An environment attached to an account or an assignment must belong to the same project. */
  async assertEnvironmentInProject(
    organizationId: string,
    environmentId: string,
    projectId: string,
  ): Promise<void> {
    const count = await this.prisma.testEnvironment.count({
      where: { id: environmentId, organizationId, projectId, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Environment not found for this project');
    }
  }

  /** A credential may only be granted to somebody who works here. */
  async assertMember(organizationId: string, userId: string): Promise<void> {
    const count = await this.prisma.organizationMembership.count({
      where: { organizationId, userId, deletedAt: null },
    });
    if (count === 0) {
      throw new BadRequestException('That person is not a member of this organization');
    }
  }

  /** Evidence has to be a file this organization owns, not a URL to somewhere else. */
  async assertEvidenceFile(organizationId: string, fileId: string): Promise<void> {
    const count = await this.prisma.file.count({
      where: { id: fileId, organizationId, deletedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Evidence file not found');
    }
  }
}
