import { Injectable } from '@nestjs/common';
import type { ReleaseApproverRole, UatDecision } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { currentUatState, type QaState, type UatState } from './release-readiness';

export type ProjectReleasePolicyRow = Prisma.ProjectReleasePolicyGetPayload<object>;

/**
 * The rows the readiness gates are computed from: the project's policy, the snapshotted
 * approvals, and the QA and UAT verdicts that back them.
 *
 * Separate from `ReleasesRepository` because these are reads across four other aggregates, and
 * mixing them into release CRUD hides how much a single readiness check actually costs.
 */
@Injectable()
export class ReleaseGatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPolicy(organizationId: string, projectId: string): Promise<ProjectReleasePolicyRow | null> {
    return this.prisma.projectReleasePolicy.findFirst({ where: { organizationId, projectId } });
  }

  /**
   * Reads the policy, creating the default row the first time a project is asked about it.
   *
   * On demand rather than at project creation: a policy row that exists for every project ever
   * created is mostly rows nobody edited, and a project created before this feature shipped would
   * have none at all. The defaults live in the schema so both paths agree.
   */
  async findOrCreatePolicy(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectReleasePolicyRow> {
    const existing = await this.findPolicy(organizationId, projectId);
    if (existing) {
      return existing;
    }
    // `projectId` is unique, so two first-time readers race to the same row rather than making two.
    return this.prisma.projectReleasePolicy.upsert({
      where: { projectId },
      update: {},
      create: { organizationId, projectId },
    });
  }

  async savePolicy(
    organizationId: string,
    projectId: string,
    data: Omit<Prisma.ProjectReleasePolicyUncheckedUpdateInput, 'organizationId' | 'projectId'>,
  ): Promise<ProjectReleasePolicyRow> {
    await this.findOrCreatePolicy(organizationId, projectId);
    await this.prisma.projectReleasePolicy.updateMany({
      where: { organizationId, projectId },
      data,
    });
    return this.findOrCreatePolicy(organizationId, projectId);
  }

  /**
   * Freezes the required sign-offs onto the release.
   *
   * Written when approval is requested, from the policy as it stands at that moment. Editing the
   * policy afterwards cannot add a signature to a release already in flight, nor drop one that
   * has been given — the release is judged against what it was sent out under.
   *
   * `skipDuplicates` with the (releaseId, approverRole) unique index makes a second request
   * harmless rather than a crash.
   */
  async snapshotApprovals(
    organizationId: string,
    releaseId: string,
    roles: readonly ReleaseApproverRole[],
  ): Promise<void> {
    if (roles.length === 0) {
      return;
    }
    await this.prisma.releaseApproval.createMany({
      data: roles.map((approverRole) => ({ organizationId, releaseId, approverRole })),
      skipDuplicates: true,
    });
  }

  /** Clears the snapshot when a release goes back to DRAFT: the next attempt is signed afresh. */
  async clearApprovals(organizationId: string, releaseId: string): Promise<void> {
    await this.prisma.releaseApproval.deleteMany({ where: { organizationId, releaseId } });
  }

  /**
   * Records one approver's decision, conditional on the row still being PENDING so that two
   * people holding the same role cannot overwrite each other's verdict.
   */
  async recordDecision(input: {
    organizationId: string;
    releaseId: string;
    approverRole: ReleaseApproverRole;
    decision: 'APPROVED' | 'REJECTED';
    approverUserId: string;
    note: string | null;
  }): Promise<boolean> {
    const written = await this.prisma.releaseApproval.updateMany({
      where: {
        organizationId: input.organizationId,
        releaseId: input.releaseId,
        approverRole: input.approverRole,
        decision: 'PENDING',
      },
      data: {
        decision: input.decision,
        approverUserId: input.approverUserId,
        note: input.note,
        decidedAt: new Date(),
      },
    });
    return written.count > 0;
  }

  /** Which of the required roles are still waiting, so a decider can be pointed at their own. */
  async pendingRoles(organizationId: string, releaseId: string): Promise<ReleaseApproverRole[]> {
    const rows = await this.prisma.releaseApproval.findMany({
      where: { organizationId, releaseId, decision: 'PENDING' },
      select: { approverRole: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.approverRole as ReleaseApproverRole);
  }

  /**
   * QA and retest verdicts covering the release.
   *
   * An assignment counts when it is attached to the release itself or to any task or ticket the
   * release carries — testing is usually assigned per task, long before the release exists, and a
   * gate that only looked at release-level assignments would always find nothing.
   */
  async qaState(
    organizationId: string,
    releaseId: string,
    taskIds: readonly string[],
    ticketIds: readonly string[],
  ): Promise<QaState> {
    const rows = await this.prisma.testingAssignment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        kind: { in: ['QA', 'RETEST'] },
        // A cancelled assignment is one somebody decided was not needed; it neither passes nor blocks.
        status: { not: 'CANCELLED' },
        OR: [
          { releaseId },
          ...(taskIds.length > 0 ? [{ taskId: { in: [...taskIds] } }] : []),
          ...(ticketIds.length > 0 ? [{ ticketId: { in: [...ticketIds] } }] : []),
        ],
      },
      select: { status: true },
    });
    return {
      total: rows.length,
      passed: rows.filter((row) => row.status === 'PASSED').length,
      failed: rows.filter((row) => row.status === 'FAILED').length,
    };
  }

  /**
   * The client's sign-off covering this release.
   *
   * Counted the same way as `qaState`, and for the same reason. `POST /uat` accepts a request
   * against either a release or a single task, and asking a client to approve one change at a time
   * is the ordinary way to use it — the release that ships it often does not exist yet. Matching
   * only on `releaseId` meant those sign-offs existed, were answered by the client, and were then
   * invisible to the gate that asked for them: a project with `requiresClientUat` stayed blocked
   * on "the client has not been asked to sign off" while the client's approval sat in the database.
   *
   * A rejection on any covered task blocks the release too, which is the half that matters most:
   * a client who asked for changes to one item must not be published around.
   *
   * Only the newest request per subject counts — see `currentUatState`, which is where that rule
   * and the reason for it live. The ordering here is what makes "newest" meaningful: `id`
   * descending breaks a tie between two requests raised in the same millisecond, so the answer is
   * the same on every read rather than whichever row the database happened to return first.
   */
  async uatState(
    organizationId: string,
    releaseId: string,
    taskIds: readonly string[],
  ): Promise<UatState> {
    const rows = await this.prisma.uatRequest.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ releaseId }, ...(taskIds.length > 0 ? [{ taskId: { in: [...taskIds] } }] : [])],
      },
      select: { releaseId: true, taskId: true, status: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return currentUatState(rows.map((row) => ({ ...row, status: row.status as UatDecision })));
  }

  /**
   * Whether somebody has confirmed the release works in production.
   *
   * Checked before VERIFIED so that "verified live" means a tester said so, not that an operator
   * clicked a button after deploying.
   */
  async hasPassedLiveVerification(organizationId: string, releaseId: string): Promise<boolean> {
    const passed = await this.prisma.testingAssignment.count({
      where: {
        organizationId,
        releaseId,
        deletedAt: null,
        kind: 'LIVE_VERIFICATION',
        status: 'PASSED',
      },
    });
    return passed > 0;
  }
}
