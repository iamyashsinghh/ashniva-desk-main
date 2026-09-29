import { useMemo } from 'react';
import { View } from 'react-native';

import { Section } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  deviceTimezone,
  timeOptions,
  timezoneOptions,
  type QuietHours,
} from './preference-options';
import { SwitchRow } from './PreferenceRows';

/**
 * Quiet hours: the switch, the window and the zone the window is read in.
 *
 * Each choice saves on its own, like the switches — a pick from a list is already a decision, and
 * a Save button at the foot of a long screen is one people scroll past.
 */
export function QuietHoursSection({
  value,
  disabled,
  onChange,
}: {
  value: QuietHours;
  disabled: boolean;
  onChange: (patch: Partial<QuietHours>) => void;
}) {
  const theme = useTheme();
  const device = useMemo(() => deviceTimezone(), []);
  const zones = useMemo(() => timezoneOptions(value.timezone, device), [value.timezone, device]);

  return (
    <Section>
      <View style={{ gap: theme.spacing.sm }}>
        <SwitchRow
          icon="moon-outline"
          label="Quiet hours"
          value={value.quietHoursEnabled}
          disabled={disabled}
          onChange={(quietHoursEnabled) => onChange({ quietHoursEnabled })}
        />
        {value.quietHoursEnabled ? (
          <>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <SelectField
                  label="From"
                  icon="moon-outline"
                  options={timeOptions(value.quietHoursStart)}
                  value={[value.quietHoursStart]}
                  disabled={disabled}
                  sheetTitle="Quiet hours start"
                  onChange={([quietHoursStart]) =>
                    quietHoursStart ? onChange({ quietHoursStart }) : undefined
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <SelectField
                  label="Until"
                  icon="sunny-outline"
                  options={timeOptions(value.quietHoursEnd)}
                  value={[value.quietHoursEnd]}
                  disabled={disabled}
                  sheetTitle="Quiet hours end"
                  onChange={([quietHoursEnd]) =>
                    quietHoursEnd ? onChange({ quietHoursEnd }) : undefined
                  }
                />
              </View>
            </View>
            <SelectField
              label="Timezone"
              icon="globe-outline"
              options={zones}
              value={[value.timezone]}
              disabled={disabled}
              hint="The window is read in this zone, wherever you are."
              onChange={([timezone]) => (timezone ? onChange({ timezone }) : undefined)}
            />
            <AppText size="sm" tone="muted">
              Notifications raised in this window wait until it ends rather than being dropped. Five
              kinds never wait: an SLA breach, a ticket escalated to you, a ticket with nobody to
              route it to, and a support call ringing or missed.
            </AppText>
          </>
        ) : (
          <AppText size="sm" tone="muted">
            Off — you can be notified at any hour.
          </AppText>
        )}
      </View>
    </Section>
  );
}
