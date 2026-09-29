import { REPORT_TYPE, type ReportFilters, type ReportType } from '@ashniva/types';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { FilterSheet } from '../../shared/components/FilterSheet';
import { SelectField } from '../../shared/components/SelectField';
import type { ReportFilterOptions } from './use-report-filter-options';

/** The reports that narrow by person; the others ignore the filter, so it is not offered there. */
const PERSON_REPORTS: readonly ReportType[] = [
  REPORT_TYPE.TASK_COMPLETION,
  REPORT_TYPE.TEAM_WORKLOAD,
];

export function reportTakesPerson(type: ReportType | null): boolean {
  return type !== null && PERSON_REPORTS.includes(type);
}

/**
 * The advanced report filters: the date range, a client, a project and — for the reports about
 * people — a person. Filters apply as they are chosen, as on the web.
 */
export function ReportFiltersSheet({
  visible,
  onClose,
  type,
  filters,
  onChange,
  options,
}: {
  visible: boolean;
  onClose: () => void;
  type: ReportType | null;
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  options: ReportFilterOptions;
}) {
  const set = (key: keyof ReportFilters, value: string | null) =>
    onChange({ ...filters, [key]: value ?? undefined });

  return (
    <FilterSheet visible={visible} onClose={onClose} onReset={() => onChange({})}>
      <DateTimeField
        label="From"
        value={filters.from ?? null}
        onChange={(value) => set('from', value)}
        placeholder="30 days before “To”"
      />
      <DateTimeField
        label="To"
        value={filters.to ?? null}
        onChange={(value) => set('to', value)}
        placeholder="Today"
        hint="A report covers at most one year."
      />
      {options.clients ? (
        <SelectField
          label="Client"
          icon="business-outline"
          options={options.clients}
          value={filters.clientOrganizationId ? [filters.clientOrganizationId] : []}
          onChange={(ids) => set('clientOrganizationId', ids[0] ?? null)}
          placeholder="All clients"
          allowClear
          clearLabel="All clients"
          loading={options.loading}
        />
      ) : null}
      {options.projects ? (
        <SelectField
          label="Project"
          icon="folder-outline"
          options={options.projects}
          value={filters.projectId ? [filters.projectId] : []}
          onChange={(ids) => set('projectId', ids[0] ?? null)}
          placeholder="All projects"
          allowClear
          clearLabel="All projects"
          loading={options.loading}
        />
      ) : null}
      {options.people && reportTakesPerson(type) ? (
        <SelectField
          label="Person"
          icon="person-outline"
          options={options.people}
          value={filters.userId ? [filters.userId] : []}
          onChange={(ids) => set('userId', ids[0] ?? null)}
          placeholder="Everyone you can see"
          allowClear
          clearLabel="Everyone you can see"
          loading={options.loading}
        />
      ) : null}
    </FilterSheet>
  );
}
