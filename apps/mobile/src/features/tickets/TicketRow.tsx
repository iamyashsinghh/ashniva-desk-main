import {
  CLIENT_VISIBLE_STATUS_LABELS,
  PRIORITY_LABELS,
  SLA_TARGET_STATUS,
  SLA_TARGET_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type PortalTicketSummary,
  type Priority,
  type TicketSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { slaNeedsAttention } from './sla-format';
import {
  clientTicketTone,
  portalTicketMark,
  slaTone,
  ticketMark,
  ticketTone,
} from './ticket-display';

function Overline({ ticketKey, priority }: { ticketKey: string; priority: Priority }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
      <Icon name="flag" size={11} color={theme.priority[priority]} />
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {ticketKey} · {PRIORITY_LABELS[priority]}
      </AppText>
    </View>
  );
}

/** One ticket on the staff desk: status, SLA trouble, who has it and for which client. */
export function TicketRow({ ticket, onPress }: { ticket: TicketSummary; onPress: () => void }) {
  const overall = ticket.sla?.overall;
  const mark = ticketMark(ticket.status, overall === SLA_TARGET_STATUS.BREACHED);
  return (
    <PressableCard
      accessibilityLabel={`${ticket.key} ${ticket.title}`}
      accessibilityHint="Opens the ticket"
      onPress={onPress}
      icon={mark.icon}
      iconTone={mark.tone}
    >
      <Overline ticketKey={ticket.key} priority={ticket.priority} />
      <AppText weight="medium" numberOfLines={2}>
        {ticket.title}
      </AppText>
      <PillRow>
        <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
        {overall && slaNeedsAttention(overall) ? (
          <Pill
            label={`SLA ${SLA_TARGET_STATUS_LABELS[overall].toLowerCase()}`}
            tone={slaTone(overall)}
          />
        ) : null}
        {ticket.linkedTaskCount > 0 ? (
          <Pill
            label={`${ticket.linkedTaskCount} ${ticket.linkedTaskCount === 1 ? 'task' : 'tasks'}`}
            tone="neutral"
          />
        ) : null}
      </PillRow>
      <MetaLine icon="business-outline">
        {ticket.clientOrganization.name}
        {ticket.project ? ` · ${ticket.project.name}` : ''}
      </MetaLine>
      <MetaLine icon={ticket.assignedTo ? 'person-outline' : 'person-add-outline'}>
        {ticket.assignedTo ? ticket.assignedTo.name : 'Unassigned'}
        {ticket.updatedAt ? ` · updated ${formatSince(ticket.updatedAt) ?? ''}` : ''}
      </MetaLine>
    </PressableCard>
  );
}

/**
 * One ticket as its client sees it: the client-visible status only, and a highlight when the
 * ticket is waiting on them. Nothing about who is working it.
 */
export function PortalTicketRow({
  ticket,
  onPress,
}: {
  ticket: PortalTicketSummary;
  onPress: () => void;
}) {
  const resolution = ticket.sla?.resolution.status;
  const mark = portalTicketMark(ticket.status, resolution === SLA_TARGET_STATUS.BREACHED);
  return (
    <PressableCard
      accessibilityLabel={`${ticket.key} ${ticket.title}`}
      accessibilityHint="Opens the ticket"
      onPress={onPress}
      icon={mark.icon}
      iconTone={mark.tone}
      highlight={ticket.needsYourAction}
    >
      <Overline ticketKey={ticket.key} priority={ticket.priority} />
      <AppText weight="medium" numberOfLines={2}>
        {ticket.title}
      </AppText>
      <PillRow>
        <Pill
          label={CLIENT_VISIBLE_STATUS_LABELS[ticket.status]}
          tone={clientTicketTone(ticket.status)}
        />
        {ticket.needsYourAction ? <Pill label="Needs you" tone="warning" /> : null}
      </PillRow>
      <MetaLine icon="time-outline">
        {ticket.project ? `${ticket.project.name} · ` : ''}Updated {formatSince(ticket.updatedAt)}
      </MetaLine>
    </PressableCard>
  );
}
