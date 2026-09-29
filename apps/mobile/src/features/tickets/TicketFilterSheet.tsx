import {
  PERMISSIONS,
  PHASE1_TICKET_STATUSES,
  PRIORITY,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE,
  TICKET_TYPE_LABELS,
  type Priority,
  type TicketStatus,
  type TicketType,
} from '@ashniva/types';

import { FilterSheet } from '../../shared/components/FilterSheet';
import { UserPicker } from '../../shared/components/pickers';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useSession } from '../auth/SessionProvider';
import { useCompanyOptions, useTicketProjectOptions } from './ticket-options';
import { NO_FILTERS, type TicketAudience, type TicketFilters } from './ticket-views';

const STATUS_OPTIONS: SelectOption<TicketStatus>[] = PHASE1_TICKET_STATUSES.map((status) => ({
  value: status,
  label: TICKET_STATUS_LABELS[status],
}));
const PRIORITY_OPTIONS: SelectOption<Priority>[] = Object.values(PRIORITY).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  icon: 'flag-outline',
}));
const TYPE_OPTIONS: SelectOption<TicketType>[] = Object.values(TICKET_TYPE).map((type) => ({
  value: type,
  label: TICKET_TYPE_LABELS[type],
}));

/**
 * The desk's filters.
 *
 * Each control is offered only to somebody whose request for its list would be answered: the
 * people picker reads the directory (`task:read`), the company list is the triage view's, and the
 * status list is the internal workflow — a client filters on the portal's views instead, and is
 * never shown the internal status names.
 */
export function TicketFilterSheet({
  visible,
  onClose,
  audience,
  filters,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  audience: TicketAudience;
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}) {
  const { can } = useSession();
  const client = audience === 'client';
  const canPickProject = can(PERMISSIONS.PROJECT_READ);
  const canPickPerson = !client && can(PERMISSIONS.TASK_READ);
  const canPickCompany = !client && can(PERMISSIONS.TICKET_TRIAGE);
  const projects = useTicketProjectOptions(client, visible && canPickProject);
  const companies = useCompanyOptions(visible && canPickCompany);

  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <FilterSheet visible={visible} onClose={onClose} onReset={() => onChange(NO_FILTERS)}>
      {client ? null : (
        <SelectField
          label="Status"
          icon="git-branch-outline"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(values) => set('status', values)}
          multiple
          placeholder="Any status"
        />
      )}
      <SelectField
        label="Priority"
        icon="flag-outline"
        options={PRIORITY_OPTIONS}
        value={filters.priority ? [filters.priority] : []}
        onChange={(values) => set('priority', values[0] ?? null)}
        allowClear
        clearLabel="Any priority"
        placeholder="Any priority"
      />
      <SelectField
        label="Category"
        icon="pricetag-outline"
        options={TYPE_OPTIONS}
        value={filters.type ? [filters.type] : []}
        onChange={(values) => set('type', values[0] ?? null)}
        allowClear
        clearLabel="Any category"
        placeholder="Any category"
      />
      {canPickProject ? (
        <SelectField
          label="Project"
          icon="folder-outline"
          options={projects.options}
          value={filters.projectId ? [filters.projectId] : []}
          onChange={(values) => set('projectId', values[0] ?? null)}
          loading={projects.isLoading}
          allowClear
          clearLabel="Any project"
          placeholder="Any project"
        />
      ) : null}
      {canPickPerson ? (
        <UserPicker
          label="Assignee"
          value={filters.assignedToId ? [filters.assignedToId] : []}
          onChange={(ids) => set('assignedToId', ids[0] ?? null)}
          placeholder="Anybody"
        />
      ) : null}
      {canPickCompany ? (
        <SelectField
          label="Company"
          icon="business-outline"
          options={companies.options}
          value={filters.clientOrganizationId ? [filters.clientOrganizationId] : []}
          onChange={(values) => set('clientOrganizationId', values[0] ?? null)}
          loading={companies.isLoading}
          allowClear
          clearLabel="All companies"
          placeholder="All companies"
        />
      ) : null}
    </FilterSheet>
  );
}
