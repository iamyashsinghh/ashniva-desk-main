import {
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  PERMISSIONS,
  type ChangeRequestAction,
  type ChangeRequestDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { CommercialFiles } from '../contracts/CommercialFiles';
import { ErrorNote, RecordPending } from '../contracts/commercial-ui';
import {
  actionButtons,
  CHANGE_REQUEST_INVALIDATES,
  changeRequestStatusLabel,
  changeRequestTone,
  isClosed,
  isDirectStep,
  isNoteStep,
  type DirectStep,
  type NoteStep,
} from './change-request-display';
import { ChangeRequestActionBar, ChangeRequestActionsSheet } from './ChangeRequestActions';
import {
  LinkedWork,
  RequestDetails,
  RequestHistory,
  RequestImpact,
  RequestOverview,
} from './ChangeRequestPanels';
import { ChangeRequestThread } from './ChangeRequestThread';
import { GenerateTasksSheet } from './GenerateTasksSheet';
import { EstimateSheet, NoteStepSheet, ScheduleSheet } from './StepSheets';

export interface ChangeRequestDetailNavigation {
  onEdit: (changeRequestId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenContract: (contractId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}

/** One sheet at a time: a phone cannot stack them, so opening a step replaces the actions list. */
type Panel = 'actions' | 'estimate' | 'schedule' | 'tasks' | NoteStep | null;

export function ChangeRequestDetailScreen({
  changeRequestId,
  ...navigation
}: { changeRequestId: string } & ChangeRequestDetailNavigation) {
  const query = useResource<ChangeRequestDetail>(
    ['change-requests', 'detail', changeRequestId],
    `/change-requests/${changeRequestId}`,
  );
  if (!query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the change request"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <ChangeRequestBody
      cr={query.data}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      {...navigation}
    />
  );
}

/**
 * The web page, one column: the request, its numbers, the work it became, the thread, files and
 * history. What can be done next comes from the API's `actions`, so a button is never offered that
 * the workflow would refuse; the Estimate button follows the web's rule of `change-request:manage`
 * on a request that is still open.
 */
function ChangeRequestBody({
  cr,
  refreshing,
  onRefresh,
  ...navigation
}: {
  cr: ChangeRequestDetail;
  refreshing: boolean;
  onRefresh: () => void;
} & ChangeRequestDetailNavigation) {
  const theme = useTheme();
  const { can } = useSession();
  const [panel, setPanel] = useState<Panel>(null);
  const closed = isClosed(cr.status);
  const buttons = actionButtons(cr.actions);
  const close = () => setPanel(null);

  const step = useApiMutation<DirectStep>({
    path: (action) => `/change-requests/${cr.id}/${action}`,
    body: () => ({}),
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: close,
  });

  const run = (action: ChangeRequestAction) => {
    step.reset();
    if (action === CHANGE_REQUEST_ACTION.EDIT) {
      close();
      navigation.onEdit(cr.id);
    } else if (action === CHANGE_REQUEST_ACTION.SCHEDULE) {
      setPanel('schedule');
    } else if (action === CHANGE_REQUEST_ACTION.GENERATE_TASKS) {
      setPanel('tasks');
    } else if (isNoteStep(action)) {
      setPanel(action);
    } else if (isDirectStep(action)) {
      void step.run(action);
    }
  };

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
          overline={cr.number}
          title={cr.title}
          icon="git-pull-request"
          iconTone={closed ? 'neutral' : 'violet'}
        >
          <PillRow>
            <Pill label={changeRequestStatusLabel(cr.status)} tone={changeRequestTone(cr.status)} />
            {cr.status === CHANGE_REQUEST_STATUS.CLIENT_REVIEW ? (
              <Pill label="Waiting for the client" tone="info" />
            ) : null}
          </PillRow>
          <MetaLine icon="business-outline">{cr.clientOrganization.name}</MetaLine>
        </Hero>
        {panel === null ? <ErrorNote message={step.error} /> : null}

        <RequestOverview cr={cr} />
        <RequestImpact
          cr={cr}
          action={
            can(PERMISSIONS.CHANGE_REQUEST_MANAGE) && !closed ? (
              <Button
                label="Estimate"
                icon="calculator-outline"
                size="sm"
                variant="secondary"
                onPress={() => setPanel('estimate')}
              />
            ) : undefined
          }
        />
        {cr.internalNotes ? (
          <Banner tone="warning" title="Internal notes — the client never sees these">
            <AppText size="sm">{cr.internalNotes}</AppText>
          </Banner>
        ) : null}
        <LinkedWork
          cr={cr}
          onOpenTask={navigation.onOpenTask}
          onOpenMilestone={navigation.onOpenMilestone}
        />
        <ChangeRequestThread changeRequestId={cr.id} comments={cr.comments} canReply={!closed} />
        <CommercialFiles
          files={cr.files}
          parent={{ changeRequestId: cr.id }}
          canUpload={!closed}
          onUploaded={onRefresh}
        />
        <RequestHistory cr={cr} />
        <RequestDetails
          cr={cr}
          onOpenProject={navigation.onOpenProject}
          onOpenContract={navigation.onOpenContract}
        />
      </ScrollView>

      <ChangeRequestActionBar
        buttons={buttons}
        busy={step.busy}
        onAction={run}
        onOpenAll={() => setPanel('actions')}
      />
      <ChangeRequestActionsSheet
        visible={panel === 'actions'}
        buttons={buttons}
        busy={step.busy}
        error={step.error}
        closed={closed}
        onAction={run}
        onClose={close}
      />
      {panel === 'estimate' ? <EstimateSheet cr={cr} onClose={close} /> : null}
      {panel === 'schedule' ? <ScheduleSheet cr={cr} onClose={close} /> : null}
      {panel === 'tasks' ? <GenerateTasksSheet cr={cr} onClose={close} /> : null}
      {panel !== null && isNoteStep(panel) ? (
        <NoteStepSheet changeRequestId={cr.id} step={panel} onClose={close} />
      ) : null}
    </Screen>
  );
}
