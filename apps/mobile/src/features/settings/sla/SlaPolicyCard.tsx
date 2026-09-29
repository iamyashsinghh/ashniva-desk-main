import { PRIORITY_LABELS, type SlaPolicySummary } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, MetaLine } from '../../../shared/components/data-display';
import { IconTile } from '../../../shared/components/Icon';
import {
  AppText,
  Button,
  Card,
  Divider,
  Pill,
  PillRow,
  type PillTone,
} from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { businessHoursLabel, hoursLabel, pausesLabel, scopeName } from './sla-form';

function scopeTone(policy: SlaPolicySummary): PillTone {
  if (policy.project) {
    return 'info';
  }
  return policy.clientOrganization ? 'progress' : 'success';
}

/** One policy: who it covers, when its clock runs, and its target per priority. */
export function SlaPolicyCard({
  policy,
  onEdit,
  onDelete,
}: {
  policy: SlaPolicySummary;
  /** Left out for somebody who may not manage policies. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name="timer-outline" tone={policy.isDefault ? 'success' : 'info'} size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText weight="bold" numberOfLines={2}>
            {policy.name}
          </AppText>
          <PillRow>
            <Pill label={scopeName(policy)} tone={scopeTone(policy)} />
            <Pill
              label={`${policy.ticketCount} open ticket${policy.ticketCount === 1 ? '' : 's'}`}
            />
          </PillRow>
        </View>
      </View>
      {policy.description ? (
        <AppText size="sm" tone="muted">
          {policy.description}
        </AppText>
      ) : null}
      <MetaLine icon="time-outline">{businessHoursLabel(policy)}</MetaLine>
      <MetaLine icon="pause-circle-outline">Pauses while: {pausesLabel(policy)}</MetaLine>
      <MetaLine icon="alert-circle-outline">
        Warns at {policy.warningPercent}% of the target
      </MetaLine>
      <Divider />
      {policy.rules.map((rule) => (
        <KeyValueRow
          key={rule.priority}
          label={PRIORITY_LABELS[rule.priority]}
          value={`${hoursLabel(rule.firstResponseMinutes)} reply · ${hoursLabel(
            rule.resolutionMinutes,
          )} resolve`}
        />
      ))}
      {onEdit || onDelete ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          {onEdit ? (
            <Button
              label="Edit"
              icon="create-outline"
              size="sm"
              variant="secondary"
              accessibilityHint={`Edits ${policy.name}`}
              onPress={onEdit}
            />
          ) : null}
          {onDelete ? (
            <Button
              label="Delete"
              icon="trash-outline"
              size="sm"
              variant="dangerGhost"
              accessibilityHint={`Deletes ${policy.name}`}
              onPress={onDelete}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
