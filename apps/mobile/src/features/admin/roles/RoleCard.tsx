import type { CustomRoleDetail } from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';

export function RoleCard({ role, onPress }: { role: CustomRoleDetail; onPress: () => void }) {
  const people = role.memberCount === 1 ? '1 person' : `${role.memberCount} people`;
  return (
    <PressableCard
      accessibilityLabel={`${role.name}, ${role.isSystem ? 'system' : 'custom'} role, ${people}`}
      accessibilityHint="Opens the role and its permissions"
      onPress={onPress}
      icon={role.isSystem ? 'shield-outline' : 'shield-checkmark'}
      iconTone={role.isSystem ? 'neutral' : 'violet'}
    >
      <AppText weight="medium" numberOfLines={1}>
        {role.name}
      </AppText>
      <PillRow>
        <Pill
          label={role.isSystem ? 'System' : 'Custom'}
          tone={role.isSystem ? 'info' : 'neutral'}
        />
        {role.audience === 'CLIENT' ? <Pill label="Client" tone="warning" /> : null}
      </PillRow>
      {role.description ? (
        <AppText size="sm" tone="muted" numberOfLines={2}>
          {role.description}
        </AppText>
      ) : null}
      <MetaLine icon="key-outline">
        {people} · {role.permissions.length} permissions
      </MetaLine>
    </PressableCard>
  );
}
