import {
  CONTRACT_LIST_VIEW,
  CONTRACT_TYPE,
  CONTRACT_TYPE_LABELS,
  PERMISSIONS,
  type ContractListView,
  type ContractType,
} from '@ashniva/types';
import { Button, Input, PageHeader, SegmentedControl, Select } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useOrganizationsQuery } from '../../users/api';
import { useContractsQuery } from '../api';
import { ContractFormModal } from '../components/ContractFormModal';
import { ContractTable } from '../components/ContractTable';

const VIEW_LABELS: Record<ContractListView, string> = {
  active: 'Active',
  expiring: 'Expiring soon',
  draft: 'Drafts',
  expired: 'Expired',
  archived: 'Archived',
  all: 'All',
};

/** Contracts list: view chips, type and client filters, search, create. */
export function ContractsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = usePermission(PERMISSIONS.CONTRACT_MANAGE);
  const [creating, setCreating] = useState(false);
  const view = (params.get('view') ?? CONTRACT_LIST_VIEW.ACTIVE) as ContractListView;
  const type = (params.get('type') ?? '') as ContractType | '';
  const clientOrganizationId = params.get('clientOrganizationId') ?? '';
  const search = params.get('search') ?? '';
  const contracts = useContractsQuery({
    view,
    type: type || undefined,
    clientOrganizationId: clientOrganizationId || undefined,
    search: search || undefined,
  });
  const organizations = useOrganizationsQuery();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="list-page">
      <PageHeader
        title="Contracts"
        subtitle={contracts.data ? `${contracts.data.total} contracts` : undefined}
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New contract
            </Button>
          ) : undefined
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParam('view', next)}
          options={Object.values(CONTRACT_LIST_VIEW).map((entry) => ({
            key: entry,
            label: VIEW_LABELS[entry],
          }))}
        />
        <Select
          aria-label="Type"
          value={type}
          onChange={(event) => setParam('type', event.target.value)}
          options={[
            { value: '', label: 'All types' },
            ...Object.values(CONTRACT_TYPE).map((entry) => ({
              value: entry,
              label: CONTRACT_TYPE_LABELS[entry],
            })),
          ]}
        />
        <Select
          aria-label="Client"
          value={clientOrganizationId}
          onChange={(event) => setParam('clientOrganizationId', event.target.value)}
          options={[
            { value: '', label: 'All clients' },
            ...(organizations.data ?? [])
              .filter((organization) => !organization.isServiceProvider)
              .map((organization) => ({ value: organization.id, label: organization.name })),
          ]}
        />
        <Input
          type="search"
          aria-label="Search contracts"
          placeholder="Search number, title…"
          defaultValue={search}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setParam('search', (event.target as HTMLInputElement).value);
            }
          }}
        />
      </PageHeader>
      <QueryState
        isLoading={contracts.isLoading}
        isError={contracts.isError}
        error={contracts.error}
        onRetry={() => void contracts.refetch()}
        loadingFallback={<ContractTable contracts={[]} loading />}
      >
        {contracts.data ? (
          <ContractTable contracts={contracts.data.items} emptyTitle="No contracts match" />
        ) : null}
      </QueryState>
      {creating ? (
        <ContractFormModal
          onClose={() => setCreating(false)}
          onSaved={(id) => void navigate(`/contracts/${id}`)}
        />
      ) : null}
    </div>
  );
}
