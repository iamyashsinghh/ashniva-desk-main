import {
  CALL_STATUS_LABELS,
  CONVERSATION_KIND,
  isScopeKind,
  type ConversationCallSummary,
  type ConversationKind,
} from '@ashniva/types';
import { Button } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useConversationCallsQuery, useConversationMutations } from '../api';

export interface ConversationCallsProps {
  conversationId: string;
  kind: ConversationKind;
  canCall: boolean;
  canPlayRecording: boolean;
  /** The other person of a direct conversation. Absent for the open kinds. */
  counterpartId?: string;
}

/**
 * The call action, and the calls this conversation has held.
 *
 * `canCall` is the server's answer and is now the *only* thing that decides whether the button
 * works. It used to be `canCall && isDirect`, which was a second opinion held locally: the server
 * already refuses a group call it cannot address, so the extra condition only managed to hide a
 * button the server was willing to honour — and to disagree with `abilities.canCall` while
 * claiming to render it.
 *
 * What remains local is *who* to ring, which is a different question. A direct conversation knows;
 * a project or task thread does not, and Desk must not choose whose telephone rings — so an open
 * thread asks rather than guessing, and the API refuses a call with no destination.
 *
 * **Telephony stays project-anchored, and this says so rather than failing.** A scope direct
 * message and a group have no project, and everything an internal call needs comes from one — the
 * fallback destination, the recording playback scope, and the roles that decide both. So
 * `POST /conversations/:id/calls` refuses them outright. That refusal is the control; what this
 * adds is that somebody reads *why* here instead of pressing a button that always answers 400.
 * The call history is not fetched for those kinds either: there can be none.
 */
export function ConversationCalls({
  conversationId,
  kind,
  canCall,
  canPlayRecording,
  counterpartId,
}: ConversationCallsProps) {
  const isScope = isScopeKind(kind);
  const calls = useConversationCallsQuery(conversationId, !isScope);
  const mutations = useConversationMutations(conversationId);
  const [error, setError] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(false);

  const isDirect = kind === CONVERSATION_KIND.DIRECT;
  const history = calls.data ?? [];
  const latest = history[0];

  if (isScope) {
    return (
      <span className="chat-call">
        <span className="timeline__note">Calls are placed from a project conversation</span>
      </span>
    );
  }

  async function start() {
    setError(undefined);
    try {
      await mutations.call.mutateAsync(counterpartId ? { withUserId: counterpartId } : {});
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  /**
   * Fetching a playable URL, once, when somebody presses play.
   *
   * Every issue of one is audited on the server and the URL is short-lived, so this is not a
   * thing to do on render or to keep in a cache.
   */
  async function play(callId: string) {
    setError(undefined);
    try {
      const access = await mutations.playRecording.mutateAsync(callId);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <span className="chat-call">
      {latest ? (
        <span className="timeline__note">
          Last call: {CALL_STATUS_LABELS[latest.status as keyof typeof CALL_STATUS_LABELS]}
        </span>
      ) : null}
      {error ? (
        <span className="inline-error" role="alert">
          {error}
        </span>
      ) : null}
      {history.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? 'Hide calls' : `Calls (${history.length})`}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={!canCall}
        disabledReason="Calling is not available here"
        onClick={() => void start()}
      >
        {isDirect ? 'Call' : 'Call somebody'}
      </Button>

      {showHistory ? (
        <ul className="chat-call__history">
          {history.map((call) => (
            <CallRow key={call.id} call={call} canPlayRecording={canPlayRecording} onPlay={play} />
          ))}
        </ul>
      ) : null}
    </span>
  );
}

/**
 * One call in the history.
 *
 * Metadata for everybody who belongs in the conversation — that a call happened, who was on it,
 * when and for how long — because hiding that would make the thread incoherent. The audio is a
 * separate decision, made on the server by `canPlayRecording`, and taking part in a call is not
 * one of the things that earns it.
 */
function CallRow({
  call,
  canPlayRecording,
  onPlay,
}: {
  call: ConversationCallSummary;
  canPlayRecording: boolean;
  onPlay: (callId: string) => Promise<void>;
}) {
  const minutes = call.durationSeconds ? Math.round(call.durationSeconds / 60) : null;
  return (
    <li className="chat-call__row">
      <span>
        {CALL_STATUS_LABELS[call.status as keyof typeof CALL_STATUS_LABELS]}
        <span className="timeline__note">
          {' '}
          · {formatDateTime(call.startedAt)}
          {minutes === null ? '' : ` · ${minutes} min`}
          {call.participants.length > 0
            ? ` · ${call.participants.map((person) => person.name).join(', ')}`
            : ''}
        </span>
      </span>
      {call.hasRecording ? (
        <Button
          variant="ghost"
          size="sm"
          // Both answers come from the server: whether this recording may be played at all, and
          // whether this caller is one of the people who may play it.
          disabled={!canPlayRecording || !call.canPlayRecording}
          disabledReason="Recordings are for project managers and team leads"
          onClick={() => void onPlay(call.id)}
        >
          Play recording
        </Button>
      ) : (
        <span className="timeline__note">No recording</span>
      )}
    </li>
  );
}
