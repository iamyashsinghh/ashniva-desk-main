import { PERMISSIONS, type DirectoryEntry, type ProjectDetail } from '@ashniva/types';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { Banner } from '../../shared/components/feedback';
import { StickyActionBar } from '../../shared/components/layout';
import { useDirectory, UserPicker } from '../../shared/components/pickers';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { MemberDraftRow } from './MemberDraftRow';
import {
  addPeople,
  draftsFromMembers,
  membersPayload,
  type MemberDraft,
  type MemberInput,
} from './project-members';

/**
 * Who is on a project, and what each of them does there.
 *
 * Loads the project, then edits a draft of its team that is sent in one `PUT` — see
 * `project-members.ts` for why it is never a write per change.
 */
export function ProjectMembersScreen({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const query = useResource<ProjectDetail>(['projects', projectId], `/projects/${projectId}`);

  if (!can(PERMISSIONS.PROJECT_MANAGE)) {
    return (
      <Screen>
        <View style={{ padding: theme.spacing.screen }}>
          <Banner tone="warning" title="Not available to you">
            Changing a project’s team needs the project management permission.
          </Banner>
        </View>
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen>
        {query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            offline={query.error instanceof Error && query.error.name === 'NetworkError'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingState label="Loading the team" variant="spinner" />
        )}
      </Screen>
    );
  }
  return <MembersEditor project={query.data} onSaved={onSaved} />;
}

function MembersEditor({ project, onSaved }: { project: ProjectDetail; onSaved: () => void }) {
  const theme = useTheme();
  const directory = useDirectory();
  const [drafts, setDrafts] = useState<MemberDraft[]>(() => draftsFromMembers(project.members));
  const present = useMemo(() => new Set(drafts.map((draft) => draft.userId)), [drafts]);
  const notOnTeam = useCallback((person: DirectoryEntry) => !present.has(person.id), [present]);

  const save = useApiMutation<MemberInput[], ProjectDetail>({
    path: `/projects/${project.id}/members`,
    method: 'PUT',
    body: (members) => ({ members }),
    invalidate: [['projects']],
    onSuccess: () => onSaved(),
  });

  const edit = (next: MemberDraft[]) => {
    save.reset();
    setDrafts(next);
  };

  const add = (ids: string[]) => {
    const people = (directory.data ?? []).filter((person) => ids.includes(person.id));
    edit(addPeople(drafts, people));
  };

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        <AppText size="sm" tone="muted">
          {project.code} · {project.name}
        </AppText>
        {save.error ? (
          <Banner tone="danger" title="Could not save the team" role="alert">
            {save.error}
          </Banner>
        ) : null}
        <UserPicker
          label="Add people"
          value={[]}
          onChange={add}
          multiple
          filter={notOnTeam}
          placeholder="Choose people to add"
          hint="They join as developers; change the role below."
        />
        {drafts.length === 0 ? (
          <EmptyState
            title="Nobody on this project yet"
            description="Add the people who will work on it."
            icon="people-outline"
          />
        ) : null}
        {drafts.map((draft) => (
          <MemberDraftRow
            key={draft.userId}
            draft={draft}
            onChange={(patch) =>
              edit(drafts.map((row) => (row.userId === draft.userId ? { ...row, ...patch } : row)))
            }
            onRemove={() => edit(drafts.filter((row) => row.userId !== draft.userId))}
          />
        ))}
      </ScrollView>
      <StickyActionBar>
        <Button
          label="Save team"
          icon="checkmark"
          loading={save.busy}
          onPress={() => void save.run(membersPayload(drafts))}
          style={{ flex: 1 }}
        />
      </StickyActionBar>
    </Screen>
  );
}
