import type { AdminBrandingView } from '@ashniva/types';
import { Image, View } from 'react-native';

import { mobileEnv } from '../../../config/env';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * Where to load the current logo from. An uploaded logo wins over an external URL, as on the web,
 * and is fetched from the public `/branding/logo` rather than by file id.
 */
function logoSource(view: AdminBrandingView): { uri: string } | null {
  if (view.effective.logoFileId) {
    // The file id busts the image cache when a new logo replaces the old one.
    return { uri: `${mobileEnv.apiBaseUrl}/branding/logo?v=${view.effective.logoFileId}` };
  }
  return view.effective.logoUrl ? { uri: view.effective.logoUrl } : null;
}

/** Product name, logo text and the logo itself. */
export function IdentitySection({
  view,
  productName,
  logoText,
  onProductName,
  onLogoText,
  uploading,
  onUpload,
  onRemoveLogo,
}: {
  view: AdminBrandingView;
  productName: string;
  logoText: string;
  onProductName: (value: string) => void;
  onLogoText: (value: string) => void;
  uploading: boolean;
  onUpload: () => void;
  onRemoveLogo: () => void;
}) {
  const theme = useTheme();
  const source = logoSource(view);

  return (
    <Section title="Identity" icon="business-outline">
      <Field label="Product name" hint="Shown in the sidebar, the tab title and emails">
        <Input accessibilityLabel="Product name" value={productName} onChangeText={onProductName} />
      </Field>
      <Field label="Logo text" hint="Up to four characters, used until a logo is uploaded">
        <Input
          accessibilityLabel="Logo text"
          value={logoText}
          onChangeText={onLogoText}
          maxLength={4}
          autoCorrect={false}
        />
      </Field>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            height: 56,
            justifyContent: 'center',
            overflow: 'hidden',
            width: 56,
          }}
        >
          {source ? (
            <Image
              source={source}
              accessibilityLabel="Current logo"
              resizeMode="contain"
              style={{ height: 48, width: 48 }}
            />
          ) : (
            <AppText weight="bold">{view.effective.logoText}</AppText>
          )}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Button
            label="Upload a logo"
            icon="image-outline"
            size="sm"
            variant="secondary"
            loading={uploading}
            onPress={onUpload}
          />
          {view.stored.logoFileId ? (
            <Button
              label="Remove logo"
              icon="trash-outline"
              size="sm"
              variant="dangerGhost"
              disabled={uploading}
              onPress={onRemoveLogo}
            />
          ) : null}
        </View>
      </View>
    </Section>
  );
}
