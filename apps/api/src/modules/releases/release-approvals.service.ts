import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  RELEASE_APPROVAL_DECISION,
  RELEASE_APPROVER_ROLE,
  RELEASE_STATUS,
  ROLE_KEYS,
  type AuthenticatedUser,
  type ReleaseApproverRole,
  type ReleaseDetail,
  type RoleKey,
} from '@ashniva/types';

import { ReleaseGatesRepository } from './release-gates.repository';
import type { ReleaseDetailRow } from './releases.repository';
import { ReleaseTransitionsService, assertReleaseAction } from './release-transitions.service';
import { ReleasesService } from './releases.service';
import type { ApproveReleaseDto } from './dto/release.dto';

/**
 * The sign-offs a release needs, and who may give which.
 *
 * The rows were snapshotted from the project policy when approval was requested, so this service
 * only ever fills in a signature that was already required. It cannot add one, and a policy edited
 * since then changes nothing about a release already in flight.
 */
@Injectable()
export class ReleaseApprovalsService {
  constructor(
    private readonly service: ReleasesService,
    private readonly gates: ReleaseGatesRepository,
    private readonly transitions: ReleaseTransitionsService,
  ) {}

  async decide(
    actor: AuthenticatedUser,
    id: string,
    dto: ApproveReleaseDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    const rejecting = dto.decision === RELEASE_APPROVAL_DECISION.REJECTED;
    const note = dto.note?.trim() || null;
    // Checked before anything is written, so a rejection with no reason cannot leave a decided
    // approval row behind a refused transition.
    assertReleaseAction(rejecting ? 'reject' : 'approve', release, actor, note);

    if (!rejecting) {
      assertNotTheRequester(actor, release);
    }

    const pending = await this.gates.pendingRoles(release.organizationId, release.id);
    const role = await this.resolveRole(actor, release, dto, pending);

    const recorded = await this.gates.recordDecision({
      organizationId: release.organizationId,
      releaseId: release.id,
      approverRole: role,
      decision: rejecting ? 'REJECTED' : 'APPROVED',
      approverUserId: actor.userId,
      note,
    });
    if (!recorded) {
      throw new ConflictException('That sign-off was already given by someone else');
    }

    if (rejecting) {
      await this.transitions.move(actor, release, 'reject', {
        note,
        auditAction: AUDIT_ACTION.RELEASE_REJECTED,
        auditAfter: { version: release.version, approverRole: role, note },
      });
      // The signatures go with the release: the next attempt is signed afresh, against whatever
      // it has been changed into.
      await this.gates.clearApprovals(release.organizationId, release.id);
      return this.service.get(actor, id);
    }

    // The release only moves once the last required signature is in. Until then the decision is
    // recorded and the release waits, which is what the readiness checklist reports.
    const stillWaiting = pending.filter((row) => row !== role);
    if (stillWaiting.length === 0) {
      await this.transitions.move(actor, release, 'approve', {
        note,
        auditAction: AUDIT_ACTION.RELEASE_APPROVED,
        auditAfter: { version: release.version, approverRole: role },
      });
    }
    return this.service.get(actor, id);
  }

  /**
   * Which required sign-off this person is giving.
   *
   * Defaults to the one their role implies, and may be named explicitly because a small team has
   * one person wearing two hats — a PM who is also the release senior should not need a second
   * account to give the second signature. The permission to approve at all is the route guard's
   * job; this only decides which of the outstanding rows is being filled in.
   */
  private async resolveRole(
    actor: AuthenticatedUser,
    release: ReleaseDetailRow,
    dto: ApproveReleaseDto,
    pending: readonly ReleaseApproverRole[],
  ): Promise<ReleaseApproverRole> {
    if (pending.length === 0) {
      throw new ConflictException('This release has no sign-off outstanding');
    }
    const role = dto.approverRole ?? impliedRole(actor.roleKey);
    if (!role) {
      throw new BadRequestException(
        `Your role does not imply a release sign-off — say which one you are giving (${pending.join(', ')})`,
      );
    }
    if (!pending.includes(role)) {
      throw new ConflictException(
        `This release is not waiting on ${role} — it is waiting on ${pending.join(', ')}`,
      );
    }
    if (role === RELEASE_APPROVER_ROLE.CLIENT) {
      // The provider must never be able to sign in the client's name. The client's decision
      // arrives as their UAT approval; this row records it, and only once it exists.
      // The same union the readiness gate counts: a client who signed off the individual tasks
      // has given their decision, and refusing to record it here would make the CLIENT signature
      // unreachable on exactly the projects that ask the client per change.
      const uat = await this.gates.uatState(
        release.organizationId,
        release.id,
        release.items.flatMap((item) => (item.taskId ? [item.taskId] : [])),
      );
      if (uat.approved === 0) {
        throw new ForbiddenException(
          'The client’s sign-off is theirs to give — it is recorded from their UAT approval',
        );
      }
    }
    return role;
  }
}

/**
 * Nobody signs off their own release.
 *
 * `PROJECT_MANAGER` holds `release:manage`, `release:approve` and `release:publish` together, so
 * without this one person could put a release together, ask for approval, grant it and ship it
 * with nobody else ever looking — which makes the whole approval step decoration. Separation of
 * duties is the reason the step exists, and it costs nothing on a team of two: somebody else asks
 * for the approval, or somebody else gives it.
 *
 * Only approving is refused. Rejecting your own release is withdrawing it, which is the ordinary
 * way back to DRAFT and cannot get anything shipped; blocking that would leave a release nobody
 * could pull back.
 *
 * The requester is read off the history rather than a column: the trail already records who moved
 * the release into APPROVAL_REQUESTED, and the last such move is the request these signatures
 * belong to — a rejection clears the approvals, so an older request cannot bind the current one.
 */
function assertNotTheRequester(actor: AuthenticatedUser, release: ReleaseDetailRow): void {
  const requestedBy = release.history
    .filter((entry) => entry.toStatus === RELEASE_STATUS.APPROVAL_REQUESTED)
    .at(-1)?.changedById;
  if (requestedBy && requestedBy === actor.userId) {
    throw new ForbiddenException(
      'You asked for this approval, so it is not yours to give — somebody else has to sign it off',
    );
  }
}

/**
 * The sign-off a role key stands for. Roles that are not release approvers map to nothing, and
 * the person is asked which signature they mean rather than being given a default that is wrong.
 */
const ROLE_TO_APPROVER: Partial<Record<RoleKey, ReleaseApproverRole>> = {
  [ROLE_KEYS.SUPER_ADMIN]: RELEASE_APPROVER_ROLE.DIRECTOR,
  [ROLE_KEYS.PROJECT_MANAGER]: RELEASE_APPROVER_ROLE.PROJECT_MANAGER,
  [ROLE_KEYS.TEAM_LEAD]: RELEASE_APPROVER_ROLE.SENIOR,
  [ROLE_KEYS.TESTER]: RELEASE_APPROVER_ROLE.QA_LEAD,
  [ROLE_KEYS.CLIENT_ADMIN]: RELEASE_APPROVER_ROLE.CLIENT,
  [ROLE_KEYS.CLIENT_EMPLOYEE]: RELEASE_APPROVER_ROLE.CLIENT,
};

function impliedRole(roleKey: RoleKey): ReleaseApproverRole | undefined {
  return ROLE_TO_APPROVER[roleKey];
}
