import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ReleaseDetail,
  type ReleaseStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type { Prisma } from '../../generated/prisma/client';
import { ReleaseGatesRepository } from './release-gates.repository';
import { ReleaseReadinessService } from './release-readiness.service';
import { checkReleaseAction, type ReleaseAction } from './release-workflow';
import { ReleasesRepository, type ReleaseDetailRow } from './releases.repository';
import { ReleasesService } from './releases.service';
import type {
  ReopenReleaseDto,
  RollbackReleaseDto,
  ScheduleReleaseDto,
  VerifyLiveDto,
} from './dto/release.dto';

export interface MoveOptions {
  note?: string | null;
  /** Columns written in the same conditional update as the status. */
  data?: Prisma.ReleaseUncheckedUpdateInput;
  auditAction: string;
  auditAfter?: Record<string, unknown>;
}

/**
 * Status moves of a release: requesting approval, scheduling, verifying live, rolling back.
 *
 * Publishing lives in `ReleasePublishService` and approvals in `ReleaseApprovalsService`; both
 * come back here for the actual move, so the conditional update, the history row and the audit
 * record are written in exactly one place.
 */
@Injectable()
export class ReleaseTransitionsService {
  constructor(
    private readonly releases: ReleasesRepository,
    private readonly service: ReleasesService,
    private readonly gates: ReleaseGatesRepository,
    private readonly readiness: ReleaseReadinessService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Draft → Approval requested, freezing the required sign-offs onto the release.
   *
   * A release with nothing in it is refused here rather than at publish time: the approvers would
   * be signing off an empty list, which is a waste of their attention and a confusing artefact.
   */
  async requestApproval(actor: AuthenticatedUser, id: string): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    assertReleaseAction('requestApproval', release, actor);
    if (release.items.length === 0) {
      throw new ConflictException('Add what is going out before asking anyone to approve it');
    }
    const policy = await this.readiness.policyFor(release.organizationId, release.projectId);

    await this.move(actor, release, 'requestApproval', {
      auditAction: AUDIT_ACTION.RELEASE_APPROVAL_REQUESTED,
      auditAfter: { version: release.version, approverRoles: policy.approverRoles },
    });
    // After the claim, not before: two people pressing the button at the same moment produce one
    // snapshot, and `skipDuplicates` makes a retry harmless. If this write were to fail the
    // release sits in APPROVAL_REQUESTED with no signatures, which blocks publishing — the safe
    // direction, and recoverable by rejecting it back to draft.
    await this.gates.snapshotApprovals(release.organizationId, release.id, policy.approverRoles);

    // A project that requires no sign-off should not leave a release waiting for one that will
    // never come. The intermediate state is still recorded, so the trail says the step happened
    // and was granted rather than skipped.
    if (policy.approverRoles.length === 0) {
      const requested = await this.service.require(actor, id);
      await this.move(actor, requested, 'approve', {
        note: 'This project requires no sign-off',
        auditAction: AUDIT_ACTION.RELEASE_APPROVED,
        auditAfter: { version: release.version, approverRoles: [] },
      });
    }
    return this.service.get(actor, id);
  }

  /** Approved → Scheduled, or a scheduled release moved to a new time. */
  async schedule(
    actor: AuthenticatedUser,
    id: string,
    dto: ScheduleReleaseDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    assertReleaseAction('schedule', release, actor);
    const at = new Date(dto.at);
    if (at.getTime() <= Date.now()) {
      throw new BadRequestException('Schedule a release for a time that has not passed yet');
    }
    await this.move(actor, release, 'schedule', {
      note: dto.note?.trim() || null,
      data: { scheduledFor: at },
      auditAction: AUDIT_ACTION.RELEASE_SCHEDULED,
      auditAfter: { version: release.version, scheduledFor: at.toISOString() },
    });
    return this.service.get(actor, id);
  }

  /**
   * Published → Verified live.
   *
   * When the project asks for live verification, a tester has to have passed one: otherwise
   * "verified" would mean an operator clicked a button after deploying, which is the assurance
   * this state exists to avoid.
   */
  async verifyLive(
    actor: AuthenticatedUser,
    id: string,
    dto: VerifyLiveDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    assertReleaseAction('verifyLive', release, actor);
    const policy = await this.readiness.policyFor(release.organizationId, release.projectId);
    if (
      policy.requiresLiveVerification &&
      !(await this.gates.hasPassedLiveVerification(release.organizationId, release.id))
    ) {
      throw new ConflictException(
        'This project needs a passed live-verification check before the release counts as verified',
      );
    }
    await this.move(actor, release, 'verifyLive', {
      note: dto.note?.trim() || null,
      data: { verifiedAt: new Date() },
      auditAction: AUDIT_ACTION.RELEASE_VERIFIED,
      auditAfter: { version: release.version },
    });
    return this.service.get(actor, id);
  }

  /** Pulls a release that reached production, or one whose publish never finished. */
  async rollback(
    actor: AuthenticatedUser,
    id: string,
    dto: RollbackReleaseDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    const reason = dto.reason.trim();
    assertReleaseAction('rollback', release, actor, reason);
    await this.move(actor, release, 'rollback', {
      note: reason,
      data: { rolledBackAt: new Date(), rollbackReason: reason },
      auditAction: AUDIT_ACTION.RELEASE_ROLLED_BACK,
      auditAfter: { version: release.version, reason },
    });
    return this.service.get(actor, id);
  }

  /**
   * Failed → Draft, so a publish that did not work can be fixed and tried again.
   *
   * The signatures are thrown away with the move: what the approvers looked at is about to
   * change, so keeping their sign-off would be attributing it to something they never saw. That is
   * why a reason is required here as it is for a rejection — the approvers whose sign-off is being
   * discarded are about to be asked for it again, and they are owed the reason why.
   */
  async reopen(
    actor: AuthenticatedUser,
    id: string,
    dto: ReopenReleaseDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    const reason = dto.reason.trim();
    assertReleaseAction('reopen', release, actor, reason);
    await this.move(actor, release, 'reopen', {
      note: reason,
      data: { failureReason: null },
      auditAction: AUDIT_ACTION.RELEASE_REOPENED,
      auditAfter: { version: release.version, returnedFrom: release.status, reason },
    });
    await this.gates.clearApprovals(release.organizationId, release.id);
    return this.service.get(actor, id);
  }

  /**
   * The one place a release changes status.
   *
   * The update is conditional on the status the workflow check ran against — see
   * `ReleasesRepository.transition` — so a second actor racing the first is told the release moved
   * rather than quietly overwriting it. The history row and the audit record are written for every
   * move, without exception: a status change nobody can account for later is the thing an audit is
   * for.
   */
  async move(
    actor: AuthenticatedUser,
    release: ReleaseDetailRow,
    action: ReleaseAction,
    options: MoveOptions,
  ): Promise<ReleaseStatus> {
    const check = assertReleaseAction(action, release, actor, options.note);
    const from = release.status as ReleaseStatus;
    const moved = await this.releases.transition({
      organizationId: release.organizationId,
      id: release.id,
      from,
      to: check.to,
      changedById: actor.userId,
      note: options.note?.trim() || null,
      data: options.data,
    });
    if (!moved) {
      throw new ConflictException(
        'This release changed while you were working on it — reload and try again',
      );
    }
    await this.auditLog.record({
      action: options.auditAction,
      entityType: AUDIT_ENTITY_TYPE.RELEASE,
      entityId: release.id,
      organizationId: release.organizationId,
      before: { status: from },
      after: { status: check.to, ...options.auditAfter },
    });
    return check.to;
  }
}

/**
 * Turns the workflow's typed refusal into the HTTP answer that matches it: the wrong state is a
 * conflict, a missing permission is forbidden, a missing reason is a bad request. Callers get the
 * workflow's own message, which names the obstacle rather than restating that something failed.
 */
export function assertReleaseAction(
  action: ReleaseAction,
  release: { status: string },
  actor: AuthenticatedUser,
  note?: string | null,
): { to: ReleaseStatus } {
  const check = checkReleaseAction(
    action,
    release.status as ReleaseStatus,
    actor.permissions,
    note,
  );
  if (check.ok) {
    return { to: check.to };
  }
  if (check.reason === 'permission') {
    throw new ForbiddenException(check.message);
  }
  if (check.reason === 'note') {
    throw new BadRequestException(check.message);
  }
  throw new ConflictException(check.message);
}
