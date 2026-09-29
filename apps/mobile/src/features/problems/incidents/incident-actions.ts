import {
  canMoveIncident,
  INCIDENT_STATUS,
  INCIDENT_STATUS_LABELS,
  isIncidentEnded,
  type IncidentDetail,
  type IncidentStatus,
} from '@ashniva/types';

import type { IconName } from '../../../shared/components/Icon';

export type IncidentDialog = 'note' | 'resolve' | 'close' | 'edit';

export type OfferedIncidentAction =
  | { kind: 'move'; id: string; status: IncidentStatus; label: string; icon: IconName }
  | { kind: IncidentDialog; id: string; label: string; icon: IconName; danger?: boolean };

/**
 * The working statuses, offered as actions, as on the web.
 *
 * Resolving and closing have their own actions because they demand something in writing, so what
 * is left is the middle of the lifecycle — the moves that are only reachable through
 * `PATCH /incidents/:id`. The state machine in `@ashniva/types` decides which exist.
 */
const WORKING_STATUSES: IncidentStatus[] = [
  INCIDENT_STATUS.INVESTIGATING,
  INCIDENT_STATUS.IDENTIFIED,
  INCIDENT_STATUS.MONITORING,
];

const STATUS_ICON: Partial<Record<IncidentStatus, IconName>> = {
  INVESTIGATING: 'search-outline',
  IDENTIFIED: 'locate-outline',
  MONITORING: 'pulse-outline',
};

/**
 * Everything the bar may offer. Every route behind these needs `incident:manage`, so somebody
 * without it gets nothing rather than buttons that answer 403.
 */
export function incidentActions(
  incident: IncidentDetail,
  canManage: boolean,
): OfferedIncidentAction[] {
  if (!canManage) {
    return [];
  }
  const moves: OfferedIncidentAction[] = WORKING_STATUSES.filter((status) =>
    canMoveIncident(incident.status, status),
  ).map((status) => ({
    kind: 'move',
    id: `move-${status}`,
    status,
    label: `Move to ${INCIDENT_STATUS_LABELS[status]}`,
    icon: STATUS_ICON[status] ?? 'arrow-forward-outline',
  }));
  const offered: OfferedIncidentAction[] = [...moves];
  if (!isIncidentEnded(incident.status)) {
    offered.push({
      kind: 'resolve',
      id: 'resolve',
      label: 'Resolve',
      icon: 'checkmark-circle-outline',
    });
  }
  if (incident.status === INCIDENT_STATUS.RESOLVED) {
    offered.push({
      kind: 'close',
      id: 'close',
      label: 'Close',
      icon: 'checkmark-done-outline',
      danger: true,
    });
  }
  offered.push(
    { kind: 'note', id: 'note', label: 'Add a note', icon: 'create-outline' },
    { kind: 'edit', id: 'edit', label: 'Edit details', icon: 'pencil-outline' },
  );
  return offered;
}

/**
 * The one step worth a full-width button: getting a fresh incident looked at, then ending it,
 * then closing it once the follow-up is done.
 */
export function primaryIncidentAction(
  incident: IncidentDetail,
  offered: OfferedIncidentAction[],
): OfferedIncidentAction | null {
  const find = (id: string) => offered.find((entry) => entry.id === id) ?? null;
  if (incident.status === INCIDENT_STATUS.OPEN) {
    return find(`move-${INCIDENT_STATUS.INVESTIGATING}`) ?? find('resolve');
  }
  return find('resolve') ?? find('close');
}
