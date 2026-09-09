import { BadRequestException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  type AiGenerationStatus,
  type AiSummaryType,
  type AiUsageTotals,
} from '@ashniva/types';

import type { AiSummaryAction } from './ai-summary-workflow';
import type { AiSummaryDetailRow } from './ai-summaries.repository';

/**
 * Small pieces the summary service uses, kept apart so the service reads as workflow.
 *
 * The usage roll-up is a pure function over run rows: no database, no clock, so what it counts
 * can be checked by reading it.
 */

export interface UsageRun {
  status: AiGenerationStatus;
  providerName: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
}

export function summariseUsage(runs: readonly UsageRun[], from: Date, to: Date): AiUsageTotals {
  const byProvider = new Map<
    string,
    { providerName: string; runs: number; inputTokens: number; outputTokens: number }
  >();
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let succeeded = 0;

  for (const run of runs) {
    const entry = byProvider.get(run.providerName) ?? {
      providerName: run.providerName,
      runs: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    entry.runs += 1;
    entry.inputTokens += run.inputTokens ?? 0;
    entry.outputTokens += run.outputTokens ?? 0;
    byProvider.set(run.providerName, entry);

    inputTokens += run.inputTokens ?? 0;
    outputTokens += run.outputTokens ?? 0;
    if (run.latencyMs !== null) {
      latencyTotal += run.latencyMs;
      latencyCount += 1;
    }
    if (run.status === 'SUCCEEDED') {
      succeeded += 1;
    }
  }

  return {
    from: day(from),
    to: day(to),
    runs: runs.length,
    succeeded,
    failed: runs.length - succeeded,
    inputTokens,
    outputTokens,
    averageLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : null,
    byProvider: [...byProvider.values()],
  };
}

export function auditActionFor(action: AiSummaryAction) {
  switch (action) {
    case 'approve':
      return AUDIT_ACTION.AI_SUMMARY_APPROVED;
    case 'publish':
      return AUDIT_ACTION.AI_SUMMARY_PUBLISHED;
    case 'cancel':
      return AUDIT_ACTION.AI_SUMMARY_CANCELLED;
    default:
      return AUDIT_ACTION.AI_SUMMARY_GENERATED;
  }
}

export function subjectOf(row: AiSummaryDetailRow): string {
  return row.subjectUser?.name ?? row.project?.code ?? row.clientOrganization?.name ?? 'the team';
}

export function parseDay(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} is not a date`);
  }
  return date;
}

/** Stored periods are inclusive; the queries want a half-open window. */
export function exclusiveEnd(periodEnd: Date): Date {
  const date = new Date(periodEnd);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function defaultTitle(type: AiSummaryType, start: Date, end: Date): string {
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const label = type
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^./, (char) => char.toUpperCase());
  return from === to ? `${label} — ${from}` : `${label} — ${from} to ${to}`;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
