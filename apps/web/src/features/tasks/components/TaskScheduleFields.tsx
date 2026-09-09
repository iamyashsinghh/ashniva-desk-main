import { FormField, Input } from '@ashniva/ui';

import { WorkAreaPicker } from './WorkAreaPicker';

/**
 * When the work starts, when it is expected to finish, and what kind of work it is.
 *
 * Grouped into one component because the three answer one question together — a scheduled start
 * with no expected completion gives the timing indicator nothing to measure, and an expected
 * completion with no work area gives the support router nothing to match. Keeping them adjacent in
 * one place is also what stops the create and edit forms from drifting apart.
 */
export interface TaskScheduleValue {
  scheduledStartAt?: string;
  dueAt?: string;
  workAreas?: string[];
}

export function TaskScheduleFields({
  value,
  onChange,
}: {
  value: TaskScheduleValue;
  /** Patch rather than a generic setter, so the parent's form type need not match this one. */
  onChange: (patch: TaskScheduleValue) => void;
}) {
  return (
    <>
      <FormField
        label="Scheduled start"
        hint="Leave empty to make it workable now. Until this moment it waits in Upcoming."
      >
        <Input
          type="datetime-local"
          value={value.scheduledStartAt ?? ''}
          onChange={(event) => onChange({ scheduledStartAt: event.target.value })}
        />
      </FormField>
      <FormField label="Expected completion" hint="What the on-time indicator measures against">
        <Input
          type="datetime-local"
          value={value.dueAt ?? ''}
          onChange={(event) => onChange({ dueAt: event.target.value })}
        />
      </FormField>
      <FormField label="Work area" hint="What the work is — used to route related support">
        <WorkAreaPicker
          value={value.workAreas ?? []}
          onChange={(areas) => onChange({ workAreas: areas })}
        />
      </FormField>
    </>
  );
}

/**
 * `datetime-local` yields a local wall-clock string with no zone; the API stores instants.
 *
 * `new Date(local)` reads it in the browser's zone, which is what somebody meant when they picked
 * a time on their own screen.
 */
export function localToIso(local: string | undefined): string | undefined {
  if (!local) {
    return undefined;
  }
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
