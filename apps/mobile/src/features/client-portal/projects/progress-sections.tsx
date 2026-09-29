import type {
  PortalProgressBlocker,
  PortalProgressRelease,
  UatRequestSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { ListRow, MetaLine } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { uatStatusLabel } from '../../uat/uat-display';

/**
 * The parts of the progress board that are about the client rather than the work: what is held
 * up (and whether on them), what they are asked to sign off, and what has gone live.
 */

export function BlockersSection({ blockers }: { blockers: readonly PortalProgressBlocker[] }) {
  const theme = useTheme();
  const waitingOnYou = blockers.filter((blocker) => blocker.waitingOnYou).length;
  return (
    <Section
      title="Needs attention"
      icon="alert-circle-outline"
      {...(waitingOnYou > 0
        ? { action: <Pill label={`${waitingOnYou} for you`} tone="warning" /> }
        : {})}
    >
      {blockers.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing is held up — every piece of work is moving.
        </AppText>
      ) : (
        blockers.map((blocker, index) => (
          <View key={blocker.id} style={{ gap: theme.spacing.xs }}>
            {index > 0 ? <Divider /> : null}
            <AppText weight="medium">{blocker.title}</AppText>
            <PillRow>
              <Pill
                label={blocker.waitingOnYou ? 'Waiting for you' : 'On hold'}
                tone={blocker.waitingOnYou ? 'warning' : 'info'}
              />
            </PillRow>
            <AppText size="sm">
              {blocker.note ?? 'Your team is working on it and will update you here.'}
            </AppText>
            <MetaLine icon="time-outline">
              {blocker.key} · since {formatSince(blocker.since)}
            </MetaLine>
          </View>
        ))
      )}
    </Section>
  );
}

/**
 * Sign-off requests on this project.
 *
 * Opening one needs `uat:decide` (the web guards the sign-off pages with it), so without it the
 * rows are shown but do not open — the list still answers "is anything waiting on us".
 */
export function SignOffsSection({
  requests,
  onOpen,
}: {
  requests: readonly UatRequestSummary[];
  onOpen?: (requestId: string) => void;
}) {
  return (
    <Section title="Your sign-offs" icon="ribbon-outline" count={requests.length}>
      {requests.length === 0 ? (
        <AppText size="sm" tone="muted">
          When a change is ready for your approval it appears here.
        </AppText>
      ) : (
        requests.map((request) => (
          <ListRow
            key={request.id}
            title={request.summaryPlain}
            subtitle={`${uatStatusLabel(request.status)} · asked ${formatSince(request.createdAt)}${
              request.decidedAt ? ` · answered ${formatSince(request.decidedAt)}` : ''
            }`}
            {...(onOpen
              ? {
                  onPress: () => onOpen(request.id),
                  accessibilityLabel: `${request.summaryPlain}, ${uatStatusLabel(request.status)}`,
                  accessibilityHint: 'Opens the sign-off',
                }
              : {})}
          />
        ))
      )}
    </Section>
  );
}

export function ReleasesSection({
  releases,
  onOpen,
}: {
  releases: readonly PortalProgressRelease[];
  onOpen?: (releaseId: string) => void;
}) {
  return (
    <Section title="Recently released" icon="rocket-outline" count={releases.length}>
      {releases.length === 0 ? (
        <AppText size="sm" tone="muted">
          Each release your team publishes will be listed here.
        </AppText>
      ) : (
        releases.map((release) => (
          <ListRow
            key={release.id}
            title={`Version ${release.version}`}
            subtitle={[`Released ${formatDate(release.releaseDate)}`, release.summary]
              .filter(Boolean)
              .join(' · ')}
            {...(onOpen
              ? {
                  onPress: () => onOpen(release.id),
                  accessibilityHint: 'Opens what changed in this release',
                }
              : {})}
          />
        ))
      )}
    </Section>
  );
}
