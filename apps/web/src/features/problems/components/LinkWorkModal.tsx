import {
  INCIDENT_LINK_KIND,
  INCIDENT_LINK_KIND_LABELS,
  type IncidentDetail,
  type IncidentLinkKind,
} from '@ashniva/types';
import { Alert, Button, FormField, Modal, SegmentedControl, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReleasesQuery } from '../../releases/api';
import { useTasksQuery } from '../../tasks/api';
import { useTicketsQuery } from '../../tickets/api';
import { useIncidentMutations } from '../incident-api';

const KINDS: IncidentLinkKind[] = [
  INCIDENT_LINK_KIND.TICKET,
  INCIDENT_LINK_KIND.TASK,
  INCIDENT_LINK_KIND.RELEASE,
];

/**
 * Linking the tickets an incident explains, the tasks fixing it and the release that caused it.
 *
 * `POST /incidents/:id/links` shipped with nothing calling it, so the "Nothing linked" empty state
 * told the reader to link work and offered no way to do it. The lists come from the ordinary
 * `/tickets`, `/tasks` and `/releases` reads rather than a search endpoint of their own — an
 * incident's work is on its project, and that is a filter those endpoints already take.
 *
 * An incident with no project is the one case with nothing to narrow by; the tenant-wide list is
 * still correct, just longer, and the server checks the id belongs to this organization either way.
 */
export function LinkWorkModal({
  incident,
  onClose,
}: {
  incident: IncidentDetail;
  onClose: () => void;
}) {
  const { addLink } = useIncidentMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [kind, setKind] = useState<IncidentLinkKind>(INCIDENT_LINK_KIND.TICKET);
  const [targetId, setTargetId] = useState('');

  const projectId = incident.project?.id;
  const tickets = useTicketsQuery({ projectId, limit: 100 });
  const tasks = useTasksQuery({ projectId, limit: 100 });
  const releases = useReleasesQuery({ projectId });

  const options = choicesFor(kind, {
    tickets: (tickets.data?.items ?? []).map((row) => ({
      value: row.id,
      label: `${row.key} · ${row.title}`,
    })),
    tasks: (tasks.data?.items ?? []).map((row) => ({
      value: row.id,
      label: `${row.key} · ${row.title}`,
    })),
    releases: (releases.data?.items ?? []).map((row) => ({
      value: row.id,
      label: `${row.version} · ${row.title}`,
    })),
  });

  const submit = () =>
    addLink.mutateAsync({
      id: incident.id,
      kind,
      ...(kind === INCIDENT_LINK_KIND.TICKET ? { ticketId: targetId } : {}),
      ...(kind === INCIDENT_LINK_KIND.TASK ? { taskId: targetId } : {}),
      ...(kind === INCIDENT_LINK_KIND.RELEASE ? { releaseId: targetId } : {}),
    });

  return (
    <Modal
      open
      title="Link work to this incident"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={addLink.isPending}
            disabled={!targetId}
            disabledReason={`Choose the ${INCIDENT_LINK_KIND_LABELS[kind].toLowerCase()} to link`}
            onClick={() => void wrap(submit)()}
          >
            Link it
          </Button>
        </>
      }
    >
      <SegmentedControl
        aria-label="What to link"
        value={kind}
        onChange={(next) => {
          setKind(next);
          // The chosen id belongs to the old kind; keeping it would post a task id as a ticket.
          setTargetId('');
        }}
        options={KINDS.map((value) => ({ key: value, label: INCIDENT_LINK_KIND_LABELS[value] }))}
      />
      <FormField
        label={INCIDENT_LINK_KIND_LABELS[kind]}
        required
        hint={
          incident.project
            ? `On ${incident.project.name}`
            : 'This incident names no project, so everything is offered'
        }
      >
        <Select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          placeholder="Choose one"
          options={options}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

interface Choice {
  value: string;
  label: string;
}

/** Which of the three lists the chosen kind reads from. */
function choicesFor(
  kind: IncidentLinkKind,
  lists: { tickets: Choice[]; tasks: Choice[]; releases: Choice[] },
): Choice[] {
  if (kind === INCIDENT_LINK_KIND.TICKET) {
    return lists.tickets;
  }
  if (kind === INCIDENT_LINK_KIND.TASK) {
    return lists.tasks;
  }
  return lists.releases;
}
