import type { ChangeRequestDetail } from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { todayIso } from '../../../shared/lib/format';
import { useChangeRequestMutations } from '../api';

interface ModalProps {
  cr: ChangeRequestDetail;
  onClose: () => void;
}

/** Staff-only fields: estimate, cost and timeline impact, internal notes. */
export function EstimateModal({ cr, onClose }: ModalProps) {
  const { update } = useChangeRequestMutations(cr.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    hours: cr.estimatedMinutes !== null ? String(cr.estimatedMinutes / 60) : '',
    costImpact: cr.costImpact ?? '',
    currency: cr.currency,
    timelineImpactDays: cr.timelineImpactDays !== null ? String(cr.timelineImpactDays) : '',
    internalNotes: cr.internalNotes ?? '',
  });
  return (
    <Modal
      open
      title="Estimate and impact"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={update.isPending}
            onClick={() =>
              void wrap(() =>
                update.mutateAsync({
                  estimatedMinutes: form.hours ? Math.round(Number(form.hours) * 60) : null,
                  costImpact: form.costImpact || null,
                  currency: form.currency.toUpperCase(),
                  timelineImpactDays: form.timelineImpactDays
                    ? Number(form.timelineImpactDays)
                    : null,
                  internalNotes: form.internalNotes.trim() || null,
                }),
              )()
            }
          >
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Effort (hours)">
          <Input
            inputMode="decimal"
            value={form.hours}
            onChange={(event) => setForm({ ...form, hours: event.target.value })}
          />
        </FormField>
        <FormField label={`Cost impact (${form.currency})`} hint="Shown to the client">
          <Input
            inputMode="decimal"
            value={form.costImpact}
            onChange={(event) => setForm({ ...form, costImpact: event.target.value })}
          />
        </FormField>
        <FormField label="Timeline impact (days)">
          <Input
            type="number"
            value={form.timelineImpactDays}
            onChange={(event) => setForm({ ...form, timelineImpactDays: event.target.value })}
          />
        </FormField>
        <FormField label="Currency">
          <Input
            maxLength={3}
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Internal notes" hint="Never shown to the client">
            <Textarea
              rows={3}
              value={form.internalNotes}
              onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
            />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

export function ScheduleModal({ cr, onClose }: ModalProps) {
  const { step } = useChangeRequestMutations(cr.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [date, setDate] = useState(cr.scheduledFor ?? todayIso());
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      title="Schedule the change"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={step.isPending}
            disabled={!date}
            onClick={() =>
              void wrap(() =>
                step.mutateAsync({ step: 'schedule', scheduledFor: date, note: note || undefined }),
              )()
            }
          >
            Schedule
          </Button>
        </>
      }
    >
      <FormField label="Scheduled for" required>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </FormField>
      <FormField label="Note">
        <Input value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
