import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ProjectReleasePolicySummary,
  ReleaseApprovalDecision,
  ReleaseApproverRole,
  ReleaseReadiness,
  ReleaseStatus,
} from '@ashniva/types';

import { ReleaseGatesRepository } from './release-gates.repository';
import { computeReleaseReadiness } from './release-readiness';
import { toPolicySummary } from './releases.mapper';
import type { ReleaseDetailRow } from './releases.repository';

/**
 * Gathers what the gates are judged on and hands it to `computeReleaseReadiness`.
 *
 * The split is deliberate: fetching is here, deciding is in the pure function, so the rules that
 * stop a release going out can be read and tested without a database behind them.
 *
 * Items and approvals come off the detail row that was already loaded; only the policy and the
 * QA and UAT verdicts cost an extra query.
 */
@Injectable()
export class ReleaseReadinessService {
  constructor(private readonly gates: ReleaseGatesRepository) {}

  async policyFor(organizationId: string, projectId: string): Promise<ProjectReleasePolicySummary> {
    return toPolicySummary(await this.gates.findOrCreatePolicy(organizationId, projectId));
  }

  async forRelease(row: ReleaseDetailRow, actor: AuthenticatedUser): Promise<ReleaseReadiness> {
    const policy = await this.policyFor(row.organizationId, row.projectId);
    const taskIds = row.items.flatMap((item) => (item.taskId ? [item.taskId] : []));
    const ticketIds = row.items.flatMap((item) => (item.ticketId ? [item.ticketId] : []));
    const [qa, uat] = await Promise.all([
      this.gates.qaState(row.organizationId, row.id, taskIds, ticketIds),
      this.gates.uatState(row.organizationId, row.id, taskIds),
    ]);

    return computeReleaseReadiness({
      status: row.status as ReleaseStatus,
      itemCount: row.items.length,
      policy,
      approvals: row.approvals.map((approval) => ({
        approverRole: approval.approverRole as ReleaseApproverRole,
        decision: approval.decision as ReleaseApprovalDecision,
      })),
      qa,
      uat,
      permissions: actor.permissions,
    });
  }
}
