import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import { Grow, StickyActionBar, useStackKeyboardOffset } from '../../../shared/components/layout';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { AddWorkSheet } from './AddWorkSheet';
import { useWorkPlan } from './api';
import { moveItem, newPhase, removeAt, replaceAt } from './draft-editing';
import { EditorPhaseCard } from './EditorPhaseCard';
import { EditorToolbar } from './EditorToolbar';
import { hasStartedWork } from './plan-helpers';
import { useEditorState } from './use-editor-state';

/**
 * Editing the plan's shape — the web Summary's editor mode.
 *
 * Phases, topics and steps are edited locally and saved together with one PUT; ids are kept, so a
 * step that survives the edit keeps its timer and notes. Only people the API lets assign
 * (`canAssign`: admin, PM, TL) get the editor; the server refuses everyone else's save anyway.
 */
export function WorkPlanEditorScreen({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const query = useWorkPlan(projectId);
  const plan = query.data;
  const state = useEditorState(projectId, plan);
  const [addingWork, setAddingWork] = useState(false);

  if (!plan && query.error) {
    return (
      <Screen>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  if (!plan || !state.draft) {
    return (
      <Screen>
        <LoadingState label="Loading the plan" variant="spinner" />
      </Screen>
    );
  }
  if (!plan.canAssign) {
    return (
      <Screen>
        <EmptyState
          title="You cannot edit this plan"
          description="Only an admin, project manager or team lead can change phases and steps."
          icon="lock-closed-outline"
          action={{ label: 'Back to summary', onPress: onDone }}
        />
      </Screen>
    );
  }

  const draft = state.draft;
  const pdfLocked = hasStartedWork(plan);

  const choosePdf = () => {
    if (plan.phases.length === 0) {
      void state.pdf.choose();
      return;
    }
    Alert.alert(
      'Replace the plan with a PDF?',
      'Every phase, topic and step is replaced by what AI reads from the brief. Unsaved edits here are lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => void state.pdf.choose() },
      ],
    );
  };

  const cancel = () => {
    if (!state.dirty) {
      onDone();
      return;
    }
    Alert.alert('Discard your changes?', 'Nothing you changed here has been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDone },
    ]);
  };

  const save = async () => {
    if (await state.save()) {
      onDone();
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
        >
          <EditorToolbar
            pdfLocked={pdfLocked}
            pdfBusy={state.pdf.busy}
            onPdf={choosePdf}
            onAddWork={() => setAddingWork(true)}
          />
          {state.pdf.error ? (
            <Banner tone="danger" role="alert">
              {state.pdf.error}
            </Banner>
          ) : null}
          {state.saveError ? (
            <Banner tone="danger" role="alert">
              {state.saveError}
            </Banner>
          ) : null}
          {state.placement.length > 0 ? (
            <Banner
              tone="success"
              title="Added to this plan"
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

          {draft.map((phase, index) => (
            <EditorPhaseCard
              key={phase.id ?? `new-${index}`}
              phase={phase}
              index={index}
              count={draft.length}
              onChange={(next) => state.edit(replaceAt(draft, index, next))}
              onMove={(delta) => state.edit(moveItem(draft, index, delta))}
              onRemove={() => state.edit(removeAt(draft, index))}
            />
          ))}
          <Button
            label="Add phase"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => state.edit([...draft, newPhase(draft.length + 1)])}
          />
        </ScrollView>

        <StickyActionBar
          note={
            state.problem ? (
              <View accessibilityLiveRegion="polite">
                <AppText size="sm" tone="warning">
                  {state.problem}
                </AppText>
              </View>
            ) : undefined
          }
        >
          <Grow>
            <Button label="Cancel" variant="secondary" disabled={state.saving} onPress={cancel} />
          </Grow>
          <Grow>
            <Button
              label="Save plan"
              icon="save-outline"
              loading={state.saving}
              disabled={Boolean(state.problem)}
              onPress={() => void save()}
            />
          </Grow>
        </StickyActionBar>
      </KeyboardAvoidingView>

      <AddWorkSheet
        plan={plan}
        visible={addingWork}
        busy={state.addWorkBusy}
        error={state.addWorkError}
        onClose={() => setAddingWork(false)}
        onSubmit={state.addWork}
      />
    </Screen>
  );
}
