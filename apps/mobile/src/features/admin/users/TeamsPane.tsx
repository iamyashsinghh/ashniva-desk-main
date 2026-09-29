import type { TeamSummary } from '@ashniva/types';
import { useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ListEmpty } from '../shared/AdminStates';
import { TeamSheet } from './TeamSheet';
import { useTeams, useUsers } from './users-api';

/** The provider's teams with their lead and members; tap one to change it, or start a new one. */
export function TeamsPane({ header }: { header: ReactNode }) {
  const theme = useTheme();
  const teams = useTeams();
  const people = useUsers(undefined);
  const [editing, setEditing] = useState<TeamSummary | 'new' | null>(null);

  const listHeader = (
    <View style={{ gap: theme.spacing.md }}>
      {header}
      <AppText size="sm" tone="muted">
        Team membership decides what each lead sees under “Team tasks”.
      </AppText>
      <Button label="New team" icon="add" variant="secondary" onPress={() => setEditing('new')} />
    </View>
  );

  return (
    <>
      <FlatList
        data={teams.data ?? []}
        keyExtractor={(team) => team.id}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={teams.isRefetching} onRefresh={() => teams.refetch()} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={
          <ListEmpty
            loading={teams.isLoading}
            error={teams.error}
            onRetry={() => void teams.refetch()}
            filtered={false}
            title="No teams yet"
            description="Group people under a lead with “New team”."
            icon="people-circle-outline"
            loadingLabel="Loading teams"
          />
        }
        renderItem={({ item }) => (
          <PressableCard
            accessibilityLabel={`${item.name}, ${item.members.length} members`}
            accessibilityHint="Edits the team"
            onPress={() => setEditing(item)}
            icon="people"
            iconTone="violet"
          >
            <AppText weight="medium">{item.name}</AppText>
            {item.description ? (
              <AppText size="sm" tone="muted" numberOfLines={2}>
                {item.description}
              </AppText>
            ) : null}
            <MetaLine icon="star-outline">Lead: {item.lead?.name ?? 'none yet'}</MetaLine>
            <MetaLine icon="people-outline">
              {item.members.length
                ? item.members.map((member) => member.name).join(', ')
                : 'No members yet'}
            </MetaLine>
          </PressableCard>
        )}
      />
      {editing ? (
        <TeamSheet
          {...(editing === 'new' ? {} : { team: editing })}
          people={people.data ?? []}
          peopleLoading={people.isLoading}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
