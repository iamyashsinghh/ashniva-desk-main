import {
  PRIORITY_LABELS,
  SLA_TARGET_STATUS,
  SLA_TARGET_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  type TicketDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { Hero } from '../../../shared/components/layout';
import { Pill, PillRow } from '../../../shared/components/primitives';
import { formatDateTime, formatSince } from '../../../shared/format/format';
import { slaNeedsAttention } from '../sla-format';
import { slaTone, ticketMark, ticketTone } from '../ticket-display';

/** The top of the staff ticket screen: what it is, what state it is in, who and whom. */
export function TicketHero({ ticket }: { ticket: TicketDetail }) {
  const overall = ticket.sla?.overall;
  const mark = ticketMark(ticket.status, overall === SLA_TARGET_STATUS.BREACHED);
  return (
    <Hero
      overline={`${ticket.key} · ${PRIORITY_LABELS[ticket.priority]} · ${TICKET_TYPE_LABELS[ticket.type]}`}
      title={ticket.title}
      icon={mark.icon}
      iconTone={mark.tone}
    >
      <PillRow>
        <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
        {overall && slaNeedsAttention(overall) ? (
          <Pill
            label={`SLA ${SLA_TARGET_STATUS_LABELS[overall].toLowerCase()}`}
            tone={slaTone(overall)}
          />
        ) : null}
        {ticket.sla?.isPaused ? <Pill label="SLA paused" tone="info" /> : null}
      </PillRow>
      <View style={{ gap: 4 }}>
        <MetaLine icon="business-outline">
          {ticket.clientOrganization.name} · raised by {ticket.requester.name}
        </MetaLine>
        <MetaLine icon={ticket.assignedTo ? 'person-outline' : 'person-add-outline'}>
          {ticket.assignedTo ? `Assigned to ${ticket.assignedTo.name}` : 'Not assigned yet'}
          {ticket.team ? ` · ${ticket.team.name}` : ''}
        </MetaLine>
        {ticket.project ? (
          <MetaLine icon="folder-open-outline">
            {ticket.project.name}
            {ticket.module ? ` · ${ticket.module}` : ''}
          </MetaLine>
        ) : null}
        {ticket.productVersion ? (
          <MetaLine icon="git-commit-outline">Version {ticket.productVersion}</MetaLine>
        ) : null}
        <MetaLine icon="time-outline">
          Opened {formatSince(ticket.createdAt)}
          {ticket.resolvedAt ? ` · resolved ${formatDateTime(ticket.resolvedAt) ?? ''}` : ''}
        </MetaLine>
      </View>
    </Hero>
  );
}
