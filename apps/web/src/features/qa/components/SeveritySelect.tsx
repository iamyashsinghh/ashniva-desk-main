import { TEST_SEVERITY, type TestSeverity } from '@ashniva/types';
import { Select, type SelectProps } from '@ashniva/ui';

import { SEVERITY_LABELS } from '../qa-labels';

type SeveritySelectProps = Omit<SelectProps, 'options' | 'value' | 'onChange'> & {
  value: TestSeverity | '';
  onChange: (value: TestSeverity | '') => void;
};

const OPTIONS = Object.values(TEST_SEVERITY);

/**
 * How bad a failure is, in the four values the API accepts.
 *
 * A plain `<Select>` inside the form would do — this exists so the wording of a severity is
 * written once, and so the empty option stays a placeholder rather than becoming a fifth severity.
 */
export function SeveritySelect({ value, onChange, ...rest }: SeveritySelectProps) {
  return (
    <Select
      {...rest}
      value={value}
      placeholder="Choose a severity"
      onChange={(event) => onChange(event.target.value as TestSeverity | '')}
      options={OPTIONS.map((severity) => ({ value: severity, label: SEVERITY_LABELS[severity] }))}
    />
  );
}
