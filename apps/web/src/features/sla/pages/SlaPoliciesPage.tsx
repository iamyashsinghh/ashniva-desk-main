import {
  PERMISSIONS,
  PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type SlaPolicySummary,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  FormActions,
  Modal,
  PageHeader,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { usePermission } from '../../auth/session-context';
import { useSlaPoliciesQuery, useSlaPolicyMutations } from '../api';
import { SlaPolicyFormModal } from '../components/SlaPolicyFormModal';

import '../../dashboard/dashboard.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function hours(minutes: number): string {
  return Number.isInteger(minutes / 60) ? `${minutes / 60}h` : `${(minutes / 60).toFixed(1)}h`;
}

function scopeBadge(policy: SlaPolicySummary) {
  if (policy.project) {
    return <Badge tone="info">Project · {policy.project.code}</Badge>;
  }
  if (policy.clientOrganization) {
    return <Badge tone="review">Client · {policy.clientOrganization.name}</Badge>;
  }
  return <Badge tone="success">Default</Badge>;
}

/** Admin → SLA policies: default, per-client and per-project targets with business hours. */
export function SlaPoliciesPage() {
  const canManage = usePermission(PERMISSIONS.SLA_MANAGE);
  const policies = useSlaPoliciesQuery();
  const [editing, setEditing] = useState<SlaPolicySummary | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SlaPolicySummary | null>(null);

  return (
    <div className="dashboard">
      <PageHeader
        title="SLA policies"
        subtitle="Response and resolution targets in business hours. A project policy wins over a client policy, which wins over the default."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              New policy
            </Button>
          ) : undefined
        }
      />
      <QueryState
        isLoading={policies.isLoading}
        isError={policies.isError}
        error={policies.error}
        onRetry={() => void policies.refetch()}
      >
        {policies.data && policies.data.length > 0 ? (
          <div className="dashboard__grid dashboard__grid--equal">
            {policies.data.map((policy) => (
              <Card
                key={policy.id}
                title={policy.name}
                headerAddon={
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {scopeBadge(policy)}
                    <span className="muted">{policy.ticketCount} open tickets</span>
                  </span>
                }
              >
                {policy.description ? (
                  <p className="muted" style={{ marginBottom: 8 }}>
                    {policy.description}
                  </p>
                ) : null}
                <DescriptionList items={policyItems(policy)} />
                {canManage ? (
                  <div className="stack-top">
                    <FormActions>
                      <Button size="sm" onClick={() => setEditing(policy)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(policy)}>
                        Delete
                      </Button>
                    </FormActions>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No SLA policies"
            description="Tickets have no response or resolution targets until a default policy exists."
          />
        )}
      </QueryState>
      {editing ? (
        <SlaPolicyFormModal
          policy={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeletePolicyModal policy={deleting} onClose={() => setDeleting(null)} /> : null}
    </div>
  );
}

function DeletePolicyModal({ policy, onClose }: { policy: SlaPolicySummary; onClose: () => void }) {
  const { remove } = useSlaPolicyMutations(policy.id);
  const { error, wrap } = useSubmitHandler(onClose);
  return (
    <Modal
      open
      title="Delete this policy?"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => void wrap(() => remove.mutateAsync())()}
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="prose">
        “{policy.name}” will be removed and its {policy.ticketCount} open tickets fall back to the
        next matching policy (or no SLA).
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

/**
 * One policy's rows: the three settings, then one row per priority.
 *
 * The per-priority rows used to be `<div style={{ display: 'contents' }}>` wrappers, which exist
 * only to let a `map` produce `<dt>`/`<dd>` pairs inside a grid — a `div` between a `dl` and its
 * terms is invalid, and the `display: contents` was there to hide it from the layout rather than
 * from the document. An array of rows needs neither.
 */
function policyItems(policy: SlaPolicySummary): DescriptionItem[] {
  return [
    {
      key: 'business-hours',
      term: 'Business hours',
      description: `${policy.businessHoursStart}–${policy.businessHoursEnd} ${policy.timezone} · ${policy.businessDays
        .map((day) => DAYS[day - 1])
        .join(', ')}`,
    },
    {
      key: 'pauses-while',
      term: 'Pauses while',
      description:
        policy.pauseStatuses.length > 0
          ? policy.pauseStatuses.map((status) => TICKET_STATUS_LABELS[status]).join(', ')
          : 'Never',
    },
    {
      key: 'warn-at',
      term: 'Warn at',
      description: `${policy.warningPercent}% of the target`,
    },
    ...policy.rules.map((rule) => ({
      key: `rule-${rule.priority}`,
      term: PRIORITY_LABELS[rule.priority],
      description: `Respond in ${hours(rule.firstResponseMinutes)} · resolve in ${hours(
        rule.resolutionMinutes,
      )}`,
    })),
  ];
}
