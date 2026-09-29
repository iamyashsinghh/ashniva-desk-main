import { PERMISSIONS, RELEASE_NOTE_STATUS, type ReleaseNoteDetail } from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { AddReleaseNoteLineSheet } from './AddReleaseNoteLineSheet';
import { useReleaseNote, useReleaseNoteWrite } from './release-note-api';
import { isEditable, releaseNoteStatusLabel, releaseNoteTone } from './release-note-display';
import { ReleaseNoteActionBar } from './ReleaseNoteActionBar';
import { ReleaseNoteFormSheet } from './ReleaseNoteFormSheet';
import { ReleaseNoteHistorySection } from './ReleaseNoteHistorySection';
import { ReleaseNoteItemsSection } from './ReleaseNoteItemsSection';
import { ReleaseNotePreviewSection } from './ReleaseNotePreviewSection';

/**
 * One release note: the editor, the review screen and the approval trail — the web's page in one
 * column.
 *
 * What the client will read and what it never will sit apart: the client summary and the preview
 * are marked as the client's, and internal notes are a tinted strip that cannot be mistaken for
 * either. Editing follows the API's rule — a draft or a note sent back, and release-note:write.
 */
export function ReleaseNoteDetailScreen({ noteId }: { noteId: string }) {
  const query = useReleaseNote(noteId);
  const note = query.data ?? null;

  if (!note && query.error) {
    return (
      <Screen>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  if (!note) {
    return (
      <Screen>
        <LoadingState label="Loading the release note" />
      </Screen>
    );
  }
  return (
    <Loaded note={note} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
  );
}

function Loaded({
  note,
  refreshing,
  onRefresh,
}: {
  note: ReleaseNoteDetail;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const generate = useReleaseNoteWrite(note.id, 'generate', { body: () => ({}) });
  const mayEdit = can(PERMISSIONS.RELEASE_NOTE_WRITE) && isEditable(note.status);
  const latest = note.history[0];

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
          overline={`Release note · ${note.projectCode}`}
          title={`${note.projectCode} ${note.version}`}
          icon="document-text"
          iconTone="teal"
        >
          <PillRow>
            <Pill label={releaseNoteStatusLabel(note.status)} tone={releaseNoteTone(note.status)} />
          </PillRow>
          <MetaLine icon="calendar-outline">
            {`Released ${formatDate(note.releaseDate) ?? '—'}${
              note.publishedAt ? ` · published ${formatDateTime(note.publishedAt) ?? ''}` : ''
            }`}
          </MetaLine>
        </Hero>

        {note.status === RELEASE_NOTE_STATUS.CHANGES_REQUESTED && latest?.note ? (
          <Banner tone="warning" title="Changes requested">
            <AppText size="sm">{latest.note}</AppText>
            <AppText size="xs" tone="muted">
              {latest.changedByName} · {formatDateTime(latest.createdAt)}
            </AppText>
          </Banner>
        ) : null}

        {mayEdit ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Button
              label="Edit details"
              icon="create-outline"
              size="sm"
              variant="secondary"
              onPress={() => setEditing(true)}
            />
            <Button
              label="Generate from completed work"
              icon="sparkles-outline"
              size="sm"
              variant="secondary"
              loading={generate.busy}
              accessibilityHint="Adds anything completed since the last published note; existing lines are left alone"
              onPress={() => void generate.run()}
            />
            <Button
              label="Add a line"
              icon="add"
              size="sm"
              variant="secondary"
              onPress={() => setAdding(true)}
            />
          </View>
        ) : null}
        {generate.error ? (
          <Banner tone="danger" role="alert">
            {generate.error}
          </Banner>
        ) : null}

        <ReleaseNoteItemsSection note={note} editable={mayEdit} />

        <Section
          title="Summary for the client"
          icon="chatbox-ellipses-outline"
          action={<Pill label="The client sees this" tone="success" />}
        >
          <AppText size="sm" tone={note.clientSummary ? 'default' : 'muted'}>
            {note.clientSummary ?? 'No summary yet.'}
          </AppText>
        </Section>

        <Banner tone="warning" title="Internal notes — never shown to the client">
          <AppText size="sm" tone={note.internalNotes ? 'default' : 'muted'}>
            {note.internalNotes ?? 'Nothing recorded.'}
          </AppText>
        </Banner>

        <ReleaseNotePreviewSection note={note} />
        <ReleaseNoteHistorySection note={note} />
      </ScrollView>

      <ReleaseNoteActionBar note={note} />
      {editing ? <ReleaseNoteFormSheet existing={note} onClose={() => setEditing(false)} /> : null}
      {adding ? (
        <AddReleaseNoteLineSheet noteId={note.id} onClose={() => setAdding(false)} />
      ) : null}
    </Screen>
  );
}
