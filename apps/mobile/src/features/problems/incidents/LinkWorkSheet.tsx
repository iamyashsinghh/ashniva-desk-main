import {
  INCIDENT_LINK_KIND,
  INCIDENT_LINK_KIND_LABELS,
  PERMISSIONS,
  type IncidentDetail,
  type IncidentLinkKind,
  type PermissionKey,
} from '@ashniva/types';
import { useState } from 'react';

import { useDebounced } from '../../../shared/components/FilterSheet';
import { Banner } from '../../../shared/components/feedback';
import { Segmented } from '../../../shared/components/navigation-list';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useSession } from '../../auth/SessionProvider';
import { useReleaseOptions, useTaskOptions, useTicketOptions } from '../components/work-pickers';
import { useIncidentWrite } from '../problem-api';

/** The permission the list behind each kind needs — without it there is nothing to pick from. */
const KIND_PERMISSION: Record<IncidentLinkKind, PermissionKey> = {
  TICKET: PERMISSIONS.TICKET_READ,
  TASK: PERMISSIONS.TASK_READ,
  RELEASE: PERMISSIONS.RELEASE_MANAGE,
};

const ID_FIELD: Record<IncidentLinkKind, 'ticketId' | 'taskId' | 'releaseId'> = {
  TICKET: 'ticketId',
  TASK: 'taskId',
  RELEASE: 'releaseId',
};

/** The kinds this person can pick from. Empty means the Link button should not be drawn. */
export function linkableKinds(can: (permission: PermissionKey) => boolean): IncidentLinkKind[] {
  return Object.values(INCIDENT_LINK_KIND).filter((kind) => can(KIND_PERMISSION[kind]));
}

/**
 * Linking the tickets an incident explains, the tasks fixing it, or the release that caused it —
 * one at a time, since each link records who added it. Lists are narrowed to the incident's
 * project when it names one.
 */
export function LinkWorkSheet({
  incident,
  onClose,
}: {
  incident: IncidentDetail;
  onClose: () => void;
}) {
  const { can } = useSession();
  const kinds = linkableKinds(can);
  const [kind, setKind] = useState<IncidentLinkKind>(kinds[0] ?? INCIDENT_LINK_KIND.TICKET);
  const [search, setSearch] = useState('');
  const [entityId, setEntityId] = useState<string | null>(null);
  const term = useDebounced(search.trim());
  const scope = { projectId: incident.project?.id, search: term };

  const tickets = useTicketOptions({ ...scope, enabled: kind === INCIDENT_LINK_KIND.TICKET });
  const tasks = useTaskOptions({ ...scope, enabled: kind === INCIDENT_LINK_KIND.TASK });
  const releases = useReleaseOptions({ ...scope, enabled: kind === INCIDENT_LINK_KIND.RELEASE });
  const source = { TICKET: tickets, TASK: tasks, RELEASE: releases }[kind];
  const linked = new Set(
    incident.links.filter((link) => link.kind === kind).map((link) => link.entityId),
  );

  const link = useIncidentWrite<string>({
    path: `/incidents/${incident.id}/links`,
    body: (id) => ({ kind, [ID_FIELD[kind]]: id }),
    onDone: onClose,
  });

  const label = INCIDENT_LINK_KIND_LABELS[kind];
  return (
    <Sheet
      visible
      title="Link work"
      subtitle={`${incident.key} · ${incident.title}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Link"
            icon="link-outline"
            loading={link.busy}
            disabled={!entityId}
            onPress={() => (entityId ? void link.run(entityId) : undefined)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      {kinds.length > 1 ? (
        <Segmented
          label="What to link"
          options={kinds.map((value) => ({ value, label: INCIDENT_LINK_KIND_LABELS[value] }))}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setEntityId(null);
            link.reset();
          }}
        />
      ) : null}
      <Field label={`Find a ${label.toLowerCase()}`}>
        <Input
          icon="search"
          accessibilityLabel={`Find a ${label.toLowerCase()}`}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </Field>
      <SelectField
        label={label}
        required
        options={source.options.filter((option) => !linked.has(option.value))}
        value={entityId ? [entityId] : []}
        onChange={(ids) => setEntityId(ids[0] ?? null)}
        loading={source.isLoading}
        {...(incident.project ? { hint: `On ${incident.project.name}` } : {})}
        placeholder={`Choose a ${label.toLowerCase()}`}
      />
      {link.error ? (
        <Banner tone="danger" role="alert">
          {link.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
