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
import { AppText, Button, Card, Divider } from '../../shared/components/primitives';
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
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Calls
      </AppText>

      {answer?.enabled ? (
        <Button
          label="Call about this ticket"
          loading={call.busy}
          accessibilityHint="Asks Ashniva IVR to place the call"
          onPress={() => void call.run()}
        />
      ) : null}
      {answer && !answer.enabled && answer.reason ? (
        <AppText size="xs" tone="faint">
          {answer.reason}
        </AppText>
      ) : null}
      {call.error ? (
        <AppText tone="danger" size="sm">
          {call.error}
        </AppText>
      ) : null}

      {calls.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText size="sm">
            {formatDateTime(entry.requestedAt)} · {entry.status.toLowerCase()} ·{' '}
            {formatDuration(entry.durationSeconds)}
          </AppText>
          <AppText size="xs" tone="faint">
            {entry.connectedTo ? `Taken by ${entry.connectedTo.name}` : 'Nobody answered'}
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
