import { AVAILABILITY_STATUS_LABELS, type EffectiveAvailability } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { IconTile } from '../../shared/components/Icon';
import { Grow } from '../../shared/components/layout';
import { AppText, Button, Card, Pill } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { availabilityTone, hoursLabel, recordedLabel } from './support-display';

/**
 * One project member as the routing engine sees them.
 *
 * "Recorded" is the last thing anybody said, usually HR; "Routing sees" folds in the rota and
 * today's on-call. Both are shown because when they disagree, that is the interesting fact.
 */
export function TeamMemberCard({
  member,
  onEditSchedule,
  onEditAvailability,
}: {
  member: EffectiveAvailability;
  onEditSchedule: () => void;
  onEditAvailability: () => void;
}) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name="person-outline" tone="info" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">{member.user.name}</AppText>
          <AppText size="xs" tone="muted">
            {hoursLabel(member)}
          </AppText>
        </View>
        <Pill
          label={AVAILABILITY_STATUS_LABELS[member.effectiveStatus]}
          tone={availabilityTone(member.effectiveStatus)}
        />
      </View>
      <KeyValueRow label="Recorded" value={AVAILABILITY_STATUS_LABELS[member.status]} />
      <AppText size="xs" tone="faint" align="right">
        {recordedLabel(member)}
      </AppText>
      <KeyValueRow label="In hours" value={member.withinSchedule ? 'Yes' : 'No'} />
      {member.note ? <KeyValueRow label="Note" value={member.note} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Grow>
          <Button
            label="Hours"
            icon="time-outline"
            size="sm"
            variant="secondary"
            accessibilityHint={`Edits ${member.user.name}'s working hours`}
            onPress={onEditSchedule}
          />
        </Grow>
        <Grow>
          <Button
            label="Availability"
            icon="calendar-outline"
            size="sm"
            variant="ghost"
            accessibilityHint={`Records whether ${member.user.name} is available`}
            onPress={onEditAvailability}
          />
        </Grow>
      </View>
    </Card>
  );
}
