import {
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  CONTRACT_TYPE_LABELS,
  PERMISSIONS,
  type ContractDetail,
} from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { usePermission } from '../../auth/session-context';
import { useProjectsQuery } from '../../projects/api';
import { useOrganizationsQuery } from '../../users/api';
import { useContractMutations } from '../api';
import { initialContractForm, toContractInput, type ContractFormState } from '../contract-form';
import { ContractHoursFields } from './ContractHoursFields';

interface ContractFormModalProps {
  contract?: ContractDetail;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const HOURS_TYPES: string[] = [
  CONTRACT_TYPE.SUPPORT_HOURS,
  CONTRACT_TYPE.AMC,
  CONTRACT_TYPE.RETAINER,
];

/** Create / edit a contract. Internal cost is only offered to people with cost:read. */
export function ContractFormModal({ contract, onClose, onSaved }: ContractFormModalProps) {
  const canSeeCost = usePermission(PERMISSIONS.COST_READ);
  const organizations = useOrganizationsQuery();
  const projects = useProjectsQuery({}, true);
  const { create, update } = useContractMutations(contract?.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState(() => initialContractForm(contract));
  const set = <K extends keyof ContractFormState>(key: K, value: ContractFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const tracksHours = HOURS_TYPES.includes(form.type) || Number(form.includedHours) > 0;
  const valid = form.clientOrganizationId && form.title.trim().length >= 3 && form.startDate;

  const save = async () => {
    const body = toContractInput(form, canSeeCost);
    const saved = contract ? await update.mutateAsync(body) : await create.mutateAsync(body);
    onSaved?.(saved.id);
  };

  const clientProjects = (projects.data ?? []).filter(
    (project) => project.clientOrganization?.id === form.clientOrganizationId,
  );

  return (
    <Modal
      open
      size="lg"
      title={contract ? `Edit ${contract.number}` : 'New contract'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="Client, title and start date are required"
            onClick={() => void wrap(save)()}
          >
            {contract ? 'Save' : 'Create contract'}
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Client" required>
          <Select
            value={form.clientOrganizationId}
            disabled={Boolean(contract)}
            placeholder="Choose a client"
            onChange={(event) => set('clientOrganizationId', event.target.value)}
            options={(organizations.data ?? [])
              .filter((organization) => !organization.isServiceProvider)
              .map((organization) => ({ value: organization.id, label: organization.name }))}
          />
        </FormField>
        <FormField label="Project (optional)">
          <Select
            value={form.projectId}
            onChange={(event) => set('projectId', event.target.value)}
            options={[
              { value: '', label: 'Whole client' },
              ...clientProjects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        </FormField>
        <FormField label="Type" required>
          <Select
            value={form.type}
            onChange={(event) => set('type', event.target.value as typeof form.type)}
            options={Object.values(CONTRACT_TYPE).map((type) => ({
              value: type,
              label: CONTRACT_TYPE_LABELS[type],
            }))}
          />
        </FormField>
        <FormField label="Status" required>
          <Select
            value={form.status}
            onChange={(event) => set('status', event.target.value as typeof form.status)}
            options={[
              { value: CONTRACT_STATUS.DRAFT, label: 'Draft' },
              { value: CONTRACT_STATUS.ACTIVE, label: 'Active' },
              { value: CONTRACT_STATUS.EXPIRED, label: 'Expired' },
            ]}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Title" required>
            <Input value={form.title} onChange={(event) => set('title', event.target.value)} />
          </FormField>
        </FormGridFull>
        <FormField label="Start date" required>
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </FormField>
        <FormField label="End date">
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => set('endDate', event.target.value)}
          />
        </FormField>
        <FormField label="Renewal date">
          <Input
            type="date"
            value={form.renewalDate}
            onChange={(event) => set('renewalDate', event.target.value)}
          />
        </FormField>
        <FormGridFull>
          <Switch
            checked={form.autoRenew}
            onChange={(checked) => set('autoRenew', checked)}
            label="Auto-renew"
          />
        </FormGridFull>
        <FormField label="Currency">
          <Input
            value={form.currency}
            maxLength={3}
            onChange={(event) => set('currency', event.target.value)}
          />
        </FormField>
        <FormField label="Contract value" hint="Client-visible on invoices only">
          <Input
            inputMode="decimal"
            value={form.contractValue}
            onChange={(event) => set('contractValue', event.target.value)}
          />
        </FormField>
        {canSeeCost ? (
          <FormField label="Internal cost" hint="Never shown to clients">
            <Input
              inputMode="decimal"
              value={form.internalCost}
              onChange={(event) => set('internalCost', event.target.value)}
            />
          </FormField>
        ) : null}
        <FormField label="Included hours per period" hint="0 = no hour tracking">
          <Input
            inputMode="decimal"
            value={form.includedHours}
            onChange={(event) => set('includedHours', event.target.value)}
          />
        </FormField>
        {tracksHours ? <ContractHoursFields form={form} set={set} /> : null}
        <FormGridFull>
          <FormField label="Scope" hint="Shown to the client">
            <Textarea
              rows={3}
              value={form.scope}
              onChange={(event) => set('scope', event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Notes for the client">
            <Textarea
              rows={2}
              value={form.clientNotes}
              onChange={(event) => set('clientNotes', event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Internal notes" hint="Never shown to clients">
            <Textarea
              rows={2}
              value={form.internalNotes}
              onChange={(event) => set('internalNotes', event.target.value)}
            />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
