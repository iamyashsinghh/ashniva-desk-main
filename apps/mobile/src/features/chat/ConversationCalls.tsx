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
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider } from '../../shared/components/primitives';
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
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
        {/* The API's own sentence for this refusal, not a paraphrase: `canCall` can still come
            back true for a scope conversation, and `POST /conversations/:id/calls` answers it
            with exactly this. A row of buttons that every one of them refuses would be worse
            than saying where calls come from. */}
        <AppText size="xs" tone="faint" align="center">
          {COMMUNICATION_REFUSAL_LABELS[COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT]}
        </AppText>
      </View>
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

  const entries = history.data ?? [];

  return (
    <Section
      title="Calls"
      count={entries.length > 0 ? entries.length : undefined}
      style={{ marginTop: theme.spacing.sm }}
    >
      {isDirect && conversation.counterpart ? (
        <Button
          label={`Call ${conversation.counterpart.name}`}
          size="sm"
          loading={call.busy}
          accessibilityHint="Rings them through Ashniva IVR"
          onPress={() => void call.run({})}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="xs" tone="muted">
            Who should be rung?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {others.map((participant) => (
              <Button
                key={participant.id}
                label={`Call ${participant.name}`}
                variant="secondary"
                size="sm"
                loading={call.busy}
                onPress={() => void call.run({ withUserId: participant.id })}
              />
            ))}
          </View>
        </View>
      )}

      {call.error ? (
        <Banner tone="danger" role="alert">
          {call.error}
        </Banner>
      ) : null}

      {entries.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium">
                {formatDateTime(entry.startedAt)} · {entry.status.toLowerCase()} ·{' '}
                {formatDuration(entry.durationSeconds)}
              </AppText>
              <AppText size="xs" tone="faint">
                {entry.initiatedBy
                  ? `Started by ${entry.initiatedBy.name}`
                  : 'Started by the system'}
              </AppText>
            </View>
            {entry.hasRecording && entry.canPlayRecording ? (
              <Button
                label="Play the recording"
                variant="ghost"
                size="sm"
                accessibilityHint="Opens the recording. Every playback is audited."
                onPress={() => void play(entry.id)}
              />
            ) : null}
          </View>
          {entry.hasRecording && !entry.canPlayRecording ? (
            <AppText size="xs" tone="faint">
              Recorded. You are not permitted to play it.
            </AppText>
          ) : null}
        </View>
      ))}

      {playError ? (
        <Banner tone="danger" role="alert">
          {playError}
        </Banner>
      ) : null}
    </Section>
  );
}
