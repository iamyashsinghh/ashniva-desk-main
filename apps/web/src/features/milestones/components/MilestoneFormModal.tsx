import type { MilestoneDetail, MilestoneSummary } from '@ashniva/types';
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
  Toolbar,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useContractsQuery } from '../../contracts/api';
import { PeoplePicker } from '../../tasks/components/PeoplePicker';
import { useMilestoneMutations, useMilestonesQuery, type DeliverableInput } from '../api';

interface MilestoneFormModalProps {
  projectId: string;
  clientOrganizationId?: string | null;
  milestone?: MilestoneDetail;
  defaultContractId?: string;
  onClose: () => void;
  onSaved?: (milestone: MilestoneSummary) => void;
}

/** Create / edit a milestone with deliverables, dependencies, visibility and approval flag. */
export function MilestoneFormModal({
  projectId,
  clientOrganizationId,
  milestone,
  defaultContractId,
  onClose,
  onSaved,
}: MilestoneFormModalProps) {
  const { create, update } = useMilestoneMutations(milestone?.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const siblings = useMilestonesQuery({ projectId });
  const contracts = useContractsQuery(
    { view: 'all', clientOrganizationId: clientOrganizationId ?? undefined },
    Boolean(clientOrganizationId),
  );
  const [form, setForm] = useState({
    name: milestone?.name ?? '',
    description: milestone?.description ?? '',
    contractId: milestone?.contract?.id ?? defaultContractId ?? '',
    ownerUserId: milestone?.owner?.id ?? '',
    startDate: milestone?.startDate ?? '',
    dueDate: milestone?.dueDate ?? '',
    clientVisible: milestone?.clientVisible ?? true,
    requiresApproval: milestone?.requiresApproval ?? false,
    dependsOnIds: milestone?.dependsOn.map((entry) => entry.id) ?? [],
  });
  const [deliverables, setDeliverables] = useState<DeliverableInput[]>(
    milestone?.deliverables.map((item) => ({ title: item.title, isDone: item.isDone })) ?? [],
  );
  const valid =
    form.name.trim().length >= 2 && deliverables.every((item) => item.title.trim().length > 0);

  const save = async () => {
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      contractId: form.contractId || null,
      ownerUserId: form.ownerUserId || null,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      clientVisible: form.clientVisible,
      requiresApproval: form.requiresApproval,
      deliverables: deliverables.map((item) => ({
        title: item.title.trim(),
        isDone: item.isDone ?? false,
      })),
      dependsOnIds: form.dependsOnIds,
    };
    const saved = milestone
      ? await update.mutateAsync(body)
      : await create.mutateAsync({ projectId, ...body });
    onSaved?.(saved);
  };

  const updateDeliverable = (index: number, title: string) =>
    setDeliverables((current) =>
      current.map((item, at) => (at === index ? { ...item, title } : item)),
    );

  return (
    <Modal
      open
      size="lg"
      title={milestone ? `Edit ${milestone.name}` : 'New milestone'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="Name and deliverable titles are required"
            onClick={() => void wrap(save)()}
          >
            {milestone ? 'Save' : 'Create milestone'}
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormGridFull>
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormField label="Owner">
          <PeoplePicker
            value={form.ownerUserId}
            onChange={(userId) => setForm({ ...form, ownerUserId: userId })}
            placeholder="Unassigned"
          />
        </FormField>
        <FormField label="Contract">
          <Select
            value={form.contractId}
            onChange={(event) => setForm({ ...form, contractId: event.target.value })}
            options={[
              { value: '', label: 'None' },
              ...(contracts.data?.items ?? []).map((contract) => ({
                value: contract.id,
                label: `${contract.number} ${contract.title}`,
              })),
            ]}
          />
        </FormField>
        <FormField label="Start">
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm({ ...form, startDate: event.target.value })}
          />
        </FormField>
        <FormField label="Due">
          <Input
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Depends on" hint="Must be completed first (same project)">
            <Select
              multiple
              size={3}
              value={form.dependsOnIds}
              onChange={(event) =>
                setForm({
                  ...form,
                  dependsOnIds: Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  ),
                })
              }
              options={(siblings.data ?? [])
                .filter((entry) => entry.id !== milestone?.id)
                .map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Deliverables">
            <div style={{ display: 'grid', gap: 6 }}>
              {deliverables.map((item, index) => (
                <Input
                  key={index}
                  aria-label={`Deliverable ${index + 1}`}
                  value={item.title}
                  onChange={(event) => updateDeliverable(index, event.target.value)}
                />
              ))}
              <Toolbar>
                <Button
                  size="sm"
                  onClick={() => setDeliverables((current) => [...current, { title: '' }])}
                >
                  + Deliverable
                </Button>
                {deliverables.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeliverables((current) => current.slice(0, -1))}
                  >
                    Remove last
                  </Button>
                ) : null}
              </Toolbar>
            </div>
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <Switch
            tone="success"
            checked={form.clientVisible}
            onChange={(checked) => setForm({ ...form, clientVisible: checked })}
            label="Client-visible"
            description="Shown in the client portal with its progress and deliverables"
          />
        </FormGridFull>
        <FormGridFull>
          <Switch
            checked={form.requiresApproval}
            onChange={(checked) => setForm({ ...form, requiresApproval: checked })}
            label="Needs client sign-off"
            description="An approval request is prepared when the milestone is delivered"
          />
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
