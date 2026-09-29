import { PRIORITY_LABELS, type Priority } from '@ashniva/types';
import { View } from 'react-native';

import { AppText, Divider, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { PRIORITIES, type RuleDraft } from './sla-form';

/**
 * First-response and resolution targets per priority, in business hours.
 *
 * One row per priority with the two numbers side by side — the web's table, folded to a phone's
 * width. Each input is labelled with its priority for a screen reader, because the column heading
 * is not read with it.
 */
export function SlaTargetsFields({
  rules,
  problems,
  onChange,
}: {
  rules: Record<Priority, RuleDraft>;
  problems: Partial<Record<Priority, string>> | undefined;
  onChange: (priority: Priority, patch: Partial<RuleDraft>) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText size="sm" weight="medium">
        Targets in business hours
      </AppText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }} />
        <AppText size="xs" tone="faint" style={{ width: 92 }} align="center">
          First reply (h)
        </AppText>
        <AppText size="xs" tone="faint" style={{ width: 92 }} align="center">
          Resolve (h)
        </AppText>
      </View>
      {PRIORITIES.map((priority) => (
        <View key={priority} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
            <AppText style={{ flex: 1 }}>{PRIORITY_LABELS[priority]}</AppText>
            <Input
              accessibilityLabel={`${PRIORITY_LABELS[priority]} first response hours`}
              value={rules[priority].firstResponseHours}
              onChangeText={(firstResponseHours) => onChange(priority, { firstResponseHours })}
              keyboardType="decimal-pad"
              invalid={Boolean(problems?.[priority])}
              style={{ textAlign: 'center', width: 92 }}
            />
            <Input
              accessibilityLabel={`${PRIORITY_LABELS[priority]} resolution hours`}
              value={rules[priority].resolutionHours}
              onChangeText={(resolutionHours) => onChange(priority, { resolutionHours })}
              keyboardType="decimal-pad"
              invalid={Boolean(problems?.[priority])}
              style={{ textAlign: 'center', width: 92 }}
            />
          </View>
          {problems?.[priority] ? (
            <AppText size="xs" tone="danger">
              {problems[priority]}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}
