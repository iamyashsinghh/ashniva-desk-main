import type {
  AiProviderStatus,
  AiSummaryDetail,
  AiSummaryListRow,
  AiUsageTotals,
} from '@ashniva/types';

/**
 * Records for the progress summary screens' tests. Imported only by test files, so none of it
 * reaches the app bundle. The fake API itself is `apiRoutes` from the reports' test data.
 */

export function summaryRow(over: Partial<AiSummaryListRow> = {}): AiSummaryListRow {
  return {
    id: 's1',
    type: 'PROJECT_PROGRESS',
    status: 'IN_REVIEW',
    title: 'Acme portal — week 39',
    projectId: 'p1',
    projectCode: 'ACM',
    subjectUserId: null,
    subjectUserName: null,
    periodStart: '2026-09-21',
    periodEnd: '2026-09-27',
    sourceCount: 12,
    version: 2,
    generatedAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:05:00.000Z',
    ...over,
  };
}

export function summaryDetail(over: Partial<AiSummaryDetail> = {}): AiSummaryDetail {
  return {
    ...summaryRow(),
    clientOrganizationId: 'org-1',
    clientOrganizationName: 'Acme Ltd',
    ticketId: null,
    internalContent: 'Checkout slipped two days; the payment provider sandbox was down.',
    clientContent: 'Checkout is nearly finished and on track for the October release.',
    missingDataNote: null,
    reviewNote: null,
    cancelReason: null,
    isDraftOutput: true,
    providerName: 'openai-compatible',
    model: 'gpt-test',
    promptVersion: 'v3',
    outputVersion: 'v2',
    approvedByName: null,
    approvedAt: null,
    publishedByName: null,
    publishedAt: null,
    sources: [],
    versions: [],
    runs: [],
    createdAt: '2026-09-28T08:55:00.000Z',
    ...over,
  };
}

export function providerStatus(over: Partial<AiProviderStatus> = {}): AiProviderStatus {
  return {
    providerName: 'openai-compatible',
    configured: true,
    model: 'gpt-test',
    promptVersion: 'v3',
    outputVersion: 'v2',
    ...over,
  };
}

export function usageTotals(over: Partial<AiUsageTotals> = {}): AiUsageTotals {
  return {
    from: '2026-08-30',
    to: '2026-09-29',
    runs: 20,
    succeeded: 18,
    failed: 2,
    inputTokens: 42000,
    outputTokens: 9000,
    averageLatencyMs: 2400,
    byProvider: [
      { providerName: 'openai-compatible', runs: 20, inputTokens: 42000, outputTokens: 9000 },
    ],
    ...over,
  };
}
