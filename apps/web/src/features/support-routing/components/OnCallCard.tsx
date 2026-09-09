import type { EffectiveAvailability, OnCallEntrySummary } from '@ashniva/types';
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
  Table,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import type { OnCallInput } from '../api';

export interface OnCallCardProps {
  onCall: OnCallEntrySummary[];
  team: EffectiveAvailability[];
  onSet: (input: OnCallInput) => Promise<unknown>;
  onClear: (onDate: string) => Promise<unknown>;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Exceptional cover, one date at a time.
 *
 * On-call is neither a rota nor an availability state: it is the reason somebody outside their
 * normal hours may still be the right person to route to. One person covers a date, with an
 * optional backup, and setting a date again replaces whoever had it rather than stacking a second
 * entry nobody would notice.
 */
export function OnCallCard({ onCall, team, onSet, onClear }: OnCallCardProps) {
  const [onDate, setOnDate] = useState(today());
  const [userId, setUserId] = useState('');
  const [backupUserId, setBackupUserId] = useState('');
  const [error, setError] = useState<string | undefined>();

  const people = team.map((member) => ({ value: member.userId, label: member.user.name }));

  async function run(work: () => Promise<unknown>) {
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="On call" headerAddon={<span className="muted">The next four weeks</span>}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <FormGrid>
        <FormField label="Date">
          <Input type="date" value={onDate} onChange={(event) => setOnDate(event.target.value)} />
        </FormField>
        <FormField label="On call">
          <Select
            options={people}
            placeholder="Choose somebody"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
        </FormField>
        <FormField label="Backup" hint="Optional, and has to be somebody else.">
          <Select
            options={[{ value: '', label: 'Nobody' }, ...people]}
            value={backupUserId}
            onChange={(event) => setBackupUserId(event.target.value)}
          />
        </FormField>
        <FormGridFull>
          <FormActions>
            <Button
              variant="primary"
              disabled={!userId || !onDate}
              onClick={() =>
                void run(async () => {
                  await onSet({ onDate, userId, backupUserId: backupUserId || null });
                  setUserId('');
                  setBackupUserId('');
                })
              }
            >
              Set cover
            </Button>
          </FormActions>
        </FormGridFull>
      </FormGrid>

      <Table<OnCallEntrySummary>
        aria-label="On-call cover"
        rowKey={(row) => row.id}
        rows={onCall}
        empty={<p className="muted">Nobody is on call in the next four weeks.</p>}
        columns={[
          { key: 'date', header: 'Date', render: (row) => row.onDate },
          { key: 'user', header: 'On call', render: (row) => row.user.name },
          {
            key: 'backup',
            header: 'Backup',
            hideOnMobile: true,
            render: (row) => row.backupUser?.name ?? '—',
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <Button size="sm" variant="ghost" onClick={() => void run(() => onClear(row.onDate))}>
                Clear
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
