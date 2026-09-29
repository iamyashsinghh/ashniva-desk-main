import type { WhatsAppSettings } from '@ashniva/types';
import { Platform, Share, Text, View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill, PillRow } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * The callback URL to give Meta, and whether the two webhook secrets are in place. The URL is not
 * a secret — it is built by the API so it cannot be mistyped — so it is selectable and shareable.
 */
export function WebhookSection({ settings }: { settings: WhatsAppSettings | null }) {
  const theme = useTheme();
  const url = settings?.webhookUrl ?? null;

  return (
    <Section title="Webhook" icon="git-pull-request-outline">
      {url ? (
        <>
          <AppText size="sm" tone="muted">
            Give this URL to Meta as the callback for your app:
          </AppText>
          <View
            style={{
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radius.sm + 2,
              padding: theme.spacing.md,
            }}
          >
            <Text
              selectable
              style={{
                ...theme.typography.bodySm,
                color: theme.colors.text,
                fontFamily: MONOSPACE,
              }}
            >
              {url}
            </Text>
          </View>
          <Button
            label="Share URL"
            icon="share-outline"
            size="sm"
            variant="ghost"
            onPress={() => void Share.share({ message: url }).catch(() => undefined)}
            style={{ alignSelf: 'flex-start' }}
          />
        </>
      ) : (
        <AppText size="sm" tone="muted">
          Save the business account id to see the callback URL.
        </AppText>
      )}
      <PillRow>
        <Pill
          label={settings?.hasVerifyToken ? 'Verify token stored' : 'No verify token'}
          tone={settings?.hasVerifyToken ? 'success' : 'warning'}
        />
        <Pill
          label={settings?.hasAppSecret ? 'App secret stored' : 'No app secret'}
          tone={settings?.hasAppSecret ? 'success' : 'warning'}
        />
      </PillRow>
      {settings && !settings.hasAppSecret ? (
        <AppText size="sm" tone="danger">
          Without an app secret every inbound delivery is rejected: the signature is the only thing
          proving a webhook really came from Meta.
        </AppText>
      ) : null}
    </Section>
  );
}
