import {
  PRIORITY_LABELS,
  type DecideWorkPlanProposalInput,
  type ProjectWorkPlan,
  type UpdateWorkPlanProposalInput,
  type UserRef,
  type WorkPlanProposal,
} from '@ashniva/types';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Divider, Field, Input } from '../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Work sent for the project's Summary (from AI Memory) that is waiting for a decision.
 *
 * Nothing here is in the Summary yet. An admin, project manager or team lead can pick the
 * developer, fix the title, and publish it into its phase — or reject it with a note. Everyone
 * else sees what is waiting, so the team knows it is coming. Hidden when nothing is waiting.
 */
export function SummaryProposals({ projectId }: { projectId: string }) {
  const theme = useTheme();
  const proposals = useResource<WorkPlanProposal[]>(
    proposalsKey(projectId),
    `/projects/${projectId}/work-plan/proposals`,
    { query: { status: 'PENDING' }, refetchInterval: 30_000 },
  );
  const waiting = proposals.data ?? [];
  const plan = useResource<ProjectWorkPlan>(
    ['projects', projectId, 'work-plan'],
    `/projects/${projectId}/work-plan`,
    { enabled: waiting.length > 0 },
  );

  if (waiting.length === 0) {
    return null;
  }

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Waiting for approval ({waiting.length})
      </AppText>
      <AppText size="xs" tone="faint">
        Sent from AI Memory. It joins the Summary only once it is published.
      </AppText>
      {waiting.map((proposal) => (
        <View key={proposal.id} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <ProposalItem projectId={projectId} proposal={proposal} plan={plan.data ?? null} />
        </View>
      ))}
    </Card>
  );
}

function proposalsKey(projectId: string) {
  return ['projects', projectId, 'work-plan', 'proposals'] as const;
}

function phaseName(proposal: WorkPlanProposal, plan: ProjectWorkPlan | null): string {
  if (proposal.phaseId) {
    return plan?.phases.find((phase) => phase.id === proposal.phaseId)?.heading ?? 'Existing phase';
  }
  return proposal.phaseHeading ? `${proposal.phaseHeading} (new)` : 'General (new)';
}

function ProposalItem({
  projectId,
  proposal,
  plan,
}: {
  projectId: string;
  proposal: WorkPlanProposal;
  plan: ProjectWorkPlan | null;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(proposal.title);
  const [assigneeId, setAssigneeId] = useState<string | null>(proposal.assignedTo?.id ?? null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const invalidate = [
    proposalsKey(projectId),
    ['projects', projectId],
    ['projects', projectId, 'work-plan'],
    ['tasks'],
  ] as const;
  const publish = useApiMutation<UpdateWorkPlanProposalInput & DecideWorkPlanProposalInput>({
    path: `/projects/${projectId}/work-plan/proposals/${proposal.id}/publish`,
    body: (input) => input,
    invalidate,
  });
  const reject = useApiMutation<DecideWorkPlanProposalInput>({
    path: `/projects/${projectId}/work-plan/proposals/${proposal.id}/reject`,
    body: (input) => input,
    invalidate: [proposalsKey(projectId)],
  });

  const developers = developerChoices(plan?.developers ?? [], proposal.assignedTo);
  const trimmed = title.trim();
  const busy = publish.busy || reject.busy;

  function onPublish() {
    const edits: UpdateWorkPlanProposalInput = {};
    if (trimmed !== proposal.title) {
      edits.title = trimmed;
    }
    if (assigneeId !== (proposal.assignedTo?.id ?? null)) {
      edits.assignedToId = assigneeId;
    }
    void publish.run(edits);
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {proposal.canDecide ? (
        <Field label="Title">
          <Input value={title} onChangeText={setTitle} maxLength={300} editable={!busy} />
        </Field>
      ) : (
        <AppText weight="bold">{proposal.title}</AppText>
      )}
      <AppText size="xs" tone="muted">
        {phaseName(proposal, plan)}
        {proposal.priority ? ` · ${PRIORITY_LABELS[proposal.priority]}` : ''}
        {proposal.dueDate ? ` · due ${formatDate(proposal.dueDate)}` : ''}
      </AppText>

      <View style={{ gap: theme.spacing.xs }}>
        {proposal.points.map((point, index) => (
          <AppText key={index} size="sm">
            • {point.body}{' '}
            <AppText size="xs" tone="faint">
              ({formatMinutes(point.estimateMinutes)})
            </AppText>
          </AppText>
        ))}
      </View>

      {proposal.context ? (
        <AppText size="xs" tone="muted" numberOfLines={4}>
          {proposal.context}
        </AppText>
      ) : null}
      <AppText size="xs" tone="faint">
        Sent by {proposal.createdBy?.name ?? proposal.source}
      </AppText>

      {proposal.canDecide ? (
        <Field
          label="Developer"
          hint="The task is created for this developer when it is published."
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Choice
              label="Nobody yet"
              selected={assigneeId === null}
              onPress={() => setAssigneeId(null)}
            />
            {developers.map((developer) => (
              <Choice
                key={developer.id}
                label={developer.name}
                selected={assigneeId === developer.id}
                onPress={() => setAssigneeId(developer.id)}
              />
            ))}
          </View>
        </Field>
      ) : (
        <AppText size="sm" tone="muted">
          Developer: {proposal.assignedTo?.name ?? 'not chosen yet'}
        </AppText>
      )}

      {publish.error ? (
        <AppText size="sm" tone="danger">
          {publish.error}
        </AppText>
      ) : null}
      {reject.error ? (
        <AppText size="sm" tone="danger">
          {reject.error}
        </AppText>
      ) : null}

      {proposal.canDecide && !rejecting ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Publish"
              onPress={onPublish}
              loading={publish.busy}
              disabled={busy || trimmed.length === 0}
              accessibilityHint="Adds it to the Summary in its phase"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Reject"
              variant="secondary"
              onPress={() => setRejecting(true)}
              disabled={busy}
            />
          </View>
        </View>
      ) : null}

      {proposal.canDecide && rejecting ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Field label="Why (optional)" hint="AI Memory shows this note to whoever sent it.">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Already done"
              maxLength={1000}
              multiline
              editable={!busy}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Reject"
                variant="danger"
                loading={reject.busy}
                disabled={busy}
                onPress={() => void reject.run(note.trim() ? { note: note.trim() } : {})}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                variant="secondary"
                disabled={busy}
                onPress={() => setRejecting(false)}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The project's developers, plus whoever was sent in case they are not one of them. */
function developerChoices(developers: UserRef[], sent: UserRef | null): UserRef[] {
  if (!sent || developers.some((developer) => developer.id === sent.id)) {
    return developers;
  }
  return [...developers, sent];
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        justifyContent: 'center',
        minHeight: TOUCH_TARGET,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <AppText size="sm" tone={selected ? 'inverse' : 'default'} weight="medium">
        {label}
      </AppText>
    </Pressable>
  );
}
