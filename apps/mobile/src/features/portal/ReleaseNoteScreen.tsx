import { RELEASE_NOTE_ITEM_KIND_LABELS, type PortalReleaseNote } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * One release, and what was in it.
 *
 * The list could only say "version 4.2, released Tuesday", which is a fact rather than
 * information. This is the rest of it: the summary the team wrote and the items that went out,
 * each labelled by kind so a fix and a new feature are told apart by the word and not only by
 * where they sit.
 */
export function ReleaseNoteScreen({ releaseId }: { releaseId: string }) {
  const theme = useTheme();
  const query = useResource<PortalReleaseNote>(
    ['portal', 'release-notes', releaseId],
    `/portal/release-notes/${releaseId}`,
  );
  const release = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!release && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
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
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card>
          <AppText size="lg" weight="bold">
            Version {release.version}
          </AppText>
          <AppText size="xs" tone="faint">
            Released {formatDate(release.releaseDate)}
          </AppText>
          {release.summary ? <AppText>{release.summary}</AppText> : null}
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            What changed ({release.items.length})
          </AppText>
          {release.items.length === 0 ? (
            <AppText tone="muted">Your team did not list the individual changes.</AppText>
          ) : (
            release.items.map((item, index) => (
              <View key={`${item.kind}-${index}`} style={{ gap: theme.spacing.xs }}>
                <Divider />
                {/* The word carries the meaning; the pill is never the only thing saying it. */}
                <Pill label={RELEASE_NOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind} />
                <AppText size="sm">{item.label}</AppText>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
