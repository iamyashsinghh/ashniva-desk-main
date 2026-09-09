import {
  TICKET_STATUS,
  TICKET_STATUS_LABELS,
  type SlaPolicySummary,
  type TicketStatus,
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
import { useProjectsQuery } from '../../projects/api';
import { useOrganizationsQuery } from '../../users/api';
import { useSlaPolicyMutations, type SlaPolicyInput } from '../api';
import { PRIORITIES, type RuleDrafts } from '../sla-rules';
import { BusinessDayPicker } from './BusinessDayPicker';
import { SlaTargetsTable } from './SlaTargetsTable';

const PAUSABLE: TicketStatus[] = [
  TICKET_STATUS.WAITING_CLIENT,
  TICKET_STATUS.REVIEW,
  TICKET_STATUS.ESCALATED,
];

type Scope = 'default' | 'client' | 'project';

function scopeOf(policy?: SlaPolicySummary): Scope {
  if (policy?.project) {
    return 'project';
  }
  return policy?.clientOrganization ? 'client' : 'default';
}

function draftRules(policy?: SlaPolicySummary): RuleDrafts {
  const fallback: RuleDrafts = {
    CRITICAL: { firstResponseHours: '1', resolutionHours: '4' },
    HIGH: { firstResponseHours: '2', resolutionHours: '8' },
    MEDIUM: { firstResponseHours: '4', resolutionHours: '24' },
    LOW: { firstResponseHours: '8', resolutionHours: '40' },
  };
  for (const rule of policy?.rules ?? []) {
    fallback[rule.priority] = {
      firstResponseHours: String(rule.firstResponseMinutes / 60),
      resolutionHours: String(rule.resolutionMinutes / 60),
    };
  }
  return fallback;
}

/** Create or edit a policy: scope, business hours, pause statuses and per-priority targets. */
export function SlaPolicyFormModal({
  policy,
  onClose,
}: {
  policy?: SlaPolicySummary;
  onClose: () => void;
}) {
  const { create, update } = useSlaPolicyMutations(policy?.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const organizations = useOrganizationsQuery();
  const projects = useProjectsQuery();
  const [scope, setScope] = useState<Scope>(scopeOf(policy));
  const [form, setForm] = useState({
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    clientOrganizationId: policy?.clientOrganization?.id ?? '',
    projectId: policy?.project?.id ?? '',
    timezone: policy?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    businessHoursStart: policy?.businessHoursStart ?? '09:00',
    businessHoursEnd: policy?.businessHoursEnd ?? '18:00',
    warningPercent: String(policy?.warningPercent ?? 80),
  });
  const [days, setDays] = useState<number[]>(policy?.businessDays ?? [1, 2, 3, 4, 5]);
  const [pauseStatuses, setPauseStatuses] = useState<TicketStatus[]>(
    policy?.pauseStatuses ?? [TICKET_STATUS.WAITING_CLIENT],
  );
  const [rules, setRules] = useState(draftRules(policy));
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  const valid =
    form.name.trim().length >= 2 &&
    days.length > 0 &&
    (scope !== 'client' || form.clientOrganizationId) &&
    (scope !== 'project' || form.projectId);

  const save = () => {
    const body: SlaPolicyInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      isDefault: scope === 'default',
      clientOrganizationId: scope === 'client' ? form.clientOrganizationId : null,
      projectId: scope === 'project' ? form.projectId : null,
      timezone: form.timezone,
      businessHoursStart: form.businessHoursStart,
      businessHoursEnd: form.businessHoursEnd,
      businessDays: [...days].sort((a, b) => a - b),
      pauseStatuses,
      warningPercent: Number(form.warningPercent),
      rules: PRIORITIES.map((priority) => ({
        priority,
        firstResponseMinutes: Math.round(Number(rules[priority].firstResponseHours) * 60),
        resolutionMinutes: Math.round(Number(rules[priority].resolutionHours) * 60),
      })),
    };
    return policy ? update.mutateAsync(body) : create.mutateAsync(body);
  };

  return (
    <Modal
      open
      size="lg"
      title={policy ? 'Edit SLA policy' : 'New SLA policy'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="Name, scope and at least one business day are required"
            onClick={() => void wrap(save)()}
          >
            {policy ? 'Save and re-apply' : 'Create policy'}
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Name" required>
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </FormField>
        <FormField label="Applies to" required>
          <Select
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            options={[
              { value: 'default', label: 'Everything (default)' },
              { value: 'client', label: 'One client' },
              { value: 'project', label: 'One project' },
            ]}
          />
        </FormField>
        {scope === 'client' ? (
          <FormField label="Client" required>
            <Select
              value={form.clientOrganizationId}
              placeholder="Choose"
              onChange={(event) => setForm({ ...form, clientOrganizationId: event.target.value })}
              options={(organizations.data ?? [])
                .filter((org) => !org.isServiceProvider)
                .map((org) => ({ value: org.id, label: org.name }))}
            />
          </FormField>
        ) : null}
        {scope === 'project' ? (
          <FormField label="Project" required>
            <Select
              value={form.projectId}
              placeholder="Choose"
              onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              options={(projects.data ?? []).map((project) => ({
                value: project.id,
                label: `${project.code} ${project.name}`,
              }))}
            />
          </FormField>
        ) : null}
        <FormField label="Timezone" hint="IANA name, e.g. Asia/Kolkata">
          <Input
            value={form.timezone}
            onChange={(event) => setForm({ ...form, timezone: event.target.value })}
          />
        </FormField>
        <FormField label="Warn at (% of target)">
          <Input
            type="number"
            min={1}
            max={99}
            value={form.warningPercent}
            onChange={(event) => setForm({ ...form, warningPercent: event.target.value })}
          />
        </FormField>
        <FormField label="Business hours start">
          <Input
            type="time"
            value={form.businessHoursStart}
            onChange={(event) => setForm({ ...form, businessHoursStart: event.target.value })}
          />
        </FormField>
        <FormField label="Business hours end">
          <Input
            type="time"
            value={form.businessHoursEnd}
            onChange={(event) => setForm({ ...form, businessHoursEnd: event.target.value })}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Business days" required>
            <BusinessDayPicker days={days} onToggle={(day) => setDays(toggle(days, day))} />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Pause the clock while the ticket is">
            <div>
              {PAUSABLE.map((status) => (
                <Switch
                  key={status}
                  checked={pauseStatuses.includes(status)}
                  onChange={() => setPauseStatuses(toggle(pauseStatuses, status))}
                  label={TICKET_STATUS_LABELS[status]}
                />
              ))}
            </div>
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Targets in business hours, per priority" required>
            <SlaTargetsTable
              rules={rules}
              onChange={(priority, patch) =>
                setRules({ ...rules, [priority]: { ...rules[priority], ...patch } })
              }
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
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
