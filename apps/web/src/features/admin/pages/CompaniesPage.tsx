import {
  ORGANIZATION_TYPE,
  ORGANIZATION_TYPE_LABELS,
  PERMISSIONS,
  type OrganizationSummary,
  type OrganizationType,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { usePermission } from '../../auth/session-context';
import {
  useOrganizationDirectoryQuery,
  useOrganizationMutations,
  type OrganizationInput,
} from '../../users/api';

/** Companies & clients: every organization with people, projects and open tickets. */
export function CompaniesPage() {
  const canManage = usePermission(PERMISSIONS.ORGANIZATION_MANAGE);
  const organizations = useOrganizationDirectoryQuery();
  const [editing, setEditing] = useState<OrganizationSummary | 'new' | null>(null);

  const columns: TableColumn<OrganizationSummary>[] = [
    {
      key: 'name',
      header: 'Company',
      render: (organization) => (
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <strong>{organization.name}</strong>
          {organization.isServiceProvider ? <Badge tone="info">Service provider</Badge> : null}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '180px',
      hideOnMobile: true,
      render: (organization) => ORGANIZATION_TYPE_LABELS[organization.type],
    },
    {
      key: 'users',
      header: 'People',
      width: '80px',
      align: 'right',
      render: (organization) => organization.userCount,
    },
    {
      key: 'projects',
      header: 'Projects',
      width: '90px',
      align: 'right',
      hideOnMobile: true,
      render: (organization) => organization.projectCount,
    },
    {
      key: 'tickets',
      header: 'Open tickets',
      width: '110px',
      align: 'right',
      render: (organization) => organization.openTicketCount,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Companies & clients"
        actions={
          <Button
            variant="primary"
            disabled={!canManage}
            disabledReason="Only the service provider manages companies"
            onClick={() => setEditing('new')}
          >
            + New company
          </Button>
        }
      />
      <QueryState
        isLoading={organizations.isLoading}
        isError={organizations.isError}
        error={organizations.error}
        onRetry={() => void organizations.refetch()}
        loadingFallback={
          <Table
            aria-label="Companies"
            columns={columns}
            rows={[]}
            rowKey={(organization) => organization.id}
            loading
          />
        }
      >
        {organizations.data ? (
          <Table
            aria-label="Companies"
            columns={columns}
            rows={organizations.data}
            rowKey={(organization) => organization.id}
            onRowClick={canManage ? (organization) => setEditing(organization) : undefined}
            empty={<EmptyState title="No companies" />}
          />
        ) : null}
      </QueryState>
      {editing ? (
        <OrganizationModal
          organization={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function OrganizationModal({
  organization,
  onClose,
}: {
  organization?: OrganizationSummary;
  onClose: () => void;
}) {
  const { create, update } = useOrganizationMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState<OrganizationInput>({
    name: organization?.name ?? '',
    type: organization?.type ?? ORGANIZATION_TYPE.CORPORATE_CUSTOMER,
    timezone: organization?.timezone ?? 'Asia/Kolkata',
    currency: organization?.currency ?? 'INR',
  });
  const save = () =>
    organization ? update.mutateAsync({ id: organization.id, ...form }) : create.mutateAsync(form);
  return (
    <Modal
      open
      title={organization ? 'Edit company' : 'New company'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={form.name.trim().length < 2}
            disabledReason="Enter a name"
            onClick={() => void wrap(save)()}
          >
            {organization ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <FormField label="Name" required>
        <Input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </FormField>
      <FormField label="Type">
        <Select
          value={form.type}
          onChange={(event) => setForm({ ...form, type: event.target.value as OrganizationType })}
          options={Object.values(ORGANIZATION_TYPE).map((type) => ({
            value: type,
            label: ORGANIZATION_TYPE_LABELS[type],
          }))}
        />
      </FormField>
      <FormField label="Timezone">
        <Input
          value={form.timezone ?? ''}
          onChange={(event) => setForm({ ...form, timezone: event.target.value })}
        />
      </FormField>
      <FormField label="Currency">
        <Input
          value={form.currency ?? ''}
          maxLength={3}
          onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
