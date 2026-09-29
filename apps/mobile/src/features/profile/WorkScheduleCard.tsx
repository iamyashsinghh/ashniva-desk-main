import { WEEKDAY_LABELS, type WorkScheduleSummary } from '@ashniva/types';

import { useResource } from '../../shared/api/queries';
import { KeyValueRow } from '../../shared/components/data-display';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Card } from '../../shared/components/primitives';
import { isProviderUser } from '../auth/audience';
import { useSession } from '../auth/SessionProvider';

export const WORK_SCHEDULE_KEY = ['me', 'work-schedule'] as const;

/**
 * Your own working week, read-only.
 *
 * Worth showing because support routing skips somebody who is "out of hours", and that is
 * unexplainable without seeing the hours. Changing them is a manager's job on the web. A client has
 * no working week here and the endpoint refuses them, so it is not asked; any other failure hides
 * the card rather than putting an error on a screen whose main job is elsewhere.
 */
export function WorkScheduleCard() {
  const { user } = useSession();
  const internal = isProviderUser(user);
  const schedule = useResource<WorkScheduleSummary | null>(WORK_SCHEDULE_KEY, '/me/work-schedule', {
    enabled: internal,
  });

  if (!internal || schedule.isLoading || schedule.isError) {
    return null;
  }

  const data = schedule.data ?? null;

  return (
    <Card>
      <SectionHeader
        title="Working hours"
        icon="time-outline"
        action={
          <AppText size="xs" tone="faint">
            Set by your manager
          </AppText>
        }
      />
      {data ? (
        <>
          <KeyValueRow label="Days" value={workingDaysLabel(data.workingDays)} />
          <KeyValueRow label="Shift" value={shiftLabel(data)} />
          <KeyValueRow
            label="Workload limit"
            value={
              data.workloadLimit === null
                ? 'No limit'
                : `${data.workloadLimit} open tickets before routing skips you`
            }
          />
        </>
      ) : (
        <AppText size="sm" tone="muted">
          Nobody has configured your working hours yet. Support routing treats you as available
          whenever nothing else says otherwise.
        </AppText>
      )}
    </Card>
  );
}

function workingDaysLabel(days: readonly number[]): string {
  if (days.length === 0) {
    return 'None configured';
  }
  return days.map((day) => WEEKDAY_LABELS[day]?.slice(0, 3) ?? String(day)).join(', ');
}

/** A shift that ends at or before it starts runs past midnight, and says so. */
function shiftLabel(schedule: WorkScheduleSummary): string {
  const overnight = schedule.endTime <= schedule.startTime ? ' (overnight)' : '';
  return `${schedule.startTime}–${schedule.endTime} ${schedule.timezone}${overnight}`;
}
