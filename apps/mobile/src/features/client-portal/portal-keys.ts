/**
 * Query keys for the client's portal screens.
 *
 * Everything sits under `['portal']`, the prefix the other portal screens and the ticket actions
 * already invalidate, so a write anywhere in the portal refreshes what a client is looking at.
 */
export const portalKeys = {
  all: ['portal'] as const,
  projects: ['portal', 'projects'] as const,
  project: (id: string) => ['portal', 'projects', id] as const,
  progress: (id: string) => ['portal', 'projects', id, 'progress'] as const,
  plan: (id: string) => ['portal', 'projects', id, 'plan'] as const,
  contracts: ['portal', 'contracts'] as const,
  contract: (id: string) => ['portal', 'contracts', id] as const,
  changeRequests: ['portal', 'change-requests'] as const,
  changeRequestList: (filters: { status: string; search: string }) =>
    ['portal', 'change-requests', 'list', filters] as const,
  changeRequest: (id: string) => ['portal', 'change-requests', id] as const,
  reportTypes: ['portal', 'reports'] as const,
  report: (type: string, from: string | null, to: string | null) =>
    ['portal', 'reports', type, { from, to }] as const,
  /** The same key the Updates tab pages summaries with, so both screens share one cache entry. */
  summaries: ['portal', 'ai-summaries'] as const,
  summary: (id: string) => ['portal', 'ai-summaries', 'detail', id] as const,
};
