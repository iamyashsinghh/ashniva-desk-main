import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ProjectReleasePolicySummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ReleaseGatesRepository } from './release-gates.repository';
import { toPolicySummary } from './releases.mapper';
import { ReleasesRepository } from './releases.repository';
import type { UpdateProjectReleasePolicyDto } from './dto/release-policy.dto';

/**
 * What a project insists on before a release may go out.
 *
 * The gates are data rather than code so a project that needs client UAT and one that does not
 * run the same publish path. Editing them never touches a release already in flight: the required
 * sign-offs are snapshotted onto the release when approval is requested.
 */
@Injectable()
export class ReleasePolicyService {
  constructor(
    private readonly releases: ReleasesRepository,
    private readonly gates: ReleaseGatesRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async get(actor: AuthenticatedUser, projectId: string): Promise<ProjectReleasePolicySummary> {
    await this.requireProject(actor, projectId);
    return toPolicySummary(await this.gates.findOrCreatePolicy(actor.organizationId, projectId));
  }

  async update(
    actor: AuthenticatedUser,
    projectId: string,
    dto: UpdateProjectReleasePolicyDto,
  ): Promise<ProjectReleasePolicySummary> {
    await this.requireProject(actor, projectId);
    // Omitted fields keep their current value: a caller turning one gate off should not silently
    // reset the other four to their defaults.
    const row = await this.gates.savePolicy(actor.organizationId, projectId, {
      ...(dto.approverRoles !== undefined ? { approverRoles: { set: dto.approverRoles } } : {}),
      ...(dto.requiresQaPass !== undefined ? { requiresQaPass: dto.requiresQaPass } : {}),
      ...(dto.requiresClientUat !== undefined ? { requiresClientUat: dto.requiresClientUat } : {}),
      ...(dto.requiresLiveVerification !== undefined
        ? { requiresLiveVerification: dto.requiresLiveVerification }
        : {}),
      ...(dto.requiresTypedConfirmation !== undefined
        ? { requiresTypedConfirmation: dto.requiresTypedConfirmation }
        : {}),
    });
    // A policy edit changes what every future release of this project must satisfy — including
    // whether the client gets a say — so it belongs in the audit trail beside the releases.
    await this.auditLog.record({
      action: AUDIT_ACTION.RELEASE_POLICY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROJECT,
      entityId: projectId,
      organizationId: actor.organizationId,
      after: { ...dto },
    });
    return toPolicySummary(row);
  }

  private async requireProject(actor: AuthenticatedUser, projectId: string): Promise<void> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Release policy is internal');
    }
    if (!(await this.releases.findProject(actor.organizationId, projectId))) {
      throw new NotFoundException('Project not found');
    }
  }
}
