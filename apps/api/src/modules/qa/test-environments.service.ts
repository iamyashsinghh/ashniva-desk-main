import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TEST_ENVIRONMENT_STATUS,
  type AuthenticatedUser,
  type TestEnvironmentRow,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type {
  CreateTestEnvironmentDto,
  UpdateTestEnvironmentDto,
} from './dto/test-environment.dto';
import { QaScopeService } from './qa-scope.service';

const environmentFields = {
  id: true,
  projectId: true,
  kind: true,
  url: true,
  status: true,
  deployedVersion: true,
  deployedAt: true,
  githubEnvironmentName: true,
} satisfies Prisma.TestEnvironmentSelect;

type EnvironmentRow = Prisma.TestEnvironmentGetPayload<{ select: typeof environmentFields }>;

/**
 * Where a tester can actually go: the deployed environments of a project, what is on them and
 * whether they are up.
 *
 * Small enough that the queries live here rather than in a repository of their own — but they are
 * still the only place they are written, and every one of them carries `organizationId`.
 */
@Injectable()
export class TestEnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: QaScopeService,
  ) {}

  async listForProject(actor: AuthenticatedUser, projectId: string): Promise<TestEnvironmentRow[]> {
    await this.scope.assertProject(actor.organizationId, projectId);
    const rows = await this.prisma.testEnvironment.findMany({
      where: { organizationId: actor.organizationId, projectId, deletedAt: null },
      select: environmentFields,
      orderBy: [{ kind: 'asc' }, { url: 'asc' }],
    });
    return rows.map(toTestEnvironmentRow);
  }

  async create(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateTestEnvironmentDto,
  ): Promise<TestEnvironmentRow> {
    await this.scope.assertProject(actor.organizationId, projectId);
    const row = await this.prisma.testEnvironment.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        kind: dto.kind,
        url: dto.url,
        status: dto.status ?? TEST_ENVIRONMENT_STATUS.UNKNOWN,
        deployedVersion: dto.deployedVersion ?? null,
        deployedAt: dto.deployedAt ? new Date(dto.deployedAt) : null,
        githubEnvironmentName: dto.githubEnvironmentName ?? null,
        createdById: actor.userId,
      },
      select: environmentFields,
    });
    return toTestEnvironmentRow(row);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTestEnvironmentDto,
  ): Promise<TestEnvironmentRow> {
    const existing = await this.prisma.testEnvironment.count({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });
    if (existing === 0) {
      throw new NotFoundException('Environment not found');
    }
    const row = await this.prisma.testEnvironment.update({
      where: { id, organizationId: actor.organizationId },
      data: {
        ...(dto.url === undefined ? {} : { url: dto.url }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.deployedVersion === undefined ? {} : { deployedVersion: dto.deployedVersion }),
        ...(dto.deployedAt === undefined ? {} : { deployedAt: new Date(dto.deployedAt) }),
        ...(dto.githubEnvironmentName === undefined
          ? {}
          : { githubEnvironmentName: dto.githubEnvironmentName }),
      },
      select: environmentFields,
    });
    return toTestEnvironmentRow(row);
  }
}

function toTestEnvironmentRow(row: EnvironmentRow): TestEnvironmentRow {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    url: row.url,
    status: row.status,
    deployedVersion: row.deployedVersion,
    deployedAt: row.deployedAt?.toISOString() ?? null,
    githubEnvironmentName: row.githubEnvironmentName,
  };
}
