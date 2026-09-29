import { View } from 'react-native';

import { mobileEnv } from '../../config/env';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** The bottom of Home: what the phone app covers, and which build this is in development. */
export function HomeFooter({ isClient }: { isClient: boolean }) {
  const theme = useTheme();
  return (
    <>
      <View
        style={{
          alignItems: 'flex-start',
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.md,
          flexDirection: 'row',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
        }}
      >
        <Icon name="phone-portrait-outline" size={20} color={theme.colors.textMuted} />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText size="sm" weight="medium" tone="muted">
            {isClient ? 'What you can do here' : 'On your phone'}
          </AppText>
          <AppText size="xs" tone="faint">
            {isClient
              ? 'Raise a ticket, follow the ones you have open, approve what your team sends you, read what has been published, and check an invoice.'
              : 'Your tasks, the tickets you are on, approvals, your logged time, and what needs your attention. Everything else — reports, administration, billing setup — is on the web app.'}
          </AppText>
        </View>
      </View>

      {mobileEnv.isDevelopment ? (
        <AppText size="xs" tone="faint" align="center">
          Development build — {mobileEnv.apiBaseUrl}
        </AppText>
      ) : null}
    </>
  );
}
