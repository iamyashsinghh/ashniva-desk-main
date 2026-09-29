import { Share, View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { AppText, Button } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * A one-time invitation link, to pass on privately.
 *
 * The link is a credential for that account — whoever opens it first chooses the password — so
 * it is shown once, here, and handed to the system share sheet rather than kept anywhere.
 */
export function InvitationLink({
  name,
  invitation,
}: {
  name: string;
  invitation: { link: string; expiresAt: string };
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Banner tone="success" title={`Invitation ready for ${name}`}>
        {`Share it privately. It works once and expires ${formatDateTime(invitation.expiresAt) ?? 'soon'}.`}
      </Banner>
      <View
        accessible
        accessibilityLabel={`Invitation link: ${invitation.link}`}
        style={{
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.sm + 2,
          padding: theme.spacing.md,
        }}
      >
        <AppText size="sm" numberOfLines={3}>
          {invitation.link}
        </AppText>
      </View>
      <Button
        label="Share link"
        icon="share-outline"
        variant="secondary"
        onPress={() => void Share.share({ message: invitation.link }).catch(() => undefined)}
      />
    </View>
  );
}
