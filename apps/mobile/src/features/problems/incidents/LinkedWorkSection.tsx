import {
  INCIDENT_LINK_KIND,
  INCIDENT_LINK_KIND_LABELS,
  PERMISSIONS,
  type IncidentDetail,
  type IncidentLink,
  type IncidentLinkKind,
} from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import type { IconName } from '../../../shared/components/Icon';
import { Section } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { formatSince } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import { linkableKinds, LinkWorkSheet } from './LinkWorkSheet';

const KIND_ICON: Record<IncidentLinkKind, IconName> = {
  TICKET: 'ticket-outline',
  TASK: 'checkbox-outline',
  RELEASE: 'rocket-outline',
};

/** The tickets it explains, the tasks fixing it, the release that caused it. */
export function LinkedWorkSection({
  incident,
  onOpenTicket,
  onOpenTask,
}: {
  incident: IncidentDetail;
  onOpenTicket?: (ticketId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const { can } = useSession();
  const [linking, setLinking] = useState(false);
  const canLink = can(PERMISSIONS.INCIDENT_MANAGE) && linkableKinds(can).length > 0;

  const opener = (link: IncidentLink): (() => void) | undefined => {
    if (link.kind === INCIDENT_LINK_KIND.TICKET && onOpenTicket && can(PERMISSIONS.TICKET_READ)) {
      return () => onOpenTicket(link.entityId);
    }
    if (link.kind === INCIDENT_LINK_KIND.TASK && onOpenTask && can(PERMISSIONS.TASK_READ)) {
      return () => onOpenTask(link.entityId);
    }
    return undefined;
  };

  return (
    <Section
      title="Linked work"
      count={incident.links.length}
      icon="link-outline"
      action={
        canLink ? (
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
      {incident.links.length === 0 ? (
        <AppText size="sm" tone="muted">
          Link the tickets it explains, the tasks fixing it, or the release that caused it.
        </AppText>
      ) : (
        incident.links.map((link) => {
          const onPress = opener(link);
          return (
            <ListRow
              key={link.id}
              icon={KIND_ICON[link.kind]}
              iconTone="info"
              title={link.label}
              subtitle={`${INCIDENT_LINK_KIND_LABELS[link.kind]} · ${link.addedBy?.name ?? 'somebody'} · ${formatSince(link.addedAt) ?? ''}`}
              {...(onPress ? { onPress } : {})}
            />
          );
        })
      )}
      {linking ? <LinkWorkSheet incident={incident} onClose={() => setLinking(false)} /> : null}
    </Section>
  );
}
