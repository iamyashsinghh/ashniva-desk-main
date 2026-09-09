/**
 * Boundary for the GitHub App integration (Phase 2). One GitHub App, installed per GitHub
 * organization; short-lived installation tokens per request; least-privilege permissions.
 * Webhooks are verified with HMAC-SHA256 and deduplicated by X-GitHub-Delivery.
 */
export interface GithubInstallationRef {
  installationId: number;
  accountLogin: string;
}

export interface GithubRepositoryRef {
  fullName: string;
  defaultBranch: string;
}

export interface GithubAppClient {
  getInstallUrl(organizationId: string): string;
  listInstallationRepositories(installation: GithubInstallationRef): Promise<GithubRepositoryRef[]>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  dispatchWorkflow(input: {
    installation: GithubInstallationRef;
    repository: string;
    workflowFile: string;
    ref: string;
    inputs?: Record<string, string>;
  }): Promise<void>;
}

export const GITHUB_APP_CLIENT = Symbol('GITHUB_APP_CLIENT');

/** Task ids in branch names, commit messages and PR titles look like AD-124. */
export const TASK_REFERENCE_PATTERN = /\bAD-(\d+)\b/g;
