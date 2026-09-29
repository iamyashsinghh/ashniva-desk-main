import {
  MILESTONE_TRANSITIONS,
  PERMISSIONS,
  type MilestoneDetail,
  type MilestoneStatus,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Grow, Hero, Section, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { RequestApprovalButton } from '../approvals/RequestApprovalSheet';
import { useSession } from '../auth/SessionProvider';
import { ErrorNote, RecordPending } from '../contracts/commercial-ui';
import {
  approvalBadge,
  MILESTONE_INVALIDATES,
  milestoneStatusLabel,
  milestoneStatusTone,
  transitionVariant,
} from './milestone-display';
import {
  DeliverablesPanel,
  DetailsPanel,
  HistoryPanel,
  LinkedTasksPanel,
  ProgressPanel,
  type MilestoneLinks,
} from './MilestonePanels';
import { ProgressSheet } from './ProgressSheet';

export interface MilestoneDetailNavigation extends MilestoneLinks {
  onEdit: (milestoneId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenApproval: (approvalId: string) => void;
}

export function MilestoneDetailScreen({
  milestoneId,
  ...navigation
}: { milestoneId: string } & MilestoneDetailNavigation) {
  const query = useResource<MilestoneDetail>(
    ['milestones', 'detail', milestoneId],
    `/milestones/${milestoneId}`,
  );
  if (!query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the milestone"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <MilestoneBody
      milestone={query.data}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      {...navigation}
    />
  );
}

/**
 * The web page, one column. Moving the status, adjusting progress, editing and asking the client
 * to sign off are `milestone:manage`; ticking deliverables is `task:work`. The status buttons are
 * the transitions the shared workflow allows from here, drawn disabled with the reason for anyone
 * who may not move milestones, as the web does.
 */
function MilestoneBody({
  milestone,
  refreshing,
  onRefresh,
  ...navigation
}: {
  milestone: MilestoneDetail;
  refreshing: boolean;
  onRefresh: () => void;
} & MilestoneDetailNavigation) {
  const theme = useTheme();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.MILESTONE_MANAGE);
  const [adjusting, setAdjusting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const next = MILESTONE_TRANSITIONS[milestone.status];

  const move = useApiMutation<MilestoneStatus>({
    path: `/milestones/${milestone.id}/status`,
    body: (status) => ({ status }),
    invalidate: MILESTONE_INVALIDATES,
  });
  const deliverable = useApiMutation<{ id: string; isDone: boolean }>({
    path: ({ id }) => `/milestones/${milestone.id}/deliverables/${id}`,
    method: 'PATCH',
    body: ({ isDone }) => ({ isDone }),
    invalidate: MILESTONE_INVALIDATES,
  });

  const toggle = async (id: string, isDone: boolean) => {
    setToggling(id);
    await deliverable.run({ id, isDone });
    setToggling(null);
  };

  const badge = milestone.requiresApproval ? approvalBadge(milestone.approvalStatus) : null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <Hero
          overline={`${milestone.project.code} · Milestone`}
          title={milestone.name}
          icon="flag"
          iconTone={milestone.isOverdue ? 'danger' : 'violet'}
        >
          <PillRow>
            <Pill
              label={milestoneStatusLabel(milestone.status)}
              tone={milestoneStatusTone(milestone.status)}
            />
            <Pill
              label={milestone.clientVisible ? 'Client-visible' : 'Internal'}
              tone={milestone.clientVisible ? 'success' : 'neutral'}
            />
            {badge ? <Pill label={badge.label} tone={badge.tone} /> : null}
            {milestone.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </PillRow>
          <MetaLine icon="folder-open-outline">{milestone.project.name}</MetaLine>
        </Hero>
        {canManage && milestone.requiresApproval && milestone.clientVisible ? (
          <RequestApprovalButton
            subjectType="MILESTONE"
            subjectId={milestone.id}
            defaultTitle={`Sign off: ${milestone.name}`}
            label="Request client sign-off"
            onCreated={navigation.onOpenApproval}
          />
        ) : null}

        <ProgressPanel milestone={milestone} />
        <DeliverablesPanel
          milestone={milestone}
          canWork={can(PERMISSIONS.TASK_WORK)}
          busyId={toggling}
          onToggle={(id, isDone) => void toggle(id, isDone)}
        />
        <ErrorNote message={deliverable.error} />

        <Section title="Actions for your role" icon="swap-horizontal-outline">
          {next.length === 0 ? (
            <AppText tone="muted">
              This milestone is {milestoneStatusLabel(milestone.status).toLowerCase()}.
            </AppText>
          ) : (
            next.map((status) => (
              <Button
                key={status}
                label={milestoneStatusLabel(status)}
                variant={transitionVariant(status)}
                disabled={!canManage || move.busy}
                onPress={() => void move.run(status)}
                {...(canManage ? {} : { accessibilityHint: 'Only managers move milestones' })}
              />
            ))
          )}
          {!canManage && next.length > 0 ? (
            <AppText size="xs" tone="muted">
              Only managers move milestones.
            </AppText>
          ) : null}
          <ErrorNote message={move.error} />
        </Section>

        <LinkedTasksPanel milestone={milestone} onOpenTask={navigation.onOpenTask} />
        <HistoryPanel milestone={milestone} />
        <DetailsPanel milestone={milestone} links={navigation} />
      </ScrollView>

      {canManage ? (
        <StickyActionBar>
          <Grow>
            <Button
              label="Adjust progress"
              icon="speedometer-outline"
              variant="secondary"
              onPress={() => setAdjusting(true)}
            />
          </Grow>
          <Grow>
            <Button
              label="Edit"
              icon="create-outline"
              onPress={() => navigation.onEdit(milestone.id)}
            />
          </Grow>
        </StickyActionBar>
      ) : null}
      {adjusting ? (
        <ProgressSheet milestone={milestone} onClose={() => setAdjusting(false)} />
      ) : null}
    </Screen>
  );
}
