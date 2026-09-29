import {
  RELEASE_NOTE_ITEM_KIND_LABELS,
  type PortalReleaseNote,
  type ReleaseNoteItemKind,
} from '@ashniva/types';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { IconTile, type IconName, type IconTone } from '../../shared/components/Icon';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { PullRefresh } from '../../shared/components/PullRefresh';

interface KindMark {
  icon: IconName;
  tone: IconTone;
}

const KIND_MARKS: Record<ReleaseNoteItemKind, KindMark> = {
  TASK: { icon: 'checkbox-outline', tone: 'primary' },
  TICKET: { icon: 'ticket-outline', tone: 'orange' },
  CLIENT_UPDATE: { icon: 'megaphone-outline', tone: 'teal' },
  CODE_ACTIVITY: { icon: 'code-slash-outline', tone: 'violet' },
  MANUAL: { icon: 'create-outline', tone: 'neutral' },
};

const FALLBACK_MARK: KindMark = { icon: 'sparkles-outline', tone: 'neutral' };

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
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero title={`Version ${release.version}`} icon="rocket-outline" iconTone="violet">
          <MetaLine icon="calendar-outline">Released {formatDate(release.releaseDate)}</MetaLine>
          {release.summary ? <AppText>{release.summary}</AppText> : null}
        </Hero>

        <Section title={`What changed (${release.items.length})`} icon="sparkles-outline">
          {release.items.length === 0 ? (
            <AppText tone="muted">Your team did not list the individual changes.</AppText>
          ) : (
            release.items.map((item, index) => {
              const mark = KIND_MARKS[item.kind] ?? FALLBACK_MARK;
              return (
                <View key={`${item.kind}-${index}`} style={{ gap: theme.spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                    <IconTile name={mark.icon} tone={mark.tone} size={32} />
                    <View style={{ alignItems: 'flex-start', flex: 1, gap: theme.spacing.xs }}>
                      {/* The word carries the meaning; the pill is never the only thing saying it. */}
                      <Pill label={RELEASE_NOTE_ITEM_KIND_LABELS[item.kind] ?? item.kind} />
                      <AppText size="sm">{item.label}</AppText>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}
