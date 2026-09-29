import type { UnassignedTicketSummary } from '@ashniva/types';
import { View } from 'react-native';

import { PressableCard } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { priorityLabel } from './support-display';

/**
 * One ticket nobody is working, with the reason the router left it here — the web table's row,
 * stacked. The card opens the ticket; the buttons under it act on it from the queue.
 */
export function QueueCard({
  ticket,
  canReassign,
  onOpen,
  onReassign,
  onRouting,
}: {
  ticket: UnassignedTicketSummary;
  canReassign: boolean;
  onOpen: () => void;
  onReassign: () => void;
  onRouting: () => void;
}) {
  const theme = useTheme();
  const reason = ticket.queueReason ?? 'Never routed';
  const where = [ticket.clientOrganizationName, ticket.project?.code, ticket.module]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <PressableCard
        icon="alert-circle-outline"
        iconTone="warning"
        accessibilityLabel={`${ticket.key} ${ticket.title}. Why it is here: ${reason}`}
        accessibilityHint="Opens the ticket"
        onPress={onOpen}
      >
        <AppText size="xs" tone="faint" numberOfLines={1}>
          {ticket.key} · {formatSince(ticket.createdAt) ?? ''}
        </AppText>
        <AppText weight="medium" numberOfLines={2}>
          {ticket.title}
        </AppText>
        {where ? (
          <AppText size="xs" tone="muted" numberOfLines={1}>
            {where}
          </AppText>
        ) : null}
        <PillRow>
          <Pill label={priorityLabel(ticket.priority)} tone="neutral" />
        </PillRow>
        <AppText size="sm" tone="muted">
          Why it is here: {reason}
        </AppText>
      </PressableCard>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
        <Button
          label="Routing"
          icon="git-network-outline"
          size="sm"
          variant="ghost"
          accessibilityHint={`Shows how ${ticket.key} was routed`}
          onPress={onRouting}
        />
        {canReassign ? (
          <Button
            label="Reassign"
            icon="swap-horizontal"
            size="sm"
            variant="secondary"
            accessibilityHint={`Puts ${ticket.key} on somebody by hand`}
            onPress={onReassign}
          />
        ) : null}
      </View>
    </View>
  );
}
