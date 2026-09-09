import { PRIORITY_LABELS, type Priority } from '@ashniva/types';
import { Input } from '@ashniva/ui';

import { PRIORITIES, type RuleDraft, type RuleDrafts } from '../sla-rules';

interface SlaTargetsTableProps {
  rules: RuleDrafts;
  onChange: (priority: Priority, patch: Partial<RuleDraft>) => void;
}

/** First-response and resolution targets per priority, in business hours. */
export function SlaTargetsTable({ rules, onChange }: SlaTargetsTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>First response (h)</th>
            <th>Resolution (h)</th>
          </tr>
        </thead>
        <tbody>
          {PRIORITIES.map((priority) => (
            <tr key={priority}>
              <td>{PRIORITY_LABELS[priority]}</td>
              <td>
                <Input
                  aria-label={`${PRIORITY_LABELS[priority]} first response hours`}
                  inputMode="decimal"
                  value={rules[priority].firstResponseHours}
                  onChange={(event) =>
                    onChange(priority, { firstResponseHours: event.target.value })
                  }
                />
              </td>
              <td>
                <Input
                  aria-label={`${PRIORITY_LABELS[priority]} resolution hours`}
                  inputMode="decimal"
                  value={rules[priority].resolutionHours}
                  onChange={(event) => onChange(priority, { resolutionHours: event.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
