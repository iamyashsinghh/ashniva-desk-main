import { WEEKDAY_LABELS } from '@ashniva/types';
import { Card, DescriptionList } from '@ashniva/ui';

import { isClientSession, useCurrentUser } from '../../auth/session-context';
import { useMyWorkScheduleQuery } from '../api';

import '../support-routing.css';

/**
 * Your own working week, read-only.
 *
 * A developer is entitled to know the hours support routing holds them to — being skipped as "out
 * of hours" is unexplainable otherwise — but that is all this shows. Changing it, or seeing
 * anybody else's, needs `support-routing:manage`, and the API enforces that rather than this card.
 */
export function MyWorkScheduleCard() {
  // A client user has no working week here at all, and the endpoint refuses them — so do not ask.
  const internal = !isClientSession(useCurrentUser());
  const schedule = useMyWorkScheduleQuery(internal);

  if (!internal || schedule.isLoading || schedule.isError) {
    return null;
  }

  if (!schedule.data) {
    return (
      <Card title="Working hours">
        <p className="muted">
          Nobody has configured your working hours yet. Support routing treats you as available
          whenever nothing else says otherwise.
        </p>
      </Card>
    );
  }

  const { workingDays, startTime, endTime, timezone, workloadLimit } = schedule.data;

  return (
    <Card title="Working hours" headerAddon={<span className="muted">Set by your manager</span>}>
      <DescriptionList
        items={[
          {
            key: 'days',
            term: 'Days',
            description:
              workingDays.length > 0
                ? workingDays.map((day) => WEEKDAY_LABELS[day]?.slice(0, 3)).join(', ')
                : 'None configured',
          },
          {
            key: 'shift',
            term: 'Shift',
            description: (
              <>
                {startTime}–{endTime} {timezone}
                {endTime <= startTime ? ' (overnight)' : ''}
              </>
            ),
          },
          {
            key: 'workload-limit',
            term: 'Workload limit',
            description:
              workloadLimit === null
                ? 'No limit'
                : `${workloadLimit} open tickets before routing skips you`,
          },
        ]}
      />
    </Card>
  );
}
