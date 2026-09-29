import type { ContractHourBalance } from '@ashniva/types';
import { View } from 'react-native';

import { ProgressBar } from '../../../shared/components/data-display';
import { AppText, Pill } from '../../../shared/components/primitives';
import { formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { hoursLeft } from '../portal-display';

/**
 * Support hours left this period, as a bar and a sentence.
 *
 * The bar is the accessible one — it carries the value — and the sentence is for the eye, the
 * same pairing the web card uses.
 */
export function HoursBar({ hours, name }: { hours: ContractHourBalance; name: string }) {
  const theme = useTheme();
  const { total, remaining, percent } = hoursLeft(hours);
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <ProgressBar
        percent={percent}
        tone={hours.isLow ? 'danger' : 'success'}
        label={`Support hours left on ${name}`}
      />
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText size="sm" style={{ flex: 1 }}>
          <AppText size="sm" weight="bold" tabular>
            {formatMinutes(remaining)}
          </AppText>
          <AppText size="sm" tone="muted">
            {' '}
            of {formatMinutes(total)} support hours left
          </AppText>
        </AppText>
        {hours.isLow ? <Pill label="Running low" tone="danger" /> : null}
      </View>
    </View>
  );
}
