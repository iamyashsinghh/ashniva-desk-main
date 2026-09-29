import type { PortalTicketDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Grow, Section } from '../../../shared/components/layout';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const INVALIDATE = [['tickets'], ['portal']];

/**
 * What a client can do with their own ticket once it is resolved: confirm the fix and close it,
 * or say what is still wrong and reopen it. The API decides both through `canClose` and
 * `canReopen`; nothing here infers them from the status.
 */
export function PortalTicketActions({
  ticket,
  onChanged,
}: {
  ticket: PortalTicketDetail;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const close = useApiMutation<void, PortalTicketDetail>({
    path: `/portal/tickets/${ticket.id}/close`,
    invalidate: INVALIDATE,
    onSuccess: onChanged,
  });
  const reopen = useApiMutation<{ reason: string }, PortalTicketDetail>({
    path: `/portal/tickets/${ticket.id}/reopen`,
    body: (variables) => variables,
    invalidate: INVALIDATE,
    onSuccess: () => {
      setReason('');
      setReopening(false);
      onChanged();
    },
  });

  if (!ticket.canClose && !ticket.canReopen) {
    return null;
  }

  return (
    <Section title="Is it fixed?" icon="help-circle-outline">
      <AppText size="sm" tone="muted">
        The team marked this resolved. Confirm it works for you, or tell them what is still wrong.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {ticket.canClose ? (
          <Grow>
            <Button
              label="Confirm & close"
              icon="checkmark-done"
              loading={close.busy}
              accessibilityHint="Confirms the fix and closes the ticket"
              onPress={() => void close.run()}
            />
          </Grow>
        ) : null}
        {ticket.canReopen ? (
          <Grow>
            <Button
              label="Reopen"
              icon="refresh"
              variant="secondary"
              onPress={() => {
                reopen.reset();
                setReopening(true);
              }}
            />
          </Grow>
        ) : null}
      </View>
      {close.error ? (
        <Banner tone="danger" role="alert">
          {close.error}
        </Banner>
      ) : null}

      <Sheet
        visible={reopening}
        title="Reopen ticket"
        subtitle={ticket.key}
        onClose={() => setReopening(false)}
        footer={
          <>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setReopening(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="Reopen"
              icon="refresh"
              loading={reopen.busy}
              disabled={reason.trim().length < 3}
              onPress={() => void reopen.run({ reason: reason.trim() })}
              style={{ flex: 1 }}
            />
          </>
        }
      >
        <Field label="What is still wrong?" required hint="The team reads this first.">
          <Input
            accessibilityLabel="What is still wrong?"
            autoFocus
            multiline
            numberOfLines={4}
            onChangeText={setReason}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            value={reason}
          />
        </Field>
        {reopen.error ? (
          <Banner tone="danger" role="alert">
            {reopen.error}
          </Banner>
        ) : null}
      </Sheet>
    </Section>
  );
}
