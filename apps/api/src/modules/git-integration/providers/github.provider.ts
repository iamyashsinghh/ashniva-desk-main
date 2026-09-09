import { Injectable } from '@nestjs/common';
import type { ValidationResult } from '@ashniva/types';

import { SafeHttpService } from '../../../infrastructure/http/safe-http.service';

import { redactMessage } from '../../integrations/redact';
import { parseGithubEvent, type ParsedCodeActivity } from '../event-parser';
import { headerValue, verifyHmacSha256 } from '../../../common/crypto/webhook-signature';
import type {
  GitProviderAdapter,
  GitWebhookRequest,
  ProviderRepository,
} from './git-provider.interface';

const DEFAULT_API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

/**
 * GitHub adapter. Uses the REST API with a stored token; nothing here is called during tests,
 * which drive the pure parsing and verification functions directly and never reach the network.
 */
@Injectable()
export class GithubProvider implements GitProviderAdapter {
  readonly provider = 'GITHUB' as const;

  constructor(private readonly http: SafeHttpService) {}

  isConfigured(): boolean {
    // A stored per-tenant token is enough; the App credentials are only needed for the
    // installation flow, which is why this does not require them.
    return true;
  }

  async validate(credential: string, settings: Record<string, unknown>): Promise<ValidationResult> {
    try {
      const response = await this.call(credential, settings, '/user');
      if (!response.ok) {
        return { ok: false, message: `GitHub rejected the token (HTTP ${response.status})` };
      }
      const body = (await response.json()) as { login?: string };
      const scopes = response.headers.get('x-oauth-scopes');
      return {
        ok: true,
        message: 'Token accepted by GitHub',
        accountLabel: body.login,
        scopes: scopes
          ? scopes
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [],
      };
    } catch (error) {
      return { ok: false, message: redactMessage(error) };
    }
  }

  async listRepositories(
    credential: string,
    settings: Record<string, unknown>,
  ): Promise<ProviderRepository[]> {
    const response = await this.call(credential, settings, '/user/repos?per_page=100&sort=updated');
    if (!response.ok) {
      throw new Error(`GitHub returned HTTP ${response.status}`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    return rows.map((row) => ({
      externalRepoId: String(row.id ?? ''),
      owner: String((row.owner as { login?: string } | undefined)?.login ?? ''),
      name: String(row.name ?? ''),
      defaultBranch: String(row.default_branch ?? 'main'),
      url: String(row.html_url ?? ''),
      private: row.private === true,
    }));
  }

  verifyWebhook(request: GitWebhookRequest, secret: string): boolean {
    return verifyHmacSha256(
      request.rawBody,
      headerValue(request.headers, 'x-hub-signature-256'),
      secret,
    );
  }

  eventTypeOf(request: GitWebhookRequest): string {
    return headerValue(request.headers, 'x-github-event') ?? 'unknown';
  }

  repositoryIdOf(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) {
      return undefined;
    }
    const repository = (body as { repository?: { id?: unknown } }).repository;
    return repository?.id === undefined ? undefined : String(repository.id);
  }

  parseEvent(eventType: string, body: unknown): ParsedCodeActivity[] {
    return parseGithubEvent(eventType, body);
  }

  private call(
    credential: string,
    settings: Record<string, unknown>,
    path: string,
  ): Promise<Response> {
    const base = typeof settings.baseUrl === 'string' ? settings.baseUrl : DEFAULT_API;
    // `baseUrl` is operator-supplied, for GitHub Enterprise. It goes through the shared guard, so
    // a base URL pointing inside the network is refused before the token is sent anywhere.
    return this.http.fetch(`${base}${path}`, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Ashniva-Desk',
      },
      timeoutMs: TIMEOUT_MS,
    });
  }
}
