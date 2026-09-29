import type { TestAccountSummary } from '@ashniva/types';
import { View } from 'react-native';

import { AppText, Button, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ENVIRONMENT_LABELS, ROTATION_POLICY_LABELS } from '../qa-labels';

/** One test login in the project's list. Nothing on it can ever hold a password. */
export function TestAccountCard({
  account,
  onGrant,
  onRotate,
  onEdit,
}: {
  account: TestAccountSummary;
  onGrant: () => void;
  onRotate: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const retired = !account.isActive;
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <AppText weight="medium">{account.label}</AppText>
        <AppText size="sm" tone="muted">
          {account.username} · {ENVIRONMENT_LABELS[account.environment]}
        </AppText>
        <AppText size="xs" tone="faint">
          {ROTATION_POLICY_LABELS[account.rotationPolicy]}
          {account.rotatedAt ? ` · last changed ${formatDateTime(account.rotatedAt)}` : ''}
        </AppText>
      </View>
      {retired || account.hasActiveGrant ? (
        <PillRow>
          {retired ? <Pill label="Retired" tone="warning" /> : null}
          {account.hasActiveGrant ? <Pill label="You have access" tone="success" /> : null}
        </PillRow>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Button
          label="Grant"
          size="sm"
          variant="secondary"
          icon="key-outline"
          disabled={retired}
          {...(retired ? { accessibilityHint: 'This login has been retired' } : {})}
          onPress={onGrant}
        />
        <Button
          label="Rotate"
          size="sm"
          variant="secondary"
          icon="refresh"
          disabled={retired}
          {...(retired ? { accessibilityHint: 'This login has been retired' } : {})}
          onPress={onRotate}
        />
        <Button label="Edit" size="sm" variant="secondary" icon="create-outline" onPress={onEdit} />
      </View>
    </Card>
  );
}
