import { DEFAULT_WORK_SCHEDULE, WEEKDAY_LABELS, type EffectiveAvailability } from '@ashniva/types';
import { Alert, Button, FormField, FormGrid, FormGridFull, Input, Modal } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import type { WorkScheduleInput } from '../api';

/** Monday first, because that is how a working week reads even though Sunday is day 0. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface WorkScheduleModalProps {
  member: EffectiveAvailability;
  onSave: (input: WorkScheduleInput) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Somebody's normal working week.
 *
 * The times are clock times in a named zone rather than instants, which is why the field asks for
 * `Asia/Kolkata` and not an offset: an offset is wrong twice a year anywhere that keeps daylight
 * saving, and the rota would quietly shift with it.
 */
export function WorkScheduleModal({ member, onSave, onClose }: WorkScheduleModalProps) {
  const existing = member.schedule;
  const [days, setDays] = useState<number[]>([
    ...(existing?.workingDays ?? DEFAULT_WORK_SCHEDULE.workingDays),
  ]);
  const [startTime, setStartTime] = useState(existing?.startTime ?? '09:30');
  const [endTime, setEndTime] = useState(existing?.endTime ?? '18:30');
  const [timezone, setTimezone] = useState(existing?.timezone ?? DEFAULT_WORK_SCHEDULE.timezone);
  const [limit, setLimit] = useState(
    existing?.workloadLimit === null || existing?.workloadLimit === undefined
      ? ''
      : String(existing.workloadLimit),
  );
  const { error, wrap } = useSubmitHandler(onClose);

  const toggle = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );

  const sameTime = startTime === endTime;
  const overnight = !sameTime && endTime < startTime;

  const submit = wrap(() =>
    onSave({
      workingDays: days,
      startTime,
      endTime,
      timezone: timezone.trim() || DEFAULT_WORK_SCHEDULE.timezone,
      workloadLimit: limit.trim() === '' ? null : Number(limit),
    }),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Working hours — ${member.user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={sameTime}>
            Save hours
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <fieldset className="support-days">
        <legend className="support-days__legend">Working days</legend>
        {DAY_ORDER.map((day) => (
          <label
            key={day}
            className={`support-days__day${days.includes(day) ? ' support-days__day--on' : ''}`}
          >
            <input type="checkbox" checked={days.includes(day)} onChange={() => toggle(day)} />
            {WEEKDAY_LABELS[day]?.slice(0, 3)}
          </label>
        ))}
      </fieldset>

      <FormGrid>
        <FormField label="Shift starts" required>
          <Input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </FormField>
        <FormField
          label="Shift ends"
          required
          hint={overnight ? 'Earlier than the start: this shift runs past midnight.' : undefined}
          error={sameTime ? 'A shift cannot start and end at the same time.' : undefined}
        >
          <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </FormField>
        <FormGridFull>
          <FormField
            label="Timezone"
            hint="IANA name, e.g. Asia/Kolkata. The clock times above are local to it."
          >
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField
            label="Workload limit"
            hint="Open tickets this person may hold before routing skips them. Blank means no limit."
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
    </Modal>
  );
}
