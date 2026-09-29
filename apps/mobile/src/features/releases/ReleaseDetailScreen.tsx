import { PERMISSIONS, type ReleaseDetail } from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ClientSignOffSection } from './ClientSignOffSection';
import { EditReleaseSheet } from './EditReleaseSheet';
import { ReadinessSection } from './ReadinessSection';
import { ReleaseActionBar } from './ReleaseActionBar';
import { useRelease } from './release-api';
import { ReleaseApprovalsSection } from './ReleaseApprovalsSection';
import { ENVIRONMENT_LABELS, isDraft, releaseStatusLabel, releaseTone } from './release-display';
import { ReleaseItemsSection, type ItemLinks } from './ReleaseItemsSection';
import { ReleasePolicySection } from './ReleasePolicySection';
import { ReleaseHistorySection, ReleaseTimelineSection } from './ReleaseTimelineSection';

export interface ReleaseDetailLinks extends ItemLinks {
  onOpenProject?: (projectId: string) => void;
  onOpenReleaseNote?: (releaseNoteId: string) => void;
  onOpenAssignment?: (assignmentId: string) => void;
}

/**
 * One release: what is going out, what must be true first, who has to agree, and what happened —
 * the web's release page in one column.
 *
 * What stops the release comes first after the header, because it is why somebody opens a release
 * on a phone. Everything that decides whether it may ship is the server's readiness checklist,
 * printed rather than worked out again. The whole page is internal: clients read the release note,
 * never this, and the header says so.
 */
export function ReleaseDetailScreen({
  releaseId,
  ...links
}: { releaseId: string } & ReleaseDetailLinks) {
  const query = useRelease(releaseId);
  const release = query.data ?? null;

  if (!release && query.error) {
    return (
      <Screen>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  if (!release) {
    return (
      <Screen>
        <LoadingState label="Loading the release" />
      </Screen>
    );
  }
  return (
    <Loaded
      release={release}
      links={links}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    />
  );
}

function Loaded({
  release,
  links,
  refreshing,
  onRefresh,
}: {
  release: ReleaseDetail;
  links: ReleaseDetailLinks;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const canManage = can(PERMISSIONS.RELEASE_MANAGE);
  const tone = releaseTone(release.status);
  const { onOpenProject, onOpenReleaseNote, onOpenAssignment } = links;
  const noteId = release.releaseNoteId;

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
          overline={`${release.projectName} · ${ENVIRONMENT_LABELS[release.environment]}`}
          title={`${release.version} — ${release.title}`}
          icon="rocket"
          iconTone={tone === 'danger' ? 'danger' : 'violet'}
        >
          <PillRow>
            <Pill label={releaseStatusLabel(release.status)} tone={tone} />
            <Pill label="Internal — clients see the release note" tone="warning" />
          </PillRow>
          <MetaLine icon="layers-outline">
            {`${release.items.length} item${release.items.length === 1 ? '' : 's'} · created ${formatDateTime(release.createdAt) ?? ''}`}
          </MetaLine>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {canManage && isDraft(release.status) ? (
              <Button
                label="Edit details"
                icon="create-outline"
                size="sm"
                variant="secondary"
                onPress={() => setEditing(true)}
              />
            ) : null}
            {onOpenProject ? (
              <Button
                label="Open project"
                icon="folder-open-outline"
                size="sm"
                variant="ghost"
                onPress={() => onOpenProject(release.projectId)}
              />
            ) : null}
          </View>
        </Hero>

        {release.failureReason ? (
          <Banner tone="danger" title="The publish failed" role="alert">
            {`${release.failureReason}\nReopening returns the release to draft; the sign-offs are collected again.`}
          </Banner>
        ) : null}
        {release.rolledBackAt ? (
          <Banner tone="danger" title={`Rolled back ${formatDateTime(release.rolledBackAt) ?? ''}`}>
            {release.rollbackReason ?? 'No reason was recorded.'}
          </Banner>
        ) : null}

        <ReadinessSection release={release} {...(onOpenAssignment ? { onOpenAssignment } : {})} />
        <ReleaseItemsSection release={release} canManage={canManage} links={links} />

        {/*
          A tinted strip rather than another white card, so the plan nobody outside sees cannot be
          mistaken for the release note the client reads.
        */}
        <Banner
          tone="warning"
          title="Release notes — internal, never shown to the client"
          action={
            noteId && onOpenReleaseNote ? (
              <View style={{ alignItems: 'flex-start', paddingTop: theme.spacing.xs }}>
                <Button
                  label="Open the client release note"
                  icon="document-text-outline"
                  size="sm"
                  variant="secondary"
                  onPress={() => onOpenReleaseNote(noteId)}
                />
              </View>
            ) : undefined
          }
        >
          <AppText size="sm" tone={release.notes ? 'default' : 'muted'}>
            {release.notes ?? 'The plan for this release has not been written down.'}
          </AppText>
        </Banner>

        <ReleaseApprovalsSection release={release} />
        <ClientSignOffSection release={release} canManage={canManage} />
        <ReleaseTimelineSection release={release} />
        <ReleasePolicySection projectId={release.projectId} canManage={canManage} />
        <ReleaseHistorySection release={release} />
      </ScrollView>

      <ReleaseActionBar release={release} />
      {editing ? <EditReleaseSheet release={release} onClose={() => setEditing(false)} /> : null}
    </Screen>
  );
}
