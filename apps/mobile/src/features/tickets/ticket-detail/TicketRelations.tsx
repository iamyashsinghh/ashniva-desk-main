import {
  TICKET_STATUS_LABELS,
  WORK_RELATION_ROLE,
  WORK_RELATION_ROLE_LABELS,
  type TicketRelationView,
  type TicketRelationsResponse,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { ticketTone } from '../ticket-display';
import { LinkTicketSheet } from './LinkTicketSheet';

/**
 * Duplicates and related tickets.
 *
 * Shows what the API decided to show and nothing more: a link whose far end the reader may not
 * open arrives with `other: null` and is said to be inaccessible, and the card is hidden entirely
 * when there is nothing to show and nothing the reader could do.
 */
export function TicketRelations({
  ticketId,
  onOpenTicket,
}: {
  ticketId: string;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const [linking, setLinking] = useState(false);
  const query = useResource<TicketRelationsResponse>(
    ['tickets', ticketId, 'relations'],
    `/tickets/${ticketId}/relations`,
  );
  const unlink = useApiMutation<string, TicketRelationsResponse>({
    path: (relationId) => `/tickets/${ticketId}/relations/${relationId}`,
    method: 'DELETE',
    invalidate: [['tickets'], ['portal']],
  });

  const data = query.data;
  if (!data || (data.relations.length === 0 && !data.canLink)) {
    return null;
  }

  return (
    <Section
      title="Related tickets"
      count={data.relations.length}
      icon="link-outline"
      action={
        data.canLink ? (
          <Button
            label="Link"
            icon="add"
            size="sm"
            variant="ghost"
            onPress={() => setLinking(true)}
          />
        ) : undefined
      }
    >
      {data.relations.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing linked yet. Link this ticket to one it duplicates, or one it belongs with.
        </AppText>
      ) : null}
      {data.relations.map((relation) => (
        <View key={relation.id}>
          <RelationRow relation={relation} onOpenTicket={onOpenTicket} />
          {data.canLink ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                label="Unlink"
                size="sm"
                variant="dangerGhost"
                loading={unlink.busy}
                accessibilityHint="Removes the link. Nothing on either ticket changes."
                onPress={() => void unlink.run(relation.id)}
              />
            </View>
          ) : null}
        </View>
      ))}
      {unlink.error ? (
        <Banner tone="danger" role="alert">
          {unlink.error}
        </Banner>
      ) : null}
      {data.canLink ? (
        <LinkTicketSheet visible={linking} ticketId={ticketId} onClose={() => setLinking(false)} />
      ) : null}
    </Section>
  );
}

function RelationRow({
  relation,
  onOpenTicket,
}: {
  relation: TicketRelationView;
  onOpenTicket: ((ticketId: string) => void) | undefined;
}) {
  const role = WORK_RELATION_ROLE_LABELS[relation.role];
  const other = relation.other;
  if (!other) {
    return (
      <ListRow
        icon="lock-closed-outline"
        iconTone="neutral"
        title={role}
        subtitle="A ticket you do not have access to"
      />
    );
  }
  return (
    <ListRow
      icon={relation.role === WORK_RELATION_ROLE.RELATED ? 'link-outline' : 'copy-outline'}
      iconTone={relation.role === WORK_RELATION_ROLE.DUPLICATE ? 'warning' : 'info'}
      title={`${role} ${other.key}`}
      subtitle={`${other.title} · ${other.clientOrganization.name}${relation.note ? ` · ${relation.note}` : ''}`}
      trailing={<Pill label={TICKET_STATUS_LABELS[other.status]} tone={ticketTone(other.status)} />}
      accessibilityHint="Opens the ticket"
      {...(onOpenTicket ? { onPress: () => onOpenTicket(other.id) } : {})}
    />
  );
}
