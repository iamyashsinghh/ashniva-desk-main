import {
  CALL_STATUS_LABELS,
  COMMUNICATION_REFUSAL,
  COMMUNICATION_REFUSAL_LABELS,
  CONVERSATION_KIND,
  isScopeKind,
  type CallRecordingAccess,
  type CallStatus,
  type ConversationCallSummary,
  type ConversationDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { Icon, IconTile } from '../../shared/components/Icon';
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
export function ConversationCalls({
  conversation,
  showWhenEmpty = false,
}: {
  conversation: ConversationDetail;
  /** Say so when there is nothing to place and nothing placed, rather than draw nothing. */
  showWhenEmpty?: boolean;
}) {
  const theme = useTheme();
  const { user } = useSession();
  const viewerId = user?.id ?? null;
  const [playError, setPlayError] = useState<string | null>(null);
  const isScope = isScopeKind(conversation.kind);

  // Asked whether or not this reader may call: that a call happened, who was on it and for how
  // long is part of the thread for everybody in it, as on the web. Only the scope kinds are
  // skipped — they cannot have held one.
  const history = useResource<ConversationCallSummary[]>(
    ['conversations', conversation.id, 'calls'],
    `/conversations/${conversation.id}/calls`,
    { enabled: !isScope },
  );

  const call = useApiMutation<{ withUserId?: string }, ConversationCallSummary>({
    path: `/conversations/${conversation.id}/calls`,
    body: (variables) => variables,
    invalidate: [['conversations', conversation.id, 'calls']],
  });

  if (isScope) {
    return (
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 6,
          justifyContent: 'center',
          paddingVertical: theme.spacing.sm,
        }}
      >
        <Icon name="call-outline" size={12} color={theme.colors.textFaint} />
        {/* The API's own sentence for this refusal, not a paraphrase: `canCall` can still come
            back true for a scope conversation, and `POST /conversations/:id/calls` answers it
            with exactly this. A row of buttons that every one of them refuses would be worse
            than saying where calls come from. */}
        <AppText size="xs" tone="faint" align="center" style={{ flexShrink: 1 }}>
          {COMMUNICATION_REFUSAL_LABELS[COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT]}
        </AppText>
      </View>
    );
  }

  const entries = history.data ?? [];
  const canCall = conversation.abilities.canCall;
  // Nothing to place and nothing placed before: a section saying so would only take room.
  if (!canCall && entries.length === 0) {
    return showWhenEmpty ? (
      <AppText size="sm" tone="muted">
        {history.isLoading ? 'Loading calls…' : 'No calls yet.'}
      </AppText>
    ) : null;
  }

  const isDirect = conversation.kind === CONVERSATION_KIND.DIRECT;
  // A call needs a person, and for the open kinds the API requires the app to name one. Everybody
  // on the thread but you is the honest list; whether any of them may actually be rung is still
  // the API's answer, given when the call is placed.
  const others = conversation.participants.filter((participant) => participant.id !== viewerId);
  // Both answers are the server's: whether this reader plays recordings here at all, and whether
  // this particular recording is one of them — the same two gates the web checks.
  const mayPlay = (entry: ConversationCallSummary) =>
    conversation.abilities.canPlayRecording && entry.canPlayRecording;

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
    <Section
      title="Calls"
      icon="call-outline"
      count={entries.length > 0 ? entries.length : undefined}
      style={{ marginTop: theme.spacing.sm }}
    >
      {entries[0] ? (
        <AppText size="xs" tone="muted">
          Last call: {callStatusLabel(entries[0].status)}
        </AppText>
      ) : null}
      {!canCall ? (
        <AppText size="xs" tone="faint">
          Calling is not available here.
        </AppText>
      ) : null}
      {canCall && isDirect && conversation.counterpart ? (
        <Button
          label={`Call ${conversation.counterpart.name}`}
          icon="call-outline"
          size="sm"
          loading={call.busy}
          accessibilityHint="Rings them through Ashniva IVR"
          onPress={() => void call.run({})}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
      {canCall && !(isDirect && conversation.counterpart) ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText size="xs" tone="muted">
            Who should be rung?
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {others.map((participant) => (
              <Button
                key={participant.id}
                label={`Call ${participant.name}`}
                icon="call-outline"
                variant="secondary"
                size="sm"
                loading={call.busy}
                onPress={() => void call.run({ withUserId: participant.id })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {call.error ? (
        <Banner tone="danger" role="alert">
          {call.error}
        </Banner>
      ) : null}

      {entries.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <IconTile
              name={entry.hasRecording ? 'recording-outline' : 'call-outline'}
              tone="teal"
              size={32}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium">
                {callStatusLabel(entry.status)} · {formatDateTime(entry.startedAt)} ·{' '}
                {formatDuration(entry.durationSeconds)}
              </AppText>
              <AppText size="xs" tone="faint">
                {entry.initiatedBy
                  ? `Started by ${entry.initiatedBy.name}`
                  : 'Started by the system'}
                {entry.participants.length > 0
                  ? ` · with ${entry.participants.map((person) => person.name).join(', ')}`
                  : ''}
              </AppText>
            </View>
            {entry.hasRecording && mayPlay(entry) ? (
              <Button
                label="Play the recording"
                icon="play-circle-outline"
                variant="ghost"
                size="sm"
                accessibilityHint="Opens the recording. Every playback is audited."
                onPress={() => void play(entry.id)}
              />
            ) : null}
          </View>
          {entry.hasRecording && !mayPlay(entry) ? (
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

/** The shared label for a call's status. `status` is typed loosely on the summary. */
export function callStatusLabel(status: string): string {
  return CALL_STATUS_LABELS[status as CallStatus] ?? status;
}
