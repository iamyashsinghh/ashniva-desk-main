import {
  PERMISSIONS,
  type CallAvailability,
  type CallRecordingAccess,
  type CallSummary,
} from '@ashniva/types';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { IconTile } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider } from '../../shared/components/primitives';
import { formatDateTime, formatDuration } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { usePermission } from '../auth/SessionProvider';

/**
 * Calling about a ticket, and what has been called before.
 *
 * `GET /tickets/:id/calls/availability` is asked on every render of this card, and its answer is
 * the button. Whether a call may be placed depends on the product's IVR policy, the client's
 * support tier, whether the caller is the requester and whether the requester is allowed to
 * initiate — none of which the device can work out, and all of which it would eventually work out
 * wrongly. The API says yes or no and gives a sentence for the no.
 *
 * The history is the one place a permission held on the device is consulted, and only to decide
 * whether to *ask*. `call:read-internal` is a hard requirement on that route, so without it the
 * request is a guaranteed 403 and asking anyway would put a red error on the screen of every
 * developer who opens a ticket. The API still decides the answer; this only avoids the question.
 *
 * Playing a recording is `canPlayRecording`, computed per call and per caller by the server. Every
 * playback and every refusal is audited there.
 */
export function TicketCalls({ ticketId }: { ticketId: string }) {
  const theme = useTheme();
  const canReadHistory = usePermission(PERMISSIONS.CALL_READ_INTERNAL);
  const [playError, setPlayError] = useState<string | null>(null);

  const availability = useResource<CallAvailability>(
    ['tickets', ticketId, 'call-availability'],
    `/tickets/${ticketId}/calls/availability`,
  );
  const history = useResource<CallSummary[]>(
    ['tickets', ticketId, 'calls'],
    `/tickets/${ticketId}/calls`,
    { enabled: canReadHistory },
  );

  const call = useApiMutation<void, CallSummary>({
    path: `/tickets/${ticketId}/calls`,
    invalidate: [
      ['tickets', ticketId, 'calls'],
      ['tickets', ticketId, 'call-availability'],
    ],
  });

  const calls = history.data ?? [];
  const answer = availability.data ?? null;

  // Nothing to say: no answer yet, calling is off, and there is no history to show.
  if (!answer && calls.length === 0) {
    return null;
  }

  const play = async (callId: string) => {
    setPlayError(null);
    try {
      const access = await apiRequest<CallRecordingAccess>(`/calls/${callId}/recording`);
      await Linking.openURL(access.url);
    } catch (cause) {
      setPlayError(errorMessage(cause));
    }
  };

  return (
    <Section title="Calls" count={calls.length > 0 ? calls.length : undefined} icon="call-outline">
      {answer?.enabled ? (
        <Button
          label="Call about this ticket"
          icon="call-outline"
          loading={call.busy}
          accessibilityHint="Asks Ashniva IVR to place the call"
          onPress={() => void call.run()}
        />
      ) : null}
      {answer && !answer.enabled && answer.reason ? (
        <MetaLine icon="information-circle-outline">{answer.reason}</MetaLine>
      ) : null}
      {call.error ? (
        <Banner tone="danger" role="alert">
          {call.error}
        </Banner>
      ) : null}

      {calls.map((entry, index) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          {index > 0 || answer ? <Divider /> : null}
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <IconTile
              name={entry.connectedTo ? 'call' : 'call-outline'}
              tone={entry.connectedTo ? 'success' : 'neutral'}
              size={32}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" tabular>
                {formatDateTime(entry.requestedAt)} · {entry.status.toLowerCase()} ·{' '}
                {formatDuration(entry.durationSeconds)}
              </AppText>
              <MetaLine icon={entry.connectedTo ? 'person-outline' : 'close-circle-outline'}>
                {entry.connectedTo ? `Taken by ${entry.connectedTo.name}` : 'Nobody answered'}
              </MetaLine>
            </View>
          </View>
          {entry.hasRecording && entry.canPlayRecording ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                label="Play the recording"
                variant="secondary"
                size="sm"
                icon="play-circle-outline"
                accessibilityHint="Opens the recording. Every playback is audited."
                onPress={() => void play(entry.id)}
              />
            </View>
          ) : null}
          {entry.hasRecording && !entry.canPlayRecording ? (
            <MetaLine icon="lock-closed-outline">
              Recorded. You are not permitted to play it.
            </MetaLine>
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
