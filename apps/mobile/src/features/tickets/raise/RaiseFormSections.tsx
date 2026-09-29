import {
  PERMISSIONS,
  PRIORITY,
  PRIORITY_LABELS,
  TICKET_TYPE,
  TICKET_TYPE_LABELS,
  type Priority,
  type TicketType,
} from '@ashniva/types';

import { ChipGroup } from '../../../shared/components/chips';
import { Section } from '../../../shared/components/layout';
import { Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { isProviderUser } from '../../auth/audience';
import { useSession } from '../../auth/SessionProvider';
import { useCompanyOptions, useTicketProjectOptions } from '../ticket-options';
import type { RaiseErrors, RaiseForm } from './raise-form';

const PRIORITIES: Priority[] = Object.values(PRIORITY);
const TYPE_OPTIONS = Object.values(TICKET_TYPE).map((value: TicketType) => ({
  value,
  label: TICKET_TYPE_LABELS[value],
}));

type SetField = <K extends keyof RaiseForm>(key: K, value: RaiseForm[K]) => void;

/**
 * Whose ticket it is and what it is about.
 *
 * Staff raising for a client pick the company first, and the project list narrows to that
 * company's projects; a client only ever sees their own projects, from the portal. Somebody who
 * may not read projects gets no project field at all rather than an empty one.
 */
export function RaiseWhereSection({ form, set }: { form: RaiseForm; set: SetField }) {
  const { user, can } = useSession();
  const staff = isProviderUser(user);
  const showProjects = !staff || can(PERMISSIONS.PROJECT_READ);
  const companies = useCompanyOptions(staff);
  const projects = useTicketProjectOptions(!staff, showProjects);
  const projectOptions = projects.options.filter(
    (project) =>
      !staff ||
      !form.clientOrganizationId ||
      project.clientOrganizationId === form.clientOrganizationId,
  );

  if (!staff && projectOptions.length === 0 && !projects.isLoading) {
    return null;
  }

  return (
    <Section title="Where" icon="business-outline">
      {staff ? (
        <SelectField
          label="On behalf of (company)"
          icon="business-outline"
          options={companies.options}
          value={form.clientOrganizationId ? [form.clientOrganizationId] : []}
          onChange={(ids) => {
            set('clientOrganizationId', ids[0] ?? null);
            set('projectId', null);
          }}
          loading={companies.isLoading}
          allowClear
          clearLabel="Our own organization"
          placeholder="Our own organization"
        />
      ) : null}
      {showProjects ? (
        <SelectField
          label="Project / product"
          icon="folder-open-outline"
          options={projectOptions}
          value={form.projectId ? [form.projectId] : []}
          onChange={(ids) => set('projectId', ids[0] ?? null)}
          loading={projects.isLoading}
          allowClear
          clearLabel="Not sure / general"
          placeholder="Not sure / general"
        />
      ) : null}
    </Section>
  );
}

/** How urgent, what kind, and where in the product — the web's "More details", always open here. */
export function RaiseDetailsSection({
  form,
  errors,
  set,
}: {
  form: RaiseForm;
  errors: RaiseErrors;
  set: SetField;
}) {
  return (
    <Section title="Details" icon="options-outline">
      <ChipGroup
        label="How urgent"
        options={PRIORITIES}
        selected={form.priority}
        onSelect={(value) => set('priority', value)}
        labelFor={(value) => PRIORITY_LABELS[value]}
      />
      <SelectField
        label="Category"
        icon="pricetag-outline"
        options={TYPE_OPTIONS}
        value={[form.type]}
        onChange={(ids) => set('type', (ids[0] as TicketType | undefined) ?? TICKET_TYPE.SUPPORT)}
        allowClear={false}
      />
      <Field
        label="Affected area"
        hint="The module or screen, if you know it"
        error={errors.module}
      >
        <Input
          accessibilityLabel="Affected area"
          onChangeText={(value) => set('module', value)}
          placeholder="Checkout, Reports, Login…"
          value={form.module}
        />
      </Field>
      <Field
        label="Version"
        hint="The build or app version you were on"
        error={errors.productVersion}
      >
        <Input
          accessibilityLabel="Version"
          autoCapitalize="none"
          onChangeText={(value) => set('productVersion', value)}
          placeholder="2.4.1"
          value={form.productVersion}
        />
      </Field>
    </Section>
  );
}
