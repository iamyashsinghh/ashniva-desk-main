import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type IntegrationProvider,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import { IntegrationsRepository } from '../integrations/integrations.repository';
import { IntegrationsService } from '../integrations/integrations.service';
import { redactMessage } from '../integrations/redact';
import type { ParsedCodeActivity } from './event-parser';
import { GitRepository, type CodeActivityRow, type RepositoryLinkRow } from './git.repository';
import { groupReferences } from './task-references';
import { deliveryId } from '../../common/crypto/webhook-signature';
import {
  GIT_PROVIDERS,
  type GitProviderAdapter,
  type GitWebhookRequest,
  type ProviderRepository,
} from './providers/git-provider.interface';

type GitProviderKey = 'GITHUB' | 'GITLAB';

/** What the webhook controller needs back, so it can answer without knowing the details. */
export type WebhookOutcome =
  { status: 'accepted' } | { status: 'duplicate' } | { status: 'rejected'; reason: string };

@Injectable()
export class GitService {
  constructor(
    private readonly repository: GitRepository,
    private readonly integrations: IntegrationsService,
    private readonly integrationEvents: IntegrationsRepository,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
    @Inject(GIT_PROVIDERS) private readonly adapters: GitProviderAdapter[],
    private readonly visibility: TaskVisibilityService,
  ) {
    this.logger.setContext(GitService.name);
  }

  // -------------------------------------------------------------------------------------------
  // Repositories
  // -------------------------------------------------------------------------------------------

  /** Repositories the stored credential can see, for the "link a repository" picker. */
  async available(
    actor: AuthenticatedUser,
    provider: GitProviderKey,
  ): Promise<ProviderRepository[]> {
    const adapter = this.adapterFor(provider);
    const connection = await this.integrations.credentialFor(actor.organizationId, provider);
    if (!connection) {
      throw new BadRequestException(`${provider} is not connected for this organization`);
    }
    try {
      return await adapter.listRepositories(connection.credential, connection.settings);
    } catch (error) {
      const message = redactMessage(error);
      await this.integrations.recordSync(connection.connectionId, { ok: false, error: message });
      throw new ServiceUnavailableException(`Could not reach ${provider}: ${message}`);
    }
  }

  listForProject(actor: AuthenticatedUser, projectId: string): Promise<RepositoryLinkRow[]> {
    return this.repository.listForProject(actor.organizationId, projectId);
  }

  async link(
    actor: AuthenticatedUser,
    projectId: string,
    input: {
      provider: GitProviderKey;
      externalRepoId: string;
      owner: string;
      name: string;
      defaultBranch?: string;
    },
  ): Promise<RepositoryLinkRow> {
    const connection = await this.integrations.credentialFor(actor.organizationId, input.provider);
    if (!connection) {
      throw new BadRequestException(`${input.provider} is not connected for this organization`);
    }

    const row = await this.repository.create({
      organizationId: actor.organizationId,
      projectId,
      connectionId: connection.connectionId,
      provider: input.provider,
      externalRepoId: input.externalRepoId,
      owner: input.owner,
      name: input.name,
      defaultBranch: input.defaultBranch ?? 'main',
      linkedById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.REPOSITORY_LINKED,
      entityType: AUDIT_ENTITY_TYPE.REPOSITORY,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { provider: input.provider, owner: input.owner, name: input.name, projectId },
    });

    return row;
  }

  async unlink(actor: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.repository.findById(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Repository link not found');
    }
    await this.repository.softDelete(id);
    await this.auditLog.record({
      action: AUDIT_ACTION.REPOSITORY_UNLINKED,
      entityType: AUDIT_ENTITY_TYPE.REPOSITORY,
      entityId: id,
      organizationId: actor.organizationId,
      before: { provider: row.provider, owner: row.owner, name: row.name },
    });
  }

  async activityForTask(actor: AuthenticatedUser, taskId: string): Promise<CodeActivityRow[]> {
    return this.repository.activityForTask(
      actor.organizationId,
      taskId,
      await this.visibility.taskWhere(actor),
    );
  }

  activityForProject(
    actor: AuthenticatedUser,
    projectId: string,
    limit = 50,
  ): Promise<CodeActivityRow[]> {
    return this.repository.activityForProject(actor.organizationId, projectId, limit);
  }

  // -------------------------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------------------------

  /**
   * Handles one inbound webhook, in a fixed order that the security depends on:
   *
   *   1. find every repository link naming that repository — two tenants may both have linked it,
   *      and a webhook carries no session to tell them apart;
   *   2. verify the signature over the raw bytes against each candidate tenant's secret; the one
   *      that verifies is the tenant, and if none does the delivery is not ours;
   *   3. record the event, whose unique index rejects a redelivery;
   *   4. only then parse and store anything.
   *
   * Nothing writes until the signature has verified. An unverified delivery is logged and
   * dropped: recording it would let anyone who knows a public repository id append rows, with
   * attacker-chosen text, to a tenant's data.
   */
  async handleWebhook(
    provider: GitProviderKey,
    request: GitWebhookRequest,
    body: unknown,
  ): Promise<WebhookOutcome> {
    const adapter = this.adapterFor(provider);
    const eventType = adapter.eventTypeOf(request);
    const payloadDigest = createHash('sha256').update(request.rawBody).digest('hex');
    const externalEventId = deliveryId(request.headers, payloadDigest);

    const externalRepoId = adapter.repositoryIdOf(body);
    const candidates = externalRepoId
      ? await this.repository.findAllByExternalRepo(provider, externalRepoId)
      : [];

    if (candidates.length === 0) {
      // Nothing is recorded: without a link there is no tenant to record it against, and an
      // unauthenticated caller must not be able to write rows by inventing repository ids.
      return { status: 'rejected', reason: 'unknown repository' };
    }

    let link: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      const secret = await this.integrations.webhookSecretFor(candidate.organizationId, provider);
      if (secret && adapter.verifyWebhook(request, secret)) {
        link = candidate;
        break;
      }
    }

    if (!link) {
      this.logger.warn(
        { provider, eventType, externalRepoId, candidates: candidates.length },
        'Webhook signature did not verify against any linked tenant',
      );
      return { status: 'rejected', reason: 'signature' };
    }

    const event = await this.integrationEvents.recordEvent({
      organizationId: link.organizationId,
      connectionId: link.connectionId,
      provider: provider as IntegrationProvider,
      externalEventId,
      eventType,
      signatureVerified: true,
      status: 'RECEIVED',
      payloadDigest,
    });

    if (!event) {
      // The unique index caught a redelivery. Answering 202 keeps the provider from retrying.
      return { status: 'duplicate' };
    }

    try {
      const activities = adapter.parseEvent(eventType, body);
      await this.storeActivities(link, activities);
      await this.integrationEvents.markEventProcessed(event.id);
      return { status: 'accepted' };
    } catch (error) {
      const message = redactMessage(error);
      this.logger.warn({ provider, eventType, message }, 'Webhook processing failed');
      await this.integrationEvents.markEventFailed(event.id, message);
      // The delivery was genuine and is recorded; the provider does not need to retry.
      return { status: 'accepted' };
    }
  }

  /** Stores parsed activity, resolving task references inside the link's own organization. */
  async storeActivities(
    link: RepositoryLinkRow,
    activities: ParsedCodeActivity[],
  ): Promise<number> {
    if (activities.length === 0) {
      return 0;
    }

    const rows = [];
    for (const activity of activities) {
      const { numbers, keyed } = groupReferences(activity.references);
      const taskIds = await this.repository.resolveTasks(
        link.organizationId,
        link.projectId,
        numbers,
        keyed,
      );
      rows.push({
        organizationId: link.organizationId,
        repositoryLinkId: link.id,
        kind: activity.kind,
        externalId: activity.externalId,
        title: activity.title,
        authorName: activity.authorName ?? null,
        authorExternalId: activity.authorExternalId ?? null,
        url: activity.url ?? null,
        branch: activity.branch ?? null,
        state: activity.state ?? null,
        occurredAt: activity.occurredAt,
        // One activity links to at most one task: a commit that names several is recorded once
        // against the first that resolves, rather than duplicated per reference.
        taskId: taskIds[0] ?? null,
      });
    }

    return this.repository.upsertActivities(rows);
  }

  private adapterFor(provider: GitProviderKey): GitProviderAdapter {
    const adapter = this.adapters.find((entry) => entry.provider === provider);
    if (!adapter) {
      throw new ServiceUnavailableException(`No adapter is registered for ${provider}`);
    }
    return adapter;
  }
}
