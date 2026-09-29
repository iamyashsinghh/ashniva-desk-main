import { PERMISSIONS, type ProjectDetail } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar, type TabOption } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ProjectHeaderCard } from './detail/ProjectHeaderCard';
import { ProjectMembersTab } from './detail/ProjectMembersTab';
import { ProjectOverviewTab } from './detail/ProjectOverviewTab';
import { ProjectPlanTab, projectPlanKey } from './detail/ProjectPlanTab';
import { ProjectTasksTab, projectTasksKey } from './detail/ProjectTasksTab';
import { ProjectTicketsTab, projectTicketsKey } from './detail/ProjectTicketsTab';
import { ProjectUpdatesTab, projectUpdatesKey } from './detail/ProjectUpdatesTab';

type Tab = 'overview' | 'plan' | 'tasks' | 'tickets' | 'updates' | 'members';

export interface ProjectDetailScreenProps {
  projectId: string;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
  onOpenSummary?: (projectId: string) => void;
  onCreateTask?: (projectId: string) => void;
  onEdit?: (projectId: string) => void;
  onEditMembers?: (projectId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenTicket?: (ticketId: string) => void;
  onOpenMilestone?: (milestoneId: string) => void;
  /** Called with the project id; offered only to somebody who may manage milestones. */
  onAddMilestone?: (projectId: string) => void;
}

/**
 * One project, as the web shows it: a header with its actions, and tabs for the overview, the
 * plan, its tasks, tickets, client updates and members.
 *
 * A tab only exists when this person may read what is behind it, and each tab's list is fetched
 * only while that tab is open. The actions follow the same permissions the web checks; the API
 * enforces every one of them regardless.
 */
export function ProjectDetailScreen(props: ProjectDetailScreenProps) {
  const { projectId, onOpenChat } = props;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const query = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`);
  const project = query.data ?? null;

  if (!project) {
    return (
      <Screen>
        {query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            offline={query.error instanceof Error && query.error.name === 'NetworkError'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingState label="Loading the project" />
        )}
      </Screen>
    );
  }

  const canReadTasks = can(PERMISSIONS.TASK_READ);
  const canReadTickets = can(PERMISSIONS.TICKET_READ);
  const canManage = can(PERMISSIONS.PROJECT_MANAGE);
  const bind = (callback: ((id: string) => void) | undefined, allowed = true) =>
    callback && allowed ? () => callback(projectId) : null;
  const addMilestone = bind(props.onAddMilestone, can(PERMISSIONS.MILESTONE_MANAGE));

  const tabs: TabOption<Tab>[] = [
    { value: 'overview', label: 'Overview', icon: 'grid-outline' },
    { value: 'plan', label: 'Plan', icon: 'git-commit-outline' },
    ...(canReadTasks
      ? [{ value: 'tasks' as const, label: 'Tasks', count: project.taskCounts.total }]
      : []),
    ...(canReadTickets
      ? [{ value: 'tickets' as const, label: 'Tickets', count: project.openTicketCount }]
      : []),
    ...(canReadTasks ? [{ value: 'updates' as const, label: 'Client updates' }] : []),
    { value: 'members', label: 'Members', count: project.members.length },
  ];

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all(
      [
        ['projects', projectId],
        projectPlanKey(projectId),
        projectTasksKey(projectId),
        projectTicketsKey(projectId),
        projectUpdatesKey(projectId),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
    setRefreshing(false);
  };

  return (
    <Screen>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={{ padding: theme.spacing.screen, paddingBottom: theme.spacing.md }}>
          <ProjectHeaderCard
            project={project}
            onSummary={bind(props.onOpenSummary)}
            onCreateTask={bind(props.onCreateTask, can(PERMISSIONS.TASK_CREATE))}
            onEdit={bind(props.onEdit, canManage)}
          />
        </View>
        <TabBar
          options={tabs}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Project sections"
        />
        <View style={{ padding: theme.spacing.screen }}>
          {tab === 'overview' ? (
            <ProjectOverviewTab project={project} onOpenChat={onOpenChat} />
          ) : null}
          {tab === 'plan' ? (
            <ProjectPlanTab
              projectId={projectId}
              {...(props.onOpenMilestone ? { onOpenMilestone: props.onOpenMilestone } : {})}
              {...(addMilestone ? { onAddMilestone: addMilestone } : {})}
            />
          ) : null}
          {tab === 'tasks' ? (
            <ProjectTasksTab projectId={projectId} onOpenTask={props.onOpenTask ?? null} />
          ) : null}
          {tab === 'tickets' ? (
            <ProjectTicketsTab projectId={projectId} onOpenTicket={props.onOpenTicket ?? null} />
          ) : null}
          {tab === 'updates' ? (
            <ProjectUpdatesTab projectId={projectId} onOpenTask={props.onOpenTask ?? null} />
          ) : null}
          {tab === 'members' ? (
            <ProjectMembersTab
              project={project}
              onEditMembers={bind(props.onEditMembers, canManage)}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
