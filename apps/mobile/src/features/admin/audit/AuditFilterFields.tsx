import { DateTimeField } from '../../../shared/components/DateTimeField';
import { UserPicker } from '../../../shared/components/pickers';
import { SelectField } from '../../../shared/components/SelectField';
import { ENTITY_TYPE_OPTIONS, type AuditFilters } from './audit-display';

/** The filter sheet's fields. Each applies as it is chosen; "Show results" only closes the sheet. */
export function AuditFilterFields({
  filters,
  onChange,
}: {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
}) {
  return (
    <>
      <SelectField
        label="Type"
        icon="pricetag-outline"
        options={ENTITY_TYPE_OPTIONS}
        value={filters.entityType ? [filters.entityType] : []}
        onChange={(values) => onChange({ ...filters, entityType: values[0] ?? null })}
        allowClear
        clearLabel="Every type"
        placeholder="Every type"
      />
      <UserPicker
        label="Person"
        value={filters.actorUserId ? [filters.actorUserId] : []}
        onChange={(ids) => onChange({ ...filters, actorUserId: ids[0] ?? null })}
        placeholder="Anyone"
      />
      <DateTimeField
        label="From"
        value={filters.from}
        onChange={(from) => onChange({ ...filters, from })}
        placeholder="Any day"
      />
      <DateTimeField
        label="To"
        value={filters.to}
        onChange={(to) => onChange({ ...filters, to })}
        placeholder="Any day"
      />
    </>
  );
}
