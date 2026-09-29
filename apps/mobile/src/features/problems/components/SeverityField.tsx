import { PRIORITY_LABELS, type Priority } from '@ashniva/types';

import { ChipGroup } from '../../../shared/components/chips';
import { SEVERITIES } from '../problem-display';

/**
 * Severity, as four chips. It is `Priority` rather than a scale of its own — the approved design
 * uses the same Critical/High vocabulary on problems, incidents and tickets alike.
 */
export function SeverityField({
  value,
  onChange,
  label = 'Severity',
}: {
  value: Priority;
  onChange: (value: Priority) => void;
  label?: string;
}) {
  return (
    <ChipGroup
      label={label}
      options={SEVERITIES}
      selected={value}
      onSelect={onChange}
      labelFor={(severity) => PRIORITY_LABELS[severity]}
    />
  );
}
