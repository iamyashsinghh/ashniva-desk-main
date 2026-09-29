import type { TicketAction, TicketDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Grow, Section } from '../../../shared/components/layout';
import { Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ConvertTicketSheet } from './ConvertTicketSheet';
import {
  offeredActions,
  primaryActions,
  TEXT_ACTIONS,
  type OfferedAction,
  type TextActionKind,
} from './ticket-actions';
import { AssignTicketSheet, TicketTextSheet, type AssignInput } from './TicketFormSheets';

interface Transition {
  action: TicketAction;
  body?: object;
}

const INVALIDATE = [['tickets'], ['tasks'], ['dashboard'], ['portal']];

/**
 * Every transition the API offers on this ticket.
 *
 * The API answers, per action, whether it is allowed and why not; the phone never works that out
 * itself. The one or two that move the work forward are buttons; everything else — including the
 * refusals, with their reasons, so nobody wonders where "Close" went — is under "More actions".
 */
export function TicketActions({
  ticket,
  onChanged,
}: {
  ticket: TicketDetail;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [textKind, setTextKind] = useState<TextActionKind | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [converting, setConverting] = useState(false);

  const transition = useApiMutation<Transition, TicketDetail>({
    path: ({ action }) => `/tickets/${ticket.id}/${action}`,
    body: ({ body }) => body ?? {},
    invalidate: INVALIDATE,
    onSuccess: () => {
      setTextKind(null);
      setAssigning(false);
      onChanged();
    },
  });

  const offered = offeredActions(ticket.actions);
  if (offered.length === 0) {
    return null;
  }
  const primary = primaryActions(offered);

  const take = (entry: OfferedAction) => {
    setMenuOpen(false);
    transition.reset();
    switch (entry.form) {
      case 'assign':
        setAssigning(true);
        return;
      case 'convert':
        setConverting(true);
        return;
      case 'text':
        setTextKind(entry.action as TextActionKind);
        return;
      default:
        void transition.run({ action: entry.action });
    }
  };

  const submitText = (kind: TextActionKind, text: string) =>
    void transition.run({ action: kind, body: { [TEXT_ACTIONS[kind].field]: text } });
  const submitAssign = (input: AssignInput) =>
    void transition.run({ action: 'assign', body: input });
  const inlineError = textKind === null && !assigning ? transition.error : null;

  return (
    <Section title="Actions" icon="flash-outline">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {primary.map((entry) => (
          <Grow key={entry.action}>
            <Button
              label={entry.label}
              icon={entry.icon}
              variant={entry.variant}
              loading={transition.busy && entry.form === 'none'}
              onPress={() => take(entry)}
            />
          </Grow>
        ))}
        <Grow>
          <Button
            label="More actions"
            icon="ellipsis-horizontal"
            variant="secondary"
            onPress={() => setMenuOpen(true)}
          />
        </Grow>
      </View>
      {inlineError ? (
        <Banner tone="danger" role="alert">
          {inlineError}
        </Banner>
      ) : null}

      <Sheet
        visible={menuOpen}
        title="Actions"
        subtitle={`${ticket.key} · ${ticket.title}`}
        onClose={() => setMenuOpen(false)}
      >
        {offered.map((entry) => (
          <ListRow
            key={entry.action}
            icon={entry.icon}
            iconTone={entry.enabled ? 'primary' : 'neutral'}
            title={entry.label}
            subtitle={entry.enabled ? null : entry.reason}
            destructive={entry.enabled && entry.variant.startsWith('danger')}
            {...(entry.enabled ? { onPress: () => take(entry) } : {})}
          />
        ))}
      </Sheet>

      <TicketTextSheet
        kind={textKind}
        busy={transition.busy}
        error={textKind ? transition.error : null}
        onClose={() => setTextKind(null)}
        onSubmit={submitText}
      />
      {assigning ? (
        <AssignTicketSheet
          visible
          ticket={ticket}
          busy={transition.busy}
          error={transition.error}
          onClose={() => setAssigning(false)}
          onSubmit={submitAssign}
        />
      ) : null}
      {converting ? (
        <ConvertTicketSheet
          visible
          ticket={ticket}
          onClose={() => setConverting(false)}
          onConverted={() => {
            setConverting(false);
            onChanged();
          }}
        />
      ) : null}
    </Section>
  );
}
