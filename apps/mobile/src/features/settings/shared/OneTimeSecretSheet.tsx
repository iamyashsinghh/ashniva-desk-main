import type { ReactNode } from 'react';
import { Platform, Share, Text, View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * The only place a freshly minted secret is ever shown — a machine credential, a callback signing
 * secret.
 *
 * It says so plainly, as the web's dialog does, because nothing can display it again. The value
 * is selectable, and "Share" hands it to the system sheet (which offers Copy) rather than this app
 * holding a clipboard dependency: the secret leaves the screen only when somebody sends it
 * somewhere on purpose. It is never put in the query cache.
 */
export function OneTimeSecretSheet({
  title,
  secret,
  warning,
  children,
  onClose,
}: {
  title: string;
  secret: string;
  warning: string;
  /** How to use it: which header, which endpoint. */
  children?: ReactNode;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button
            label="Share"
            icon="share-outline"
            variant="secondary"
            onPress={() => void Share.share({ message: secret }).catch(() => undefined)}
            style={{ flex: 1 }}
          />
          <Button label="I have saved it" icon="checkmark" onPress={onClose} style={{ flex: 1 }} />
        </>
      }
    >
      <Banner tone="danger" role="alert">
        {warning}
      </Banner>
      {children}
      <View
        style={{
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.sm + 2,
          padding: theme.spacing.md,
        }}
      >
        <Text
          selectable
          accessibilityLabel="The secret"
          style={{ ...theme.typography.bodySm, color: theme.colors.text, fontFamily: MONOSPACE }}
        >
          {secret}
        </Text>
      </View>
    </Sheet>
  );
}
