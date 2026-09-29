import { PERMISSIONS, type ContractDetail } from '@ashniva/types';
import { View } from 'react-native';

import { EmptyState } from '../../shared/components/states';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { MilestoneCard } from '../milestones/MilestoneCard';

/**
 * The delivery milestones on a contract. A milestone belongs to a project, so adding one here is
 * offered only when the contract names a project — the web's rule — and only to
 * `milestone:manage`.
 */
export function ContractMilestonesTab({
  contract,
  onOpen,
  onAdd,
}: {
  contract: ContractDetail;
  onOpen: (milestoneId: string) => void;
  onAdd: (projectId: string, contractId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const project = contract.project;
  const canManage = can(PERMISSIONS.MILESTONE_MANAGE);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {canManage && project ? (
        <Button
          label="Add milestone"
          icon="add"
          variant="secondary"
          onPress={() => onAdd(project.id, contract.id)}
        />
      ) : null}
      {canManage && !project ? (
        <AppText size="xs" tone="muted">
          Link this contract to a project to plan milestones on it.
        </AppText>
      ) : null}
      {contract.milestones.length === 0 ? (
        <EmptyState
          title="No milestones on this contract"
          description="Milestones linked to this contract appear here with their progress."
          icon="flag-outline"
        />
      ) : null}
      {contract.milestones.map((milestone) => (
        <MilestoneCard
          key={milestone.id}
          milestone={milestone}
          onOpen={() => onOpen(milestone.id)}
        />
      ))}
    </View>
  );
}
