import {
  INCIDENT_LINK_KIND_LABELS,
  INCIDENT_STATUS,
  INCIDENT_STATUS_LABELS,
  PERMISSIONS,
  canMoveIncident,
  isIncidentEnded,
  type IncidentDetail,
  type IncidentStatus,
} from '@ashniva/types';
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  PageHeader,
  PriorityDot,
  StatusPill,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ReasonModal } from '../../../shared/components/ReasonModal';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useIncidentMutations, useIncidentQuery } from '../incident-api';
import { ClientSummaryComposer } from '../components/ClientSummaryComposer';
import { EmergencyFixPanel } from '../components/EmergencyFixPanel';
import { LinkWorkModal } from '../components/LinkWorkModal';
import { durationLabel, incidentTone } from '../problem-display';

import '../problems.css';

/**
 * One incident: what is broken, what has been tried, and who authorised what.
 *
 * The timeline is the incident's own account of itself and is append-only — every entry but a
 * note is written by the server when the thing it names actually happened, so it cannot claim a
 * state change the incident never made.
 */
export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useIncidentQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded incident={query.data} /> : null}
    </QueryState>
  );
}

type Dialog = 'note' | 'resolve' | 'close' | 'link' | null;

/**
 * The working statuses, offered as buttons.
 *
 * Resolving and closing have their own actions because they demand something in writing —
 * `resolve` a resolution, `close` a note — so they are not repeated here. What is left is exactly
 * the middle of the lifecycle: INVESTIGATING, IDENTIFIED and MONITORING, which were reachable only
 * through `PATCH /incidents/:id` and therefore not reachable at all. Every incident jumped OPEN →
 * RESOLVED, and MONITORING — the state that exists so a fix is watched before anybody calls it
 * over — never happened once.
 */
const WORKING_STATUSES: IncidentStatus[] = [
  INCIDENT_STATUS.INVESTIGATING,
  INCIDENT_STATUS.IDENTIFIED,
  INCIDENT_STATUS.MONITORING,
];

function Loaded({ incident }: { incident: IncidentDetail }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const canManage = usePermission(PERMISSIONS.INCIDENT_MANAGE);
  const { addNote, resolve, close, update } = useIncidentMutations();
  const ended = isIncidentEnded(incident.status);
  // The state machine in `@ashniva/types` decides which moves exist; this screen only prints them,
  // so a button here can never offer a transition the service would refuse.
  const nextStatuses = WORKING_STATUSES.filter((status) =>
    canMoveIncident(incident.status, status),
  );

  return (
    <div className="problem-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/incidents">Incidents</Link> / {incident.key}
          </>
        }
        title={incident.title}
        subtitle={
          <span className="problem-page__facts">
            <StatusPill
              tone={incidentTone(incident.status)}
              label={INCIDENT_STATUS_LABELS[incident.status]}
            />
            <PriorityDot priority={incident.severity} showLabel />
            <span>{durationLabel(incident.durationMinutes)}</span>
            {incident.project ? <span>{incident.project.name}</span> : null}
            <span className="muted">· internal — clients see only a published summary</span>
          </span>
        }
        actions={
          <div className="problem-actions">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                loading={update.isPending}
                disabled={!canManage}
                disabledReason="Moving an incident needs the incident:manage permission"
                onClick={() => void update.mutateAsync({ id: incident.id, input: { status } })}
              >
                {INCIDENT_STATUS_LABELS[status]}
              </Button>
            ))}
            <Button
              disabled={!canManage}
              disabledReason="Adding to the timeline needs the incident:manage permission"
              onClick={() => setDialog('note')}
            >
              Add a note
            </Button>
            {!ended ? (
              <Button
                variant="primary"
                disabled={!canManage}
                disabledReason="Resolving needs the incident:manage permission"
                onClick={() => setDialog('resolve')}
              >
                Resolve
              </Button>
            ) : null}
            {incident.status === INCIDENT_STATUS.RESOLVED ? (
              <Button
                disabled={!canManage}
                disabledReason="Closing needs the incident:manage permission"
                onClick={() => setDialog('close')}
              >
                Close
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="problem-page__columns">
        <div className="problem-page__main">
          <Card title="What is happening">
            <p className="prose">{incident.description}</p>
            {incident.impact ? (
              <p className="prose">
                <strong>Impact:</strong> {incident.impact}
              </p>
            ) : null}
            {incident.resolution ? (
              <p className="prose">
                <strong>Resolution:</strong> {incident.resolution}
              </p>
            ) : null}
          </Card>

          <Card title="Timeline" headerAddon={<Badge tone="neutral">Append-only</Badge>}>
            <ul className="incident-timeline">
              {incident.timeline.map((entry) => (
                <li key={entry.id} className="incident-timeline__entry">
                  <span>{entry.body}</span>
                  <span className="incident-timeline__meta">
                    {entry.actor?.name ?? 'system'} · {formatDateTime(entry.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <ClientSummaryComposer incident={incident} />
        </div>

        <div className="problem-page__aside">
          <EmergencyFixPanel incident={incident} />
          <Card
            title="Linked work"
            headerAddon={
              canManage ? <Button onClick={() => setDialog('link')}>Link work</Button> : undefined
            }
          >
            {incident.links.length === 0 ? (
              <EmptyState
                title="Nothing linked"
                description="Link the tickets it explains, the tasks fixing it, or the release that caused it."
              />
            ) : (
              <ul className="problem-tickets">
                {incident.links.map((link) => (
                  <li key={link.id} className="problem-tickets__row">
                    <span>{link.label}</span>
                    <span className="problem-tickets__client">
                      {INCIDENT_LINK_KIND_LABELS[link.kind]}
                    </span>
                    <span className="problem-tickets__client">
                      {link.addedBy?.name ?? 'somebody'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Details">
            <DescriptionList items={detailItems(incident)} />
            {incident.internalNotes ? (
              <p className="prose">
                <strong>Internal notes:</strong> {incident.internalNotes}
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      {dialog === 'link' ? (
        <LinkWorkModal incident={incident} onClose={() => setDialog(null)} />
      ) : null}
      <ReasonModal
        open={dialog === 'note'}
        title="Add a note to the timeline"
        label="What happened"
        submitLabel="Add"
        busy={addNote.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(body) => addNote.mutateAsync({ id: incident.id, body })}
      />
      <ReasonModal
        open={dialog === 'resolve'}
        title="Resolve the incident"
        label="What ended the impact"
        submitLabel="Resolve"
        busy={resolve.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(resolution) => resolve.mutateAsync({ id: incident.id, resolution })}
      />
      <ReasonModal
        open={dialog === 'close'}
        title="Close the incident"
        label="What the follow-up concluded (optional)"
        submitLabel="Close"
        required={false}
        busy={close.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(note) => close.mutateAsync({ id: incident.id, note: note || undefined })}
      />
    </div>
  );
}

/** The Details panel's rows. */
function detailItems(incident: IncidentDetail): DescriptionItem[] {
  return [
    { key: 'started', term: 'Started', description: formatDateTime(incident.startedAt) },
    { key: 'detected', term: 'Detected', description: formatDateTime(incident.detectedAt) },
    {
      key: 'resolved',
      term: 'Resolved',
      description: incident.resolvedAt ? formatDateTime(incident.resolvedAt) : '—',
    },
    { key: 'owner', term: 'Owner', description: incident.owner?.name ?? 'Unassigned' },
    {
      key: 'problem',
      term: 'Problem',
      description: incident.problemId ? (
        <Link to={`/problems/${incident.problemId}`}>The recurring fault behind it</Link>
      ) : (
        '—'
      ),
    },
  ];
}
