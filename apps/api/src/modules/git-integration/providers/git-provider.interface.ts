import type { IntegrationProvider, ValidationResult } from '@ashniva/types';

import type { ParsedCodeActivity } from '../event-parser';

/** A repository as the provider describes it, before it is linked to a project. */
export interface ProviderRepository {
  externalRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  url: string;
  private: boolean;
}

export interface GitWebhookRequest {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * What a Git provider must supply. Adding GitLab alongside GitHub, or Bitbucket later, is a new
 * implementation of this interface plus a registration — no change to the service, the webhook
 * controller or the storage code.
 */
export interface GitProviderAdapter {
  readonly provider: Extract<IntegrationProvider, 'GITHUB' | 'GITLAB'>;

  isConfigured(): boolean;

  validate(credential: string, settings: Record<string, unknown>): Promise<ValidationResult>;

  listRepositories(
    credential: string,
    settings: Record<string, unknown>,
  ): Promise<ProviderRepository[]>;

  /**
   * Verifies the signature over the **raw** bytes. Must return false — never throw — for anything
   * it cannot verify, so the caller has one unambiguous answer to act on.
   */
  verifyWebhook(request: GitWebhookRequest, secret: string): boolean;

  /** The provider's own name for the event, for the audit row. */
  eventTypeOf(request: GitWebhookRequest): string;

  /** The external repository id the payload refers to, used to find the link. */
  repositoryIdOf(body: unknown): string | undefined;

  parseEvent(eventType: string, body: unknown): ParsedCodeActivity[];
}

export const GIT_PROVIDERS = Symbol('GIT_PROVIDERS');
