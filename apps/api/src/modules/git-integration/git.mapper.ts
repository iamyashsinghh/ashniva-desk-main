import type {
  CodeActivityKind,
  CodeActivitySummary,
  IntegrationProvider,
  RepositoryLinkSummary,
  SyncStatus,
} from '@ashniva/types';

import type { CodeActivityRow, RepositoryLinkRow } from './git.repository';

/** Allow-list mappers; the rows carry provider ids and internal columns a spread would expose. */
export function toRepositoryLinkSummary(row: RepositoryLinkRow): RepositoryLinkSummary {
  return {
    id: row.id,
    provider: row.provider as IntegrationProvider,
    projectId: row.projectId,
    projectCode: row.project.code,
    externalRepoId: row.externalRepoId,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.defaultBranch,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus as SyncStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCodeActivitySummary(row: CodeActivityRow): CodeActivitySummary {
  return {
    id: row.id,
    kind: row.kind as CodeActivityKind,
    externalId: row.externalId,
    title: row.title,
    authorName: row.authorName,
    url: row.url,
    branch: row.branch,
    state: row.state,
    occurredAt: row.occurredAt.toISOString(),
    taskId: row.taskId,
  };
}
