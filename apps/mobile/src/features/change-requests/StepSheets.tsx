import type { ChangeRequestDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { todayIsoDate } from '../../shared/format/format';
import { ErrorNote, SheetActions } from '../contracts/commercial-ui';
import { minutesToHours } from '../contracts/contract-display';
import { CHANGE_REQUEST_INVALIDATES, NOTE_STEPS, type NoteStep } from './change-request-display';

/**
 * A workflow step that asks for a note first. Rejecting, cancelling and requesting changes insist
 * on a reason of at least three characters — the API's own rule, because the other side is shown
 * it — while sending to the client and completing take an optional one.
 */
export function NoteStepSheet({
  changeRequestId,
  step,
  onClose,
}: {
  changeRequestId: string;
  step: NoteStep;
  onClose: () => void;
}) {
  const spec = NOTE_STEPS[step];
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const run = useApiMutation<string>({
    path: `/change-requests/${changeRequestId}/${step}`,
    body: (text) => (text ? { note: text } : {}),
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: onClose,
  });
  const tooShort = spec.required && trimmed.length < 3;

  return (
    <Sheet
      visible
      title={spec.title}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel={spec.confirm}
          confirmIcon={spec.danger ? 'close-circle-outline' : 'checkmark'}
          danger={spec.danger}
          busy={run.busy}
          disabled={tooShort}
          onCancel={onClose}
          onConfirm={() => void run.run(trimmed)}
        />
      }
    >
      <Field
        label={spec.label}
        required={spec.required}
        {...(spec.required ? { hint: 'At least 3 characters. The other side sees this.' } : {})}
      >
        <Input
          accessibilityLabel={spec.label}
          multiline
          maxLength={2000}
          value={note}
          onChangeText={(text) => {
            run.reset();
            setNote(text);
          }}
          style={{ minHeight: 96 }}
        />
      </Field>
      <ErrorNote message={run.error} />
    </Sheet>
  );
}

export function ScheduleSheet({ cr, onClose }: { cr: ChangeRequestDetail; onClose: () => void }) {
  const [date, setDate] = useState<string | null>(cr.scheduledFor ?? todayIsoDate());
  const [note, setNote] = useState('');
  const run = useApiMutation<{ scheduledFor: string; note: string }>({
    path: `/change-requests/${cr.id}/schedule`,
    body: (values) => ({
      scheduledFor: values.scheduledFor,
      ...(values.note ? { note: values.note } : {}),
    }),
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: onClose,
  });

  return (
    <Sheet
      visible
      title="Schedule the change"
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Schedule"
          confirmIcon="calendar-outline"
          busy={run.busy}
          disabled={!date}
          onCancel={onClose}
          onConfirm={() => {
            if (date) {
              void run.run({ scheduledFor: date, note: note.trim() });
            }
          }}
        />
      }
    >
      <DateTimeField
        label="Scheduled for"
        required
        allowClear={false}
        value={date}
        onChange={setDate}
      />
      <Field label="Note">
        <Input accessibilityLabel="Note" maxLength={2000} value={note} onChangeText={setNote} />
      </Field>
      <ErrorNote message={run.error} />
    </Sheet>
  );
}

interface EstimateForm {
  hours: string;
  costImpact: string;
  currency: string;
  timelineImpactDays: string;
  internalNotes: string;
}

const DECIMAL = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^-?\d+$/;

function estimateProblem(form: EstimateForm): string | null {
  const hours = form.hours.trim();
  if (hours && (!DECIMAL.test(hours) || Number(hours) * 60 > 600_000)) {
    return 'Effort is a number of hours, up to 10,000.';
  }
  if (form.costImpact.trim() && !DECIMAL.test(form.costImpact.trim())) {
    return 'Cost impact is a number with at most two decimals.';
  }
  const days = form.timelineImpactDays.trim();
  if (days && (!WHOLE.test(days) || Number(days) < -365 || Number(days) > 3650)) {
    return 'Timeline impact is a whole number of days, from -365 to 3650.';
  }
  if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    return 'Currency is a three-letter code, such as INR.';
  }
  return null;
}

/** The staff-only numbers: effort, cost and timeline impact, and the internal notes. */
export function EstimateSheet({ cr, onClose }: { cr: ChangeRequestDetail; onClose: () => void }) {
  const [form, setForm] = useState<EstimateForm>({
    hours: cr.estimatedMinutes !== null ? minutesToHours(cr.estimatedMinutes) : '',
    costImpact: cr.costImpact ?? '',
    currency: cr.currency,
    timelineImpactDays: cr.timelineImpactDays !== null ? String(cr.timelineImpactDays) : '',
    internalNotes: cr.internalNotes ?? '',
  });
  const set = (key: keyof EstimateForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const problem = estimateProblem(form);

  const save = useApiMutation<EstimateForm>({
    path: `/change-requests/${cr.id}`,
    method: 'PATCH',
    body: (values) => ({
      estimatedMinutes: values.hours.trim() ? Math.round(Number(values.hours) * 60) : null,
      costImpact: values.costImpact.trim() || null,
      currency: values.currency.trim().toUpperCase(),
      timelineImpactDays: values.timelineImpactDays.trim()
        ? Number(values.timelineImpactDays)
        : null,
      internalNotes: values.internalNotes.trim() || null,
    }),
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: onClose,
  });

  const field = (key: keyof EstimateForm, label: string, numeric: boolean) => (
    <Field label={label}>
      <Input
        accessibilityLabel={label}
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
        value={form[key]}
        onChangeText={(value) => set(key, value)}
      />
    </Field>
  );

  return (
    <Sheet
      visible
      title="Estimate and impact"
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Save"
          confirmIcon="checkmark"
          busy={save.busy}
          disabled={problem !== null}
          onCancel={onClose}
          onConfirm={() => void save.run(form)}
        />
      }
    >
      {field('hours', 'Effort (hours)', true)}
      <Field label={`Cost impact (${form.currency.toUpperCase()})`} hint="Shown to the client.">
        <Input
          accessibilityLabel="Cost impact"
          keyboardType="decimal-pad"
          value={form.costImpact}
          onChangeText={(value) => set('costImpact', value)}
        />
      </Field>
      {field('timelineImpactDays', 'Timeline impact (days)', true)}
      {field('currency', 'Currency', false)}
      <Field label="Internal notes" hint="Never shown to the client.">
        <Input
          accessibilityLabel="Internal notes"
          multiline
          maxLength={10000}
          value={form.internalNotes}
          onChangeText={(value) => set('internalNotes', value)}
          style={{ minHeight: 72 }}
        />
      </Field>
      <ErrorNote message={problem ?? save.error} />
    </Sheet>
  );
}
