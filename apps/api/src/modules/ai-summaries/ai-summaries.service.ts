import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  isClientFacingSummary,
  type AiSummaryStatus,
  type AiSummaryType,
  type AiUsageTotals,
  type AuthenticatedUser,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { AiGenerationService, type GenerationOutcome } from './ai-generation.service';
import {
  checkAiSummaryAction,
  isSummaryEditable,
  type AiSummaryAction,
} from './ai-summary-workflow';
import { AiSummariesRepository, type AiSummaryDetailRow } from './ai-summaries.repository';
import { SummaryScopeService } from './summary-scope.service';
import {
  auditActionFor,
  defaultTitle,
  exclusiveEnd,
  parseDay,
  subjectOf,
  summariseUsage,
} from './ai-summary-helpers';

/**
 * AI summaries: creating them, editing them, and moving them through review.
 *
 * The generation itself lives in `AiGenerationService`; this decides who may ask for it and what
 * state the summary is allowed to be in when they do.
 *
 * The rule the whole module exists for: generated text is a draft until a person approves it, and
 * client publication needs a second permission on top of approval. Nothing here can bypass that,
 * because every transition goes through `checkAiSummaryAction`.
 */

export interface CreateSummaryInput {
  type: AiSummaryType;
  title?: string;
  projectId?: string;
  subjectUserId?: string;
  ticketId?: string;
  clientOrganizationId?: string;
  periodStart: string;
  periodEnd: string;
}

@Injectable()
export class AiSummariesService {
  constructor(
    private readonly repository: AiSummariesRepository,
    private readonly generation: AiGenerationService,
    private readonly scope: SummaryScopeService,
    private readonly auditLog: AuditLogService,
  ) {}

  list(
    actor: AuthenticatedUser,
    query: {
      type?: AiSummaryType[];
      status?: AiSummaryStatus[];
      projectId?: string;
      subjectUserId?: string;
      search?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    return this.repository.list({
      organizationId: actor.organizationId,
      type: query.type,
      status: query.status,
      projectId: query.projectId,
      subjectUserId: query.subjectUserId,
      search: query.search?.trim() || undefined,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<AiSummaryDetailRow> {
    const row = await this.repository.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Summary not found');
    }
    return row;
  }

  async version(actor: AuthenticatedUser, id: string, version: number) {
    // Through `detail` first, so a version cannot be read for another tenant's summary.
    await this.detail(actor, id);
    const row = await this.repository.findVersion(id, version);
    if (!row) {
      throw new NotFoundException('That version does not exist');
    }
    return row;
  }

  /** Provider availability, for the settings and generate screens. */
  providerStatus(actor: AuthenticatedUser) {
    return this.generation.status(actor.organizationId);
  }

  async create(actor: AuthenticatedUser, input: CreateSummaryInput): Promise<AiSummaryDetailRow> {
    const periodStart = parseDay(input.periodStart, 'periodStart');
    const periodEnd = parseDay(input.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) {
      throw new BadRequestException('The period ends before it starts');
    }

    const clientOrganizationId = await this.scope.resolveClient(actor, input);
    await this.scope.assertScopeBelongs(actor, input);

    const created = await this.repository.create({
      organizationId: actor.organizationId,
      clientOrganizationId,
      projectId: input.projectId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      ticketId: input.ticketId ?? null,
      type: input.type,
      status: 'DRAFT',
      title: input.title?.trim() || defaultTitle(input.type, periodStart, periodEnd),
      periodStart,
      periodEnd,
      isDraftOutput: true,
      createdById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.AI_SUMMARY_GENERATED,
      entityType: AUDIT_ENTITY_TYPE.AI_SUMMARY,
      entityId: created.id,
      organizationId: actor.organizationId,
      after: { type: input.type, status: 'DRAFT' },
    });

    return created;
  }

  /**
   * Runs generation now, in the request.
   *
   * The queued path calls the same method; the difference is only who waits. Both claim the
   * summary first, so a queued job and an impatient second click cannot run at once.
   */
  async generate(actor: AuthenticatedUser, id: string, attempt = 1): Promise<GenerationOutcome> {
    const current = await this.detail(actor, id);

    if (current.status === 'GENERATING') {
      throw new ConflictException('This summary is already being generated');
    }
    if (!isSummaryEditable(current.status)) {
      throw new ConflictException(
        `A summary that is ${current.status} cannot be regenerated. Return it to draft first.`,
      );
    }

    // The claim comes first, so the loser of a race writes nothing. Archiving before it would
    // leave a spurious version row behind every rejected attempt.
    const claimed = await this.repository.claimForGeneration(id, actor.organizationId);
    if (!claimed) {
      throw new ConflictException('This summary is already being generated');
    }

    // Keep what is there before overwriting it, so a regeneration never destroys a draft someone
    // has already edited by hand.
    if (current.internalContent || current.clientContent) {
      await this.repository.archiveVersion(current, actor.userId, 'Replaced by a regeneration');
    }

    const outcome = await this.generation.run(
      {
        summaryId: id,
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        type: current.type,
        clientOrganizationId: current.clientOrganizationId,
        projectId: current.projectId,
        subjectUserId: current.subjectUserId,
        ticketId: current.ticketId,
        subject: subjectOf(current),
        periodStart: current.periodStart,
        periodEnd: exclusiveEnd(current.periodEnd),
      },
      attempt,
    );

    if (!outcome.ok) {
      await this.auditLog.record({
        action: AUDIT_ACTION.AI_SUMMARY_FAILED,
        entityType: AUDIT_ENTITY_TYPE.AI_SUMMARY,
        entityId: id,
        organizationId: actor.organizationId,
        after: { status: outcome.status },
      });
    }

    return outcome;
  }

  /** Edits the text by hand. Only while the summary is still being written. */
  async edit(
    actor: AuthenticatedUser,
    id: string,
    input: { title?: string; internalContent?: string; clientContent?: string },
  ): Promise<AiSummaryDetailRow> {
    const current = await this.detail(actor, id);
    if (!isSummaryEditable(current.status)) {
      throw new ConflictException(`A summary that is ${current.status} cannot be edited`);
    }
    if (input.clientContent !== undefined && !isClientFacingSummary(current.type)) {
      throw new BadRequestException(
        'This summary type is internal, so it has no client version to write',
      );
    }

    await this.repository.archiveVersion(current, actor.userId, 'Edited by hand');
    await this.repository.update(id, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.internalContent !== undefined
        ? { internalContent: input.internalContent.trim() || null }
        : {}),
      ...(input.clientContent !== undefined
        ? { clientContent: input.clientContent.trim() || null }
        : {}),
      version: { increment: 1 },
    });

    return this.detail(actor, id);
  }

  /**
   * Moves the summary through the workflow.
   *
   * Every action funnels through here so the permission check, the state check and the audit
   * entry cannot be forgotten for one of them.
   */
  async transition(
    actor: AuthenticatedUser,
    id: string,
    action: AiSummaryAction,
    note?: string,
  ): Promise<AiSummaryDetailRow> {
    const current = await this.detail(actor, id);
    const check = checkAiSummaryAction(
      action,
      current.status,
      current.type,
      actor.permissions,
      note,
    );

    if (!check.ok) {
      if (check.reason === 'permission') {
        throw new ForbiddenException(check.message);
      }
      if (check.reason === 'state' || check.reason === 'not-client-facing') {
        throw new ConflictException(check.message);
      }
      throw new BadRequestException(check.message);
    }

    if (action === 'publish' && !current.clientContent?.trim()) {
      throw new ConflictException(
        'There is no client version to publish. Write one and have it approved first.',
      );
    }

    const now = new Date();
    await this.repository.update(id, {
      status: check.to,
      ...(action === 'submit' ? { submittedById: actor.userId, submittedAt: now } : {}),
      ...(action === 'approve'
        ? {
            approvedById: actor.userId,
            approvedAt: now,
            // Approval is what stops it being a draft. Nothing else clears this flag.
            isDraftOutput: false,
            reviewNote: null,
          }
        : {}),
      ...(action === 'requestChanges' ? { reviewNote: note ?? null, isDraftOutput: true } : {}),
      ...(action === 'publish' ? { publishedById: actor.userId, publishedAt: now } : {}),
      ...(action === 'cancel' ? { cancelReason: note ?? null } : {}),
      ...(action === 'returnToDraft'
        ? { isDraftOutput: true, approvedById: null, approvedAt: null, cancelReason: null }
        : {}),
    });

    await this.auditLog.record({
      action: auditActionFor(action),
      entityType: AUDIT_ENTITY_TYPE.AI_SUMMARY,
      entityId: id,
      organizationId: actor.organizationId,
      before: { status: current.status },
      after: { status: check.to, ...(note ? { note } : {}) },
    });

    return this.detail(actor, id);
  }

  async usage(actor: AuthenticatedUser, from: Date, to: Date): Promise<AiUsageTotals> {
    const runs = await this.repository.usage(actor.organizationId, from, to);
    return summariseUsage(runs, from, to);
  }
}
