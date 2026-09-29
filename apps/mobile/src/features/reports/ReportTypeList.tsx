import type { ReportType } from '@ashniva/types';

import { ListRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { Divider } from '../../shared/components/primitives';

/**
 * The reports this person may run, as a list to tap, before one is chosen.
 *
 * The web opens on an empty picker and a "pick a report" note; on a phone the list itself is the
 * better first screen — one tap to a report instead of opening a picker first.
 */
export function ReportTypeList({
  options,
  onPick,
}: {
  options: readonly { value: ReportType; label: string }[];
  onPick: (type: ReportType) => void;
}) {
  return (
    <Section title="Choose a report" count={options.length} icon="bar-chart-outline">
      {options.map((option, index) => (
        <ReportTypeRow
          key={option.value}
          label={option.label}
          divided={index > 0}
          onPress={() => onPick(option.value)}
        />
      ))}
    </Section>
  );
}

function ReportTypeRow({
  label,
  divided,
  onPress,
}: {
  label: string;
  divided: boolean;
  onPress: () => void;
}) {
  return (
    <>
      {divided ? <Divider /> : null}
      <ListRow
        title={label}
        icon="stats-chart-outline"
        iconTone="teal"
        onPress={onPress}
        accessibilityHint="Runs this report"
      />
    </>
  );
}
