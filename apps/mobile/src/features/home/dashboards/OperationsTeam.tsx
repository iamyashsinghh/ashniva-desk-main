import {
  AVAILABILITY_STATUS_LABELS,
  type OperationsAvailabilityEntry,
  type OperationsTeamMember,
} from '@ashniva/types';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useDashboardActions } from './dashboard-actions';
import { CompactEmpty, DashboardSection } from './preview-lists';

/**
 * Who is on the team, what they are holding, and whether they are reachable.
 *
 * Both halves are optional and separately permitted, so each draws on its own; a half the API left
 * out is not described as empty, because the caller was never told it exists.
 */
export function OperationsTeam({
  team,
  availability,
}: {
  team?: OperationsTeamMember[];
  availability?: OperationsAvailabilityEntry[];
}) {
  if (!team && !availability) {
    return null;
  }
  const byUser = new Map((availability ?? []).map((entry) => [entry.user.id, entry]));
  const people = team ?? [];

  return (
    <DashboardSection
      title="Team"
      icon="people-outline"
      count={team ? team.length : (availability?.length ?? 0)}
    >
      {team && team.length === 0 ? (
        <CompactEmpty title="Nobody in your team yet" icon="people-outline" />
      ) : null}
      {people.map((member) => (
        <MemberCard key={member.user.id} member={member} state={byUser.get(member.user.id)} />
      ))}
      {!team && availability ? <AvailabilityOnly entries={availability} /> : null}
    </DashboardSection>
  );
}

function MemberCard({
  member,
  state,
}: {
  member: OperationsTeamMember;
  state: OperationsAvailabilityEntry | undefined;
}) {
  const { onOpenTask } = useDashboardActions();
  const task = member.currentTask;
  const load = [
    `${member.openTasks} open`,
    `${member.dueToday} due today`,
    member.delayed > 0 ? `${member.delayed} delayed` : '',
    member.minutesToday > 0 ? formatMinutes(member.minutesToday) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <>
      <AppText weight="medium" numberOfLines={1}>
        {member.user.name}
        {member.title ? (
          <AppText size="xs" tone="faint">
            {`  ${member.title}`}
          </AppText>
        ) : null}
      </AppText>
      <AppText size="xs" tone={member.delayed > 0 ? 'danger' : 'muted'} numberOfLines={1}>
        {load}
      </AppText>
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {task ? `Working on ${task.key} · ${task.title}` : 'Nothing in progress'}
      </AppText>
      {state ? <AvailabilityPills state={state} /> : null}
    </>
  );

  if (task && onOpenTask) {
    return (
      <PressableCard
        accessibilityLabel={`${member.user.name}, ${load}, working on ${task.key} ${task.title}`}
        onPress={() => onOpenTask(task.id)}
        leading={<Avatar name={member.user.name} size={40} />}
      >
        {body}
      </PressableCard>
    );
  }
  return <PersonCard name={member.user.name}>{body}</PersonCard>;
}

function AvailabilityPills({ state }: { state: OperationsAvailabilityEntry }) {
  return (
    <PillRow>
      <Pill
        label={AVAILABILITY_STATUS_LABELS[state.status]}
        tone={state.available ? 'success' : 'warning'}
      />
      {state.onCall ? <Pill label="On call" tone="info" /> : null}
    </PillRow>
  );
}

function AvailabilityOnly({ entries }: { entries: OperationsAvailabilityEntry[] }) {
  if (entries.length === 0) {
    return <CompactEmpty title="Nobody in your scope has availability recorded" />;
  }
  return (
    <>
      {entries.map((entry) => (
        <PersonCard key={entry.user.id} name={entry.user.name}>
          <AppText weight="medium" numberOfLines={1}>
            {entry.user.name}
          </AppText>
          <AvailabilityPills state={entry} />
        </PersonCard>
      ))}
    </>
  );
}

function PersonCard({ name, children }: { name: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1, gap: theme.spacing.xs + 2 }}>{children}</View>
    </Card>
  );
}
