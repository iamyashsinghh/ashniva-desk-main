import { DateTimeField } from '../../shared/components/DateTimeField';
import { Section } from '../../shared/components/layout';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import type { InvoiceForm } from './invoice-form';
import { useInvoiceLinks } from './use-invoice-links';

type Patch = (patch: Partial<InvoiceForm>) => void;

/**
 * Who the invoice is for, what it is raised against, and its dates.
 *
 * The client and contract are fixed once a draft exists — the API's PATCH does not take them — so
 * on an edit they are shown but cannot be changed. Changing the client clears the project and
 * contract, which belonged to the previous one.
 */
export function InvoicePartyFields({
  form,
  onPatch,
  clients,
  clientsLoading,
  editing,
  paymentTermsDays,
}: {
  form: InvoiceForm;
  onPatch: Patch;
  clients: readonly SelectOption[];
  clientsLoading: boolean;
  editing: boolean;
  paymentTermsDays: number;
}) {
  const links = useInvoiceLinks(form.clientOrganizationId);
  const hasClient = form.clientOrganizationId.length > 0;

  return (
    <Section title="Client and dates" icon="business-outline">
      <SelectField
        label="Client"
        required
        icon="business-outline"
        options={clients}
        loading={clientsLoading}
        disabled={editing}
        value={hasClient ? [form.clientOrganizationId] : []}
        onChange={(values) =>
          onPatch({ clientOrganizationId: values[0] ?? '', projectId: '', contractId: '' })
        }
        placeholder="Choose a client"
        {...(editing ? { hint: 'A draft stays with the client it was raised for' } : {})}
      />
      {links.readProjects ? (
        <SelectField
          label="Project"
          icon="folder-outline"
          options={links.projectOptions}
          loading={links.projectsLoading}
          disabled={!hasClient}
          allowClear={!editing}
          clearLabel="No project"
          value={form.projectId ? [form.projectId] : []}
          onChange={(values) => onPatch({ projectId: values[0] ?? '' })}
          placeholder={hasClient ? 'No project' : 'Choose a client first'}
        />
      ) : null}
      {links.readContracts ? (
        <SelectField
          label="Contract"
          icon="document-text-outline"
          options={links.contractOptions}
          loading={links.contractsLoading}
          disabled={!hasClient || editing}
          allowClear
          clearLabel="No contract"
          value={form.contractId ? [form.contractId] : []}
          onChange={(values) => onPatch({ contractId: values[0] ?? '' })}
          placeholder={hasClient ? 'No contract' : 'Choose a client first'}
        />
      ) : null}
      <DateTimeField
        label="Issue date"
        required
        allowClear={false}
        value={form.issueDate}
        onChange={(value) => value && onPatch({ issueDate: value })}
        hint="Not in the future"
      />
      <DateTimeField
        label="Due date"
        value={form.dueDate}
        allowClear={!editing}
        onChange={(value) => onPatch({ dueDate: value })}
        hint={
          form.dueDate ? undefined : `Defaults to ${paymentTermsDays} days after the issue date`
        }
      />
    </Section>
  );
}
