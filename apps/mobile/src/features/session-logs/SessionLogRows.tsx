import { ROLE_LABELS, type SessionLogEvent, type SessionLogSession } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { IconTile } from '../../shared/components/Icon';
import { AppText, Card, Divider, Pill } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { formatSpan, type PersonSessions, type TeamTotals } from './session-log-display';

/** The whole range at a glance, above the people. */
export function TeamTotalsCard({ totals }: { totals: TeamTotals }) {
  return (
    <Card>
      <KeyValueRow label="People" value={totals.people} />
      <KeyValueRow label="Sessions" value={totals.sessions} />
      <KeyValueRow label="Signed in" value={formatSpan(totals.signedInSeconds)} emphasis />
      <KeyValueRow label="On break" value={formatSpan(totals.breakSeconds)} />
      {totals.stillSignedIn > 0 ? (
        <KeyValueRow label="Still signed in now" value={totals.stillSignedIn} tone="success" />
      ) : null}
    </Card>
  );
}

/** One person: their totals, then each session from sign-in to sign-out and the break after it. */
export function PersonSessionsCard({ group }: { group: PersonSessions }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name="person-outline" tone="info" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">{group.user.name}</AppText>
          <AppText size="xs" tone="muted">
            {group.roleKey ? ROLE_LABELS[group.roleKey] : '—'} · {group.sessions.length}{' '}
            {group.sessions.length === 1 ? 'session' : 'sessions'}
          </AppText>
        </View>
        {group.openSessions > 0 ? <Pill label="Signed in" tone="success" /> : null}
      </View>
      <View
        accessible
        accessibilityLabel={`${group.user.name}: signed in ${formatSpan(group.signedInSeconds)}, on break ${formatSpan(group.breakSeconds)}`}
        style={{ flexDirection: 'row', gap: theme.spacing.md }}
      >
        <Figure label="Signed in" value={formatSpan(group.signedInSeconds)} />
        <Figure label="On break" value={formatSpan(group.breakSeconds)} />
      </View>
      {group.sessions.map((session) => (
        <View key={session.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <SessionLine session={session} />
        </View>
      ))}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm,
        flex: 1,
        gap: 2,
        padding: theme.spacing.sm,
      }}
    >
      <AppText size="xs" tone="muted">
        {label}
      </AppText>
      <AppText weight="bold" tabular>
        {value}
      </AppText>
    </View>
  );
}

function SessionLine({ session }: { session: SessionLogSession }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2, paddingTop: theme.spacing.xs }}>
      <KeyValueRow label="Login" value={formatDateTime(session.loginAt) ?? '—'} />
      <KeyValueRow
        label="Logout"
        value={session.logoutAt ? (formatDateTime(session.logoutAt) ?? '—') : 'Still signed in'}
        {...(session.logoutAt ? {} : { tone: 'success' as const })}
      />
      <KeyValueRow label="Session" value={formatSpan(session.durationSeconds)} />
      <KeyValueRow label="Break after" value={formatSpan(session.breakAfterSeconds)} />
    </View>
  );
}

/** One login or logout on the timeline. */
export function SessionEventRow({ event }: { event: SessionLogEvent }) {
  const theme = useTheme();
  const login = event.kind === 'LOGIN';
  const when = formatDateTime(event.at) ?? event.at;
  return (
    <Card style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }} padded>
      <IconTile
        name={login ? 'log-in-outline' : 'log-out-outline'}
        tone={login ? 'success' : 'neutral'}
        size={36}
      />
      <View
        accessible
        accessibilityLabel={`${event.user.name} ${login ? 'logged in' : 'logged out'} ${when}`}
        style={{ flex: 1, gap: 2 }}
      >
        <AppText weight="medium">{event.user.name}</AppText>
        <AppText size="xs" tone="muted">
          {login ? 'Login' : 'Logout'} · {when}
        </AppText>
        <AppText size="xs" tone="faint">
          {event.roleKey ? ROLE_LABELS[event.roleKey] : '—'} · IP {event.ipAddress ?? '—'}
        </AppText>
      </View>
    </Card>
  );
}
