import { Button } from '@ashniva/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** ISO weekday chips (1 = Monday) for the days an SLA clock runs. */
export function BusinessDayPicker({
  days,
  onToggle,
}: {
  days: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="chip-row">
      {DAYS.map((label, index) => {
        const day = index + 1;
        const selected = days.includes(day);
        return (
          <Button
            key={label}
            size="sm"
            variant={selected ? 'primary' : 'secondary'}
            aria-pressed={selected}
            onClick={() => onToggle(day)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
