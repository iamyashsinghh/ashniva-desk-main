import {
  CALL_ROUTING_STEP_LABELS,
  CALL_STATUS_LABELS,
  PERMISSIONS,
  RECORDING_DENIAL_REASON_LABELS,
  type CallSummary,
  type TicketDetail,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useCallAvailabilityQuery, useCallMutations, useTicketCallsQuery } from '../api';

import '../calls.css';

export interface TicketCallsCardProps {
  ticket: TicketDetail;
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CONNECTED: 'success',
  COMPLETED: 'success',
  RINGING: 'warning',
  REQUESTED: 'warning',
  NO_ANSWER: 'danger',
  BUSY: 'danger',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

/**
 * Support calls on a ticket: starting one, and what happened to the ones before.
 *
 * The whole card is behind `call:read-internal`, because the history names which colleague took
 * the call and which ones were rung first. Whether the Call Support button appears is the
 * server's answer, not this component's guess — `availability` returns both the decision and the
 * sentence for the disabled control, so the screen and the endpoint cannot disagree about who may
 * start a call.
 *
 * Playing a recording is a separate permission again, and even holding it is not enough: the
 * server decides per call, per product policy and per project, and returns `canPlayRecording`
 * with a reason. Nothing here is a control — it is the rendering of a decision made elsewhere.
 */
export function TicketCallsCard({ ticket }: TicketCallsCardProps) {
  const canRead = usePermission(PERMISSIONS.CALL_READ_INTERNAL);
  const availability = useCallAvailabilityQuery(ticket.id);
  const calls = useTicketCallsQuery(ticket.id, canRead);
  const mutations = useCallMutations(ticket.id);
  const [error, setError] = useState<string | undefined>();

  if (!canRead) {
    return null;
  }

  const run = async (work: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const canCall = availability.data?.enabled ?? false;
  const rows = calls.data ?? [];

  return (
    <Card
      title="Support calls"
      headerAddon={
        <Button
          variant="primary"
          size="sm"
          disabled={!canCall}
          disabledReason={availability.data?.reason ?? 'Support calls are not available'}
          onClick={() => void run(() => mutations.initiate.mutateAsync({}))}
        >
          Call support
        </Button>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No calls yet"
          description="A support call started here is routed to whoever is handling the ticket."
        />
      ) : (
        <ul className="call-list">
          {rows.map((call) => (
            <CallRow
              key={call.id}
              call={call}
              onPlay={() =>
                void run(async () => {
                  const access = await mutations.playRecording.mutateAsync(call.id);
                  window.open(access.url, '_blank', 'noopener,noreferrer');
                })
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CallRow({ call, onPlay }: { call: CallSummary; onPlay: () => void }) {
  return (
    <li className="call-list__item">
      <div className="call-list__head">
        <Badge tone={TONE[call.status] ?? 'neutral'}>{CALL_STATUS_LABELS[call.status]}</Badge>
        <span>{formatDateTime(call.requestedAt)}</span>
        <span className="muted">
          {call.durationSeconds === null ? '—' : formatDuration(call.durationSeconds)}
        </span>
      </div>
      <DescriptionList items={callItems(call)} />

      {call.attempts.length > 1 ? (
        <ol className="call-list__attempts">
          {call.attempts.map((attempt) => (
            <li key={attempt.id}>
              <span className="call-list__step">{CALL_ROUTING_STEP_LABELS[attempt.step]}</span>{' '}
              {attempt.target?.name ?? 'nobody'} —{' '}
              {CALL_STATUS_LABELS[attempt.status].toLowerCase()}
              <span className="timeline__note"> · {attempt.reason}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <RecordingControl call={call} onPlay={onPlay} />
    </li>
  );
}

function RecordingControl({ call, onPlay }: { call: CallSummary; onPlay: () => void }) {
  if (!call.hasRecording) {
    return null;
  }
  if (!call.canPlayRecording) {
    return (
      <p className="muted call-list__recording">
        A recording exists.{' '}
        {call.recordingDenialReason
          ? RECORDING_DENIAL_REASON_LABELS[call.recordingDenialReason]
          : 'You may not play it.'}
      </p>
    );
  }
  return (
    <div className="call-list__recording">
      <Button variant="ghost" size="sm" onClick={onPlay}>
        Play recording
      </Button>
      <span className="muted"> · every playback is recorded in the audit log</span>
    </div>
  );
}

/** A call's rows. The last two exist only when the provider said something about the call. */
function callItems(call: CallSummary): DescriptionItem[] {
  const items: DescriptionItem[] = [
    { key: 'started-by', term: 'Started by', description: call.initiatedBy?.name ?? 'The system' },
    { key: 'connected-to', term: 'Connected to', description: call.connectedTo?.name ?? 'Nobody' },
  ];
  if (call.providerDisposition) {
    items.push({
      key: 'provider-outcome',
      term: 'Provider outcome',
      description: call.providerDisposition,
    });
  }
  if (call.queueReason) {
    items.push({ key: 'queue-reason', term: 'Why it ended', description: call.queueReason });
  }
  return items;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest}s` : `${minutes}m ${rest}s`;
}
