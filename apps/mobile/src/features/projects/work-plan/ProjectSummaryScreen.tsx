import type { ProjectDetail } from '@ashniva/types';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { useResource } from '../../../shared/api/queries';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { AddWorkSheet } from './AddWorkSheet';
import { useWorkPlan } from './api';
import { CombineSheet } from './CombineSheet';
import { ExplainFlowSheet } from './ExplainFlowSheet';
import { PhaseSection } from './PhaseSection';
import { PointRunnerProvider } from './point-runner';
import { CombineBar, SaveBar } from './SaveBar';
import { SummaryHeader } from './SummaryHeader';
import {
  emptyPlanText,
  ProjectAssignmentCard,
  summaryHint,
  SummaryToolbar,
} from './SummaryToolbar';
import { useSummaryState } from './use-summary-state';
import { PullRefresh } from '../../../shared/components/PullRefresh';

/**
 * Project Summary — the work plan, as the web's Summary modal shows it in reader mode.
 *
 * Developers see only what is assigned to them (the API filters); managers, leads and testers see
 * the whole plan. Every button comes from a flag the API returned for this person.
 */
export function ProjectSummaryScreen({
  projectId,
  onOpenEditor,
}: {
  projectId: string;
  onOpenEditor: (projectId: string) => void;
  /**
   * Reserved for opening a step's linked task. The plan response does not carry that task's id
   * yet, so nothing calls it; accepted so routes can pass it without a type change later.
   */
  onOpenTask?: (taskId: string) => void;
}) {
  const theme = useTheme();
  const query = useWorkPlan(projectId);
  const project = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`);
  const plan = query.data;
  const state = useSummaryState(projectId, plan);

  if (!plan && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!plan) {
    return (
      <Screen>
        <LoadingState label="Loading the plan" />
      </Screen>
    );
  }

  const canCombine = plan.canAssign || plan.canWork;
  const empty = emptyPlanText(plan);
  const selected = state.selection.titleIds.length;

  return (
    <PointRunnerProvider projectId={projectId} showLeadLog={plan.canAssign}>
      <Screen>
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          refreshControl={
            <PullRefresh
              busy={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={theme.colors.primary}
            />
          }
        >
          <SummaryHeader plan={plan} projectName={project.data?.name ?? null} />
          <SummaryToolbar
            plan={plan}
            onEdit={() => onOpenEditor(projectId)}
            onAddWork={() => state.setAddingWork(true)}
          />

          {query.error ? (
            <Banner tone="warning">{`Showing the last plan loaded. ${errorMessage(query.error)}`}</Banner>
          ) : null}
          {state.save.saveError ? (
            <Banner tone="danger" role="alert">
              {state.save.saveError}
            </Banner>
          ) : null}
          {state.save.hint ? (
            <Banner
              tone="info"
              action={
                <Button
                  label="Dismiss"
                  variant="ghost"
                  size="sm"
                  onPress={state.save.dismissHint}
                />
              }
            >
              {state.save.hint}
            </Banner>
          ) : null}
          {state.placement.length > 0 ? (
            <Banner
              tone="success"
              title="Added to this summary"
              action={
                <Button
                  label="Dismiss"
                  variant="ghost"
                  size="sm"
                  onPress={state.dismissPlacement}
                />
              }
            >
              {state.placement.join('. ')}
            </Banner>
          ) : null}

          {plan.canAssign && state.assignment && plan.phases.length > 0 ? (
            <ProjectAssignmentCard
              plan={plan}
              assignment={state.assignment}
              onChange={state.setAssignment}
            />
          ) : null}

          {plan.phases.length > 0 ? (
            <AppText size="sm" tone="muted">
              {summaryHint(plan, canCombine)}
            </AppText>
          ) : (
            <EmptyState
              title={empty.title}
              description={empty.description}
              icon="list-circle-outline"
              {...(plan.canAssign
                ? { action: { label: 'Add phase', onPress: () => onOpenEditor(projectId) } }
                : {})}
            />
          )}

          {plan.phases.map((phase, index) => (
            <PhaseSection
              key={phase.id}
              plan={plan}
              phase={phase}
              index={index}
              assignment={state.assignment}
              onAssignment={state.setAssignment}
              canCombine={canCombine}
              selection={state.selection}
              onToggleCombine={state.toggleCombine}
            />
          ))}
        </ScrollView>

        {state.changes > 0 ? (
          <SaveBar
            changes={state.changes}
            busy={state.save.saving || state.save.explainBusy}
            onSave={state.save.start}
            onDiscard={state.discardAssignments}
          />
        ) : null}
        {state.changes === 0 && selected >= 2 ? (
          <CombineBar
            count={selected}
            minutes={state.combineMinutes}
            onCombine={() => state.setCombining(true)}
            onClear={state.clearCombine}
          />
        ) : null}

        <ExplainFlowSheet
          step={state.save.step}
          preview={state.save.preview}
          busy={state.save.explainBusy}
          error={state.save.explainError}
          onYes={state.save.answerYes}
          onNo={state.save.answerNo}
          onUpdate={() => void state.save.update()}
          onKeep={state.save.keepMine}
          onRetry={state.save.retry}
          onClose={state.save.close}
        />
        {state.combining && state.combinePhase ? (
          <CombineSheet
            phase={state.combinePhase}
            titleIds={state.selection.titleIds}
            busy={state.combineBusy}
            error={state.combineError}
            onApply={() => void state.applyCombine()}
            onClose={() => state.setCombining(false)}
          />
        ) : null}
        {plan.canAssign ? (
          <AddWorkSheet
            plan={plan}
            visible={state.addingWork}
            busy={state.addWorkBusy}
            error={state.addWorkError}
            onClose={() => state.setAddingWork(false)}
            onSubmit={state.addWork}
          />
        ) : null}
      </Screen>
    </PointRunnerProvider>
  );
}
