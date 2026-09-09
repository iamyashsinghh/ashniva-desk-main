import { Injectable } from '@nestjs/common';

import { SafeHttpService } from '../../../infrastructure/http/safe-http.service';
import type { ValidationResult } from '@ashniva/types';

import { redactMessage } from '../../integrations/redact';
import { parseGitlabEvent, type ParsedCodeActivity } from '../event-parser';
import { headerValue, verifySharedToken } from '../../../common/crypto/webhook-signature';
import type {
  GitProviderAdapter,
  GitWebhookRequest,
  ProviderRepository,
} from './git-provider.interface';

const DEFAULT_API = 'https://gitlab.com/api/v4';
const TIMEOUT_MS = 15_000;

/**
 * GitLab adapter, for gitlab.com and self-managed instances (`settings.baseUrl`).
 *
 * GitLab verifies webhooks with a shared secret sent verbatim in X-Gitlab-Token rather than an
 * HMAC, so the whole protection is the constant-time comparison in `verifySharedToken`.
 */
@Injectable()
export class GitlabProvider implements GitProviderAdapter {
  readonly provider = 'GITLAB' as const;

  constructor(private readonly http: SafeHttpService) {}

  isConfigured(): boolean {
    return true;
  }

  async validate(credential: string, settings: Record<string, unknown>): Promise<ValidationResult> {
    try {
      const response = await this.call(credential, settings, '/user');
      if (!response.ok) {
        return { ok: false, message: `GitLab rejected the token (HTTP ${response.status})` };
      }
      const body = (await response.json()) as { username?: string };
      return { ok: true, message: 'Token accepted by GitLab', accountLabel: body.username };
    } catch (error) {
      return { ok: false, message: redactMessage(error) };
    }
  }

  async listRepositories(
    credential: string,
    settings: Record<string, unknown>,
  ): Promise<ProviderRepository[]> {
    const response = await this.call(
      credential,
      settings,
      '/projects?membership=true&per_page=100&order_by=last_activity_at',
    );
    if (!response.ok) {
      throw new Error(`GitLab returned HTTP ${response.status}`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    return rows.map((row) => ({
      externalRepoId: String(row.id ?? ''),
      // GitLab's namespace is a group path, which is the closest thing to GitHub's owner.
      owner: String((row.namespace as { full_path?: string } | undefined)?.full_path ?? ''),
      name: String(row.path ?? row.name ?? ''),
      defaultBranch: String(row.default_branch ?? 'main'),
      url: String(row.web_url ?? ''),
      private: row.visibility !== 'public',
    }));
  }

  verifyWebhook(request: GitWebhookRequest, secret: string): boolean {
    return verifySharedToken(headerValue(request.headers, 'x-gitlab-token'), secret);
  }

  eventTypeOf(request: GitWebhookRequest): string {
    return headerValue(request.headers, 'x-gitlab-event') ?? 'unknown';
  }

  repositoryIdOf(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) {
      return undefined;
    }
    const payload = body as { project_id?: unknown; project?: { id?: unknown } };
    const id = payload.project_id ?? payload.project?.id;
    return id === undefined ? undefined : String(id);
  }

  parseEvent(eventType: string, body: unknown): ParsedCodeActivity[] {
    return parseGitlabEvent(eventType, body);
  }

  private call(
    credential: string,
    settings: Record<string, unknown>,
    path: string,
  ): Promise<Response> {
    const base = typeof settings.baseUrl === 'string' ? settings.baseUrl : DEFAULT_API;
    // Self-hosted GitLab is the one integration that legitimately lives on a private network for
    // some deployments. It is not special-cased here: the operator lists that host in
    // `OUTBOUND_ALLOWED_HOSTS`, which widens the rule for that host and nothing else.
    return this.http.fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
      timeoutMs: TIMEOUT_MS,
      allowInsecure: true,
    });
  }
}
