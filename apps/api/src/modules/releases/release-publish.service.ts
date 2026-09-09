import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AUDIT_ACTION, type AuthenticatedUser, type ReleaseDetail } from '@ashniva/types';

import { ReleaseReadinessService } from './release-readiness.service';
import { ReleaseShippedNotesService } from './release-shipped-notes.service';
import { ReleaseTransitionsService, assertReleaseAction } from './release-transitions.service';
import { ReleasesService } from './releases.service';
import type { PublishReleaseDto } from './dto/release.dto';

/**
 * Sending a release out.
 *
 * The gates are re-checked here against freshly read rows rather than trusted from whatever the
 * page was showing: the checklist the operator saw may be minutes old, and a QA failure recorded
 * in between must stop the publish. The readiness returned on `ReleaseDetail` is the same
 * computation, so what the button says and what the endpoint enforces cannot drift.
 */
@Injectable()
export class ReleasePublishService {
  constructor(
    private readonly service: ReleasesService,
    private readonly readiness: ReleaseReadinessService,
    private readonly transitions: ReleaseTransitionsService,
    private readonly shippedNotes: ReleaseShippedNotesService,
  ) {}

  async publish(
    actor: AuthenticatedUser,
    id: string,
    dto: PublishReleaseDto,
  ): Promise<ReleaseDetail> {
    const release = await this.service.require(actor, id);
    assertReleaseAction('publish', release, actor);

    const readiness = await this.readiness.forRelease(release, actor);
    const blocking = readiness.gates.filter((gate) => !gate.satisfied);
    if (blocking.length > 0) {
      throw new ConflictException(
        `This release is not ready: ${blocking.map((gate) => gate.reason).join('; ')}`,
      );
    }

    this.assertTypedConfirmation(readiness.requiresTypedConfirmation, release.version, dto);

    // Claims the release before doing anything else. PUBLISHING is the lock: whoever wins this
    // conditional update owns the publish, and the loser is told the release moved rather than
    // publishing the same version twice.
    await this.transitions.move(actor, release, 'publish', {
      auditAction: AUDIT_ACTION.RELEASE_PUBLISHED,
      auditAfter: { version: release.version, stage: 'started' },
    });

    const claimed = await this.service.require(actor, id);
    try {
      await this.transitions.move(actor, claimed, 'completePublish', {
        data: { publishedAt: new Date(), publishedById: actor.userId, failureReason: null },
        auditAction: AUDIT_ACTION.RELEASE_PUBLISHED,
        auditAfter: { version: release.version },
      });
    } catch (error) {
      // A release left in PUBLISHING would look like a deployment still running and block every
      // other action, so a failure is recorded as one — with the reason, which the workflow
      // requires and an operator will need.
      await this.markFailed(actor, id, reasonFrom(error));
      throw error;
    }
    // After the release is safely PUBLISHED, and outside the try: the work having gone out is now
    // a fact, and a failure to write it down is not a failed publish.
    await this.shippedNotes.recordShipped(actor, claimed);
    return this.service.get(actor, id);
  }

  /**
   * Typing the version back is the last thing between an operator and production.
   *
   * Compared exactly, not trimmed or case-folded: the point of the check is that the person read
   * what is actually on the screen, and "close enough" defeats it.
   */
  private assertTypedConfirmation(
    required: boolean,
    version: string,
    dto: PublishReleaseDto,
  ): void {
    if (!required) {
      return;
    }
    if (!dto.confirmVersion) {
      throw new BadRequestException(`Type the version (${version}) to confirm this publish`);
    }
    if (dto.confirmVersion !== version) {
      throw new BadRequestException(
        `That is not this release’s version. Type ${version} exactly to confirm.`,
      );
    }
  }

  private async markFailed(actor: AuthenticatedUser, id: string, reason: string): Promise<void> {
    const publishing = await this.service.require(actor, id);
    await this.transitions.move(actor, publishing, 'failPublish', {
      note: reason,
      data: { failureReason: reason },
      // Its own action, not a `release.published` with a qualifier. An audit search for what
      // shipped must not turn up the attempts that did not.
      auditAction: AUDIT_ACTION.RELEASE_PUBLISH_FAILED,
      auditAfter: { version: publishing.version, reason },
    });
  }
}

function reasonFrom(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The publish did not complete';
}
