import {
  type CallAttemptSummary,
  type CallRoutingStep,
  type CallStatus,
  type CallSummary,
  type PortalCallSummary,
  type RecordingAccessDecision,
  type RoutingRole,
} from '@ashniva/types';

import { ticketKey } from '../tickets/tickets.mapper';
import type { CallAttemptRow, CallRow } from './call-logs.repository';

/**
 * Rows into API shapes.
 *
 * Two mappers, and the split is the privacy boundary. `toCallSummary` is for internal staff and
 * carries the attempts, the people and the routing reasons. `toPortalCall` is for a client and is
 * an allow-list: it has four fields, none of which could hold a staff name, a recording, or why
 * anybody was passed over. A future edit that forgets to redact something cannot leak through it,
 * because there is nowhere for the something to go.
 *
 * `recordingRef` is mapped by neither. It is fetched by its own endpoint, which runs the access
 * decision and writes an audit row first.
 */
export function toCallSummary(row: CallRow, recording: RecordingAccessDecision): CallSummary {
  return {
    id: row.id,
    ticketId: row.ticketId,
    // Null for an internal call: package 9b's calls belong to a conversation, and this mapper
    // serves the ticket screen, which only ever sees the support ones.
    ticketKey: row.ticket ? ticketKey(row.ticket) : null,
    status: row.status as CallStatus,
    providerDisposition: row.providerDisposition,
    providerKey: row.providerKey,
    initiatedBy: row.initiatedBy,
    connectedTo: row.connectedUser,
    requesterName: row.requester?.name ?? row.externalRequester?.name ?? null,
    requestedAt: row.requestedAt.toISOString(),
    connectedAt: row.connectedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    hasRecording: row.recordingRef !== null,
    recordingReadyAt: row.recordingReadyAt?.toISOString() ?? null,
    canPlayRecording: recording.allowed,
    recordingDenialReason: recording.reason,
    queueReason: row.queueReason,
    attempts: row.attempts.map(toAttemptSummary),
  };
}

export function toAttemptSummary(row: CallAttemptRow): CallAttemptSummary {
  return {
    id: row.id,
    sequence: row.sequence,
    step: row.step as CallRoutingStep,
    role: (row.routingRole as RoutingRole | null) ?? null,
    target: row.target,
    status: row.status as CallStatus,
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

/**
 * What a client is told about a call on their own ticket.
 *
 * That it happened, when, whether it connected and how long it lasted. Not who took it, not what
 * was tried first, not that a recording exists. Their own history, and nothing about how the
 * provider organises itself to answer it.
 */
export function toPortalCall(row: CallRow): PortalCallSummary {
  return {
    id: row.id,
    requestedAt: row.requestedAt.toISOString(),
    status: row.status as CallStatus,
    durationSeconds: row.durationSeconds,
  };
}
