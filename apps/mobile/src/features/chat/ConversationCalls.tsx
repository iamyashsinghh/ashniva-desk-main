import {
  COMMUNICATION_REFUSAL,
  COMMUNICATION_REFUSAL_LABELS,
  CONVERSATION_KIND,
  isScopeKind,
  type CallRecordingAccess,
  type ConversationCallSummary,
  type ConversationDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Divider } from '../../shared/components/primitives';
import { formatDateTime, formatDuration } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';

/**
 * Calling somebody from a conversation, and what was called before.
 *
 * Every gate here is the server's. `abilities.canCall` decides whether the button exists at all,
 * and `canPlayRecording` — computed per call, per caller, by the same decision function the API
 * enforces with — decides whether a recording can be reached. Neither is inferred from a role or
 * a permission held on the device: a recording is a colleague's voice, and "probably allowed" is
 * not a standard to play one on.
 *
 * A group conversation needs to know who to ring; a direct one already does. That is why the
 * button is a list of people for the open kinds and a single button for `DIRECT`.
 *
 * **Telephony stays project-anchored.** A scope direct message and a group have no project, and
 * everything an internal call needs comes from one — the fallback destination, the recording
 * playback scope, the roles that decide both — so `POST /conversations/:id/calls` refuses them
 * outright. `abilities.canCall` can still come back true there, which is why this asks about the
 * kind rather than only about the ability: a list of "call this person" buttons that every one of
 * them answers 400 to is worse than a sentence saying where calls come from.
 */
export function ConversationCalls({ conversation }: { conversation: ConversationDetail }) {
  const theme = useTheme();
  const { user } = useSession();
  const viewerId = user?.id ?? null;
  const [playError, setPlayError] = useState<string | null>(null);
  const isScope = isScopeKind(conversation.kind);

  const history = useResource<ConversationCallSummary[]>(
    ['conversations', conversation.id, 'calls'],
    `/conversations/${conversation.id}/calls`,
    { enabled: conversation.abilities.canCall && !isScope },
  );

  const call = useApiMutation<{ withUserId?: string }, ConversationCallSummary>({
    path: `/conversations/${conversation.id}/calls`,
    body: (variables) => variables,
    invalidate: [['conversations', conversation.id, 'calls']],
  });

  if (isScope) {
    return (
      <Card>
        {/* The API's own sentence for this refusal, not a paraphrase: `canCall` can still come
            back true for a scope conversation, and `POST /conversations/:id/calls` answers it
            with exactly this. A row of buttons that every one of them refuses would be worse
            than saying where calls come from. */}
        <AppText size="xs" tone="faint">
          {COMMUNICATION_REFUSAL_LABELS[COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT]}
        </AppText>
      </Card>
    );
  }

  if (!conversation.abilities.canCall) {
    return null;
  }

  const isDirect = conversation.kind === CONVERSATION_KIND.DIRECT;
  // A call needs a person, and for the open kinds the API requires the app to name one. Everybody
  // on the thread but you is the honest list; whether any of them may actually be rung is still
  // the API's answer, given when the call is placed.
  const others = conversation.participants.filter((participant) => participant.id !== viewerId);

  /** Fetches the short-lived URL and hands it to the system, which knows how to play audio. */
  const play = async (callId: string) => {
    setPlayError(null);
    try {
      const access = await apiRequest<CallRecordingAccess>(
        `/conversations/calls/${callId}/recording`,
      );
      await Linking.openURL(access.url);
    } catch (cause) {
      setPlayError(errorMessage(cause));
    }
  };

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Calls
      </AppText>

      {isDirect && conversation.counterpart ? (
        <Button
          label={`Call ${conversation.counterpart.name}`}
          loading={call.busy}
          accessibilityHint="Rings them through Ashniva IVR"
          onPress={() => void call.run({})}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="xs" tone="faint">
            Who should be rung?
          </AppText>
          {others.map((participant) => (
            <Button
              key={participant.id}
              label={`Call ${participant.name}`}
              variant="secondary"
              loading={call.busy}
              onPress={() => void call.run({ withUserId: participant.id })}
            />
          ))}
        </View>
      )}

      {call.error ? (
        <AppText tone="danger" size="sm">
          {call.error}
        </AppText>
      ) : null}

      {(history.data ?? []).map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText size="sm">
            {formatDateTime(entry.startedAt)} · {entry.status.toLowerCase()} ·{' '}
            {formatDuration(entry.durationSeconds)}
          </AppText>
          <AppText size="xs" tone="faint">
            {entry.initiatedBy ? `Started by ${entry.initiatedBy.name}` : 'Started by the system'}
          </AppText>
          {entry.hasRecording && entry.canPlayRecording ? (
            <Button
              label="Play the recording"
              variant="secondary"
              accessibilityHint="Opens the recording. Every playback is audited."
              onPress={() => void play(entry.id)}
            />
          ) : null}
          {entry.hasRecording && !entry.canPlayRecording ? (
            <AppText size="xs" tone="faint">
              Recorded. You are not permitted to play it.
            </AppText>
          ) : null}
        </View>
      ))}

      {playError ? (
        <AppText tone="danger" size="sm">
          {playError}
        </AppText>
      ) : null}
    </Card>
  );
}
