import {
  INCIDENT_STATUS_LABELS,
  PERMISSIONS,
  PROBLEM_STATUS,
  type ProblemDetail,
} from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { formatMinutes } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import { DeclareIncidentSheet } from '../incidents/DeclareIncidentSheet';
import { incidentTone } from '../problem-display';

/**
 * Incidents this problem caused. A problem is investigated over days; an incident is now — and
 * declaring one from here is the one moment it can be tied to this problem.
 */
export function ProblemIncidents({
  problem,
  onOpenIncident,
}: {
  problem: ProblemDetail;
  onOpenIncident?: (incidentId: string) => void;
}) {
  const { can } = useSession();
  const [declaring, setDeclaring] = useState(false);
  const canRead = can(PERMISSIONS.INCIDENT_READ);
  const canDeclare = can(PERMISSIONS.INCIDENT_MANAGE) && problem.status !== PROBLEM_STATUS.CLOSED;

  return (
    <Section
      title="Incidents"
      count={problem.incidents.length}
      icon="flame-outline"
      action={
        canDeclare ? (
          <Button
            label="Declare"
            icon="add"
            size="sm"
            variant="ghost"
            onPress={() => setDeclaring(true)}
          />
        ) : undefined
      }
    >
      {problem.incidents.length === 0 ? (
        <AppText size="sm" tone="muted">
          An incident is opened when this fault is breaking something right now.
        </AppText>
      ) : (
        problem.incidents.map((incident) => (
          <ListRow
            key={incident.id}
            title={`${incident.key} · ${incident.title}`}
            subtitle={formatMinutes(incident.durationMinutes)}
            trailing={
              <Pill
                label={INCIDENT_STATUS_LABELS[incident.status]}
                tone={incidentTone(incident.status)}
              />
            }
            {...(onOpenIncident && canRead
              ? {
                  onPress: () => onOpenIncident(incident.id),
                  accessibilityHint: 'Opens the incident',
                }
              : {})}
          />
        ))
      )}
      {declaring ? (
        <DeclareIncidentSheet
          problem={problem}
          onClose={() => setDeclaring(false)}
          onCreated={(incident) => {
            setDeclaring(false);
            if (canRead) {
              onOpenIncident?.(incident.id);
            }
          }}
        />
      ) : null}
    </Section>
  );
}
