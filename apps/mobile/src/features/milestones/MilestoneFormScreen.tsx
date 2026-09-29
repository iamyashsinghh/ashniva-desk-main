import {
  PERMISSIONS,
  type MilestoneDetail,
  type MilestoneSummary,
  type ProjectDetail,
} from '@ashniva/types';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { StickyActionBar, useStackKeyboardOffset } from '../../shared/components/layout';
import { Button, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useClientContractOptions } from '../contracts/commercial-options';
import { NotAvailable, RecordPending } from '../contracts/commercial-ui';
import { MILESTONE_INVALIDATES } from './milestone-display';
import {
  createMilestonePayload,
  initialMilestoneForm,
  milestoneFormProblem,
  milestonePayload,
  type MilestoneFormState,
} from './milestone-form';
import { MilestoneFormFields } from './MilestoneFormFields';

/**
 * Create a milestone in a project, or edit one. A new milestone needs its project, so it is
 * opened from a project or from a contract that has one; a contract passes itself along as the
 * default, as the web's "Add milestone" on a contract does.
 */
export function MilestoneFormScreen({
  milestoneId,
  projectId,
  contractId,
  onSaved,
}: {
  milestoneId?: string;
  projectId?: string;
  contractId?: string;
  onSaved: (milestoneId: string) => void;
}) {
  const { can } = useSession();
  const query = useResource<MilestoneDetail>(
    ['milestones', 'detail', milestoneId],
    `/milestones/${milestoneId}`,
    { enabled: Boolean(milestoneId) },
  );
  if (!can(PERMISSIONS.MILESTONE_MANAGE)) {
    return (
      <NotAvailable>Planning milestones needs the milestone management permission.</NotAvailable>
    );
  }
  if (milestoneId && !query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the milestone"
        onRetry={() => void query.refetch()}
      />
    );
  }
  const milestone = query.data ?? null;
  const project = milestone?.project.id ?? projectId;
  if (!project) {
    return (
      <NotAvailable>A milestone belongs to a project. Open the project to add one.</NotAvailable>
    );
  }
  return (
    <MilestoneForm
      milestone={milestone}
      projectId={project}
      defaultContractId={contractId ?? null}
      onSaved={onSaved}
    />
  );
}

function MilestoneForm({
  milestone,
  projectId,
  defaultContractId,
  onSaved,
}: {
  milestone: MilestoneDetail | null;
  projectId: string;
  defaultContractId: string | null;
  onSaved: (milestoneId: string) => void;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const [form, setForm] = useState<MilestoneFormState>(() =>
    initialMilestoneForm(milestone, defaultContractId),
  );
  const [attempted, setAttempted] = useState(false);
  const problem = milestoneFormProblem(form);

  const project = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`);
  const contracts = useClientContractOptions(project.data?.clientOrganization?.id ?? null);
  const siblingsQuery = useResource<MilestoneSummary[]>(
    ['milestones', 'list', projectId],
    '/milestones',
    { query: { projectId } },
  );
  const siblings = useMemo(
    () =>
      (siblingsQuery.data ?? [])
        .filter((entry) => entry.id !== milestone?.id)
        .map((entry) => ({ value: entry.id, label: entry.name })),
    [siblingsQuery.data, milestone?.id],
  );

  const save = useApiMutation<Record<string, unknown>, MilestoneDetail>({
    path: milestone ? `/milestones/${milestone.id}` : '/milestones',
    method: milestone ? 'PATCH' : 'POST',
    body: (body) => body,
    invalidate: MILESTONE_INVALIDATES,
    onSuccess: (saved) => onSaved(saved.id),
  });

  const set = (patch: Partial<MilestoneFormState>) => {
    save.reset();
    setForm((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    setAttempted(true);
    if (problem) {
      return;
    }
    void save.run(milestone ? milestonePayload(form) : createMilestonePayload(form, projectId));
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
          {project.data ? <Banner tone="info">In {project.data.name}</Banner> : null}
          {save.error ? (
            <Banner tone="danger" title="Could not save the milestone" role="alert">
              {save.error}
            </Banner>
          ) : null}
          {attempted && problem ? <Banner tone="warning">{problem}</Banner> : null}
          <MilestoneFormFields
            form={form}
            set={set}
            contracts={contracts}
            siblings={{ options: siblings, isLoading: siblingsQuery.isLoading }}
          />
        </ScrollView>
        <StickyActionBar>
          <Button
            label={milestone ? 'Save' : 'Create milestone'}
            icon="checkmark"
            loading={save.busy}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </StickyActionBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
