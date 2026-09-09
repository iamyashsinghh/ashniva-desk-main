import type { EffectiveAvailability, SupportOwnershipSummary } from '@ashniva/types';
import {
  Alert,
  Button,
  Card,
  FormActions,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Select,
  Switch,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import type { SupportOwnershipInput } from '../api';

export interface SupportOwnershipCardProps {
  ownership: SupportOwnershipSummary;
  team: EffectiveAvailability[];
  onSave: (input: SupportOwnershipInput) => Promise<unknown>;
}

/** The named roles, in the order the router will try them. */
const ROLES = [
  { key: 'primaryDeveloperId', label: 'Primary developer', of: 'primaryDeveloper' },
  { key: 'backupDeveloperId', label: 'Backup developer', of: 'backupDeveloper' },
  { key: 'seniorId', label: 'Senior / escalation', of: 'senior' },
  { key: 'testerId', label: 'Tester', of: 'tester' },
  { key: 'supportExecutiveId', label: 'Support executive', of: 'supportExecutive' },
] as const;

type ModuleRow = { area: string; userId: string };

function toRows(owners: Record<string, string>): ModuleRow[] {
  return Object.entries(owners).map(([area, userId]) => ({ area, userId }));
}

/**
 * Who covers this project's support.
 *
 * The chain here is the one §19.1 describes: a ticket about a named module goes to whoever owns
 * that module, and only when nobody does does it fall through to the primary developer, then
 * whoever is on call, then the backup. Filling in the module owners is therefore the highest-value
 * part of this form, not an afterthought.
 */
export function SupportOwnershipCard({ ownership, team, onSave }: SupportOwnershipCardProps) {
  const [roles, setRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(ROLES.map((role) => [role.key, ownership[role.of]?.id ?? ''])),
  );
  const [modules, setModules] = useState<ModuleRow[]>(() => toRows(ownership.moduleOwners));
  const [ack, setAck] = useState(String(ownership.ackMinutes));
  const [escalation, setEscalation] = useState(String(ownership.escalationMinutes));
  const [limit, setLimit] = useState(
    ownership.workloadLimit === null ? '' : String(ownership.workloadLimit),
  );
  const [autoRoute, setAutoRoute] = useState(ownership.autoRouteEnabled);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const people = [
    { value: '', label: 'Nobody' },
    ...team.map((member) => ({ value: member.userId, label: member.user.name })),
  ];

  const setModule = (index: number, patch: Partial<ModuleRow>) =>
    setModules((rows) => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  async function save() {
    setError(undefined);
    setSaving(true);
    try {
      await onSave({
        primaryDeveloperId: roles.primaryDeveloperId || null,
        backupDeveloperId: roles.backupDeveloperId || null,
        seniorId: roles.seniorId || null,
        testerId: roles.testerId || null,
        supportExecutiveId: roles.supportExecutiveId || null,
        // Rows with no area or nobody named are dropped rather than sent as empty keys.
        moduleOwners: Object.fromEntries(
          modules
            .filter((row) => row.area.trim() !== '' && row.userId !== '')
            .map((row) => [row.area.trim(), row.userId]),
        ),
        workloadLimit: limit.trim() === '' ? null : Number(limit),
        ackMinutes: Number(ack),
        escalationMinutes: Number(escalation),
        autoRouteEnabled: autoRoute,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Support ownership"
      headerAddon={<span className="muted">Tried in this order when a ticket arrives</span>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Switch
        checked={autoRoute}
        onChange={setAutoRoute}
        label="Route tickets automatically"
        description="Off means every ticket on this project waits for somebody to assign it by hand."
      />
      <FormGrid className="stack-top">
        {ROLES.map((role) => (
          <FormField key={role.key} label={role.label}>
            <Select
              options={people}
              value={roles[role.key] ?? ''}
              onChange={(event) =>
                setRoles((current) => ({ ...current, [role.key]: event.target.value }))
              }
            />
          </FormField>
        ))}
      </FormGrid>

      <h3 className="section-title">Module owners</h3>
      <p className="muted">
        A ticket naming one of these work areas goes to its owner before anybody else is considered.
      </p>
      {modules.map((row, index) => (
        <div className="support-module" key={`${index}-${row.area}`}>
          <FormField label="Work area">
            <Input
              value={row.area}
              placeholder="Billing"
              onChange={(event) => setModule(index, { area: event.target.value })}
            />
          </FormField>
          <FormField label="Owner">
            <Select
              options={people}
              value={row.userId}
              onChange={(event) => setModule(index, { userId: event.target.value })}
            />
          </FormField>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModules((rows) => rows.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => setModules((rows) => [...rows, { area: '', userId: '' }])}>
        Add work area
      </Button>

      <FormGrid className="stack-top">
        <FormField label="Acknowledge within (minutes)">
          <Input
            type="number"
            min={1}
            value={ack}
            onChange={(event) => setAck(event.target.value)}
          />
        </FormField>
        <FormField label="Escalate after (minutes)">
          <Input
            type="number"
            min={1}
            value={escalation}
            onChange={(event) => setEscalation(event.target.value)}
          />
        </FormField>
        <FormGridFull>
          <FormField
            label="Workload limit"
            hint="Applies to anybody without their own limit. Blank means no limit."
          >
            <Input
              type="number"
              min={0}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </FormField>
        </FormGridFull>
      </FormGrid>

      <div className="stack-top">
        <FormActions>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            Save ownership
          </Button>
        </FormActions>
      </div>
    </Card>
  );
}
