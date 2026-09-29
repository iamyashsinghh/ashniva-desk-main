import { PERMISSIONS, type IncidentDetail, type IncidentStatus } from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../../shared/components/layout';
import { Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useSession } from '../../auth/SessionProvider';
import { TextActionSheet } from '../components/TextActionSheet';
import { useIncidentWrite } from '../problem-api';
import { EditIncidentSheet } from './EditIncidentSheet';
import {
  incidentActions,
  primaryIncidentAction,
  type IncidentDialog,
  type OfferedIncidentAction,
} from './incident-actions';

interface IncidentStep {
  action: 'notes' | 'resolve' | 'close';
  body: object;
}

/**
 * The bar at the foot of an incident: the next step as a button, everything else under "More".
 * A status move goes straight through — it asks nothing — while resolving, closing and notes
 * open a sheet for the words the server records with them.
 */
export function IncidentActionBar({ incident }: { incident: IncidentDetail }) {
  const { can } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<IncidentDialog | null>(null);
  const close = () => setDialog(null);

  const move = useIncidentWrite<IncidentStatus>({
    path: `/incidents/${incident.id}`,
    method: 'PATCH',
    body: (status) => ({ status }),
  });
  const step = useIncidentWrite<IncidentStep>({
    path: ({ action }) => `/incidents/${incident.id}/${action}`,
    body: ({ body }) => body,
    onDone: close,
  });

  const offered = incidentActions(incident, can(PERMISSIONS.INCIDENT_MANAGE));
  if (offered.length === 0) {
    return null;
  }
  const primary = primaryIncidentAction(incident, offered);

  const take = (entry: OfferedIncidentAction) => {
    setMenuOpen(false);
    move.reset();
    step.reset();
    if (entry.kind === 'move') {
      void move.run(entry.status);
      return;
    }
    setDialog(entry.kind);
  };

  return (
    <>
      <StickyActionBar
        note={
          move.error ? (
            <Banner tone="danger" role="alert">
              {move.error}
            </Banner>
          ) : undefined
        }
      >
        {primary ? (
          <Grow>
            <Button
              label={primary.label}
              icon={primary.icon}
              loading={primary.kind === 'move' && move.busy}
              onPress={() => take(primary)}
            />
          </Grow>
        ) : null}
        <Grow>
          <Button
            label="More actions"
            icon="ellipsis-horizontal"
            variant="secondary"
            disabled={move.busy}
            onPress={() => setMenuOpen(true)}
          />
        </Grow>
      </StickyActionBar>

      <Sheet
        visible={menuOpen}
        title="Actions"
        subtitle={`${incident.key} · ${incident.title}`}
        onClose={() => setMenuOpen(false)}
      >
        {offered.map((entry) => (
          <ListRow
            key={entry.id}
            icon={entry.icon}
            iconTone="primary"
            title={entry.label}
            destructive={entry.kind !== 'move' && Boolean(entry.danger)}
            onPress={() => take(entry)}
          />
        ))}
      </Sheet>

      {dialog === 'edit' ? <EditIncidentSheet incident={incident} onClose={close} /> : null}
      {dialog === 'note' ? (
        <TextActionSheet
          title="Add a note to the timeline"
          subtitle="The timeline is append-only"
          label="What happened"
          submitLabel="Add"
          maxLength={5000}
          busy={step.busy}
          error={step.error}
          onClose={close}
          onSubmit={(body) => void step.run({ action: 'notes', body: { body } })}
        />
      ) : null}
      {dialog === 'resolve' ? (
        <TextActionSheet
          title="Resolve the incident"
          label="What ended the impact"
          submitLabel="Resolve"
          submitIcon="checkmark-circle-outline"
          minLength={3}
          busy={step.busy}
          error={step.error}
          onClose={close}
          onSubmit={(resolution) => void step.run({ action: 'resolve', body: { resolution } })}
        />
      ) : null}
      {dialog === 'close' ? (
        <TextActionSheet
          title="Close the incident"
          label="What the follow-up concluded"
          hint="Optional"
          submitLabel="Close incident"
          submitIcon="checkmark-done-outline"
          danger
          minLength={0}
          maxLength={2000}
          busy={step.busy}
          error={step.error}
          onClose={close}
          onSubmit={(note) => void step.run({ action: 'close', body: note ? { note } : {} })}
        />
      ) : null}
    </>
  );
}
