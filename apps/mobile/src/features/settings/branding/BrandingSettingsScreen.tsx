import {
  PERMISSIONS,
  resolveThemeDocument,
  THEME_DOCUMENT_VERSION,
  type AdminBrandingView,
  type BrandingUpdate,
  type ResolvedThemeDocument,
} from '@ashniva/types';
import { useState } from 'react';

import { errorMessage } from '../../../shared/api/client';
import { pickImage } from '../../../shared/attachments/attachments';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { Button } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import {
  FeedbackBanner,
  NoAccess,
  resourceGate,
  SettingsScroll,
  type Feedback,
} from '../shared/SettingsLayout';
import { uploadLogoFile, useAdminBranding, useSaveBranding } from './api';
import { IdentitySection } from './IdentitySection';
import { ColorFields, ShapeFields } from './ThemeFields';
import { ThemeSourceSection } from './ThemeSourceSection';

/**
 * Admin → Branding: what this organization is called, and the tokens every screen is built from.
 *
 * Behind `branding:manage`. The form is seeded from what is in effect and re-seeded after each of
 * this screen's own saves — a reset or a new logo changes what is in effect — but not on a
 * background refetch, which would otherwise throw away somebody's half-finished edits the moment
 * they came back from the photo picker.
 */
export function BrandingSettingsScreen() {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.BRANDING_MANAGE);
  const query = useAdminBranding(canManage);
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  if (!canManage) {
    return <NoAccess description="Branding needs the branding permission." />;
  }
  const gate = resourceGate(query, 'Loading branding');
  if (gate || !query.data) {
    return gate;
  }
  return (
    <BrandingForm
      key={version}
      view={query.data}
      feedback={feedback}
      onFeedback={setFeedback}
      onSaved={(message) => {
        setFeedback({ tone: 'success', message });
        setVersion((current) => current + 1);
      }}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}

function BrandingForm({
  view,
  feedback,
  onFeedback,
  onSaved,
  refreshing,
  onRefresh,
}: {
  view: AdminBrandingView;
  feedback: Feedback | null;
  onFeedback: (feedback: Feedback | null) => void;
  onSaved: (message: string) => void;
  refreshing: boolean;
  onRefresh: () => unknown;
}) {
  const save = useSaveBranding();
  const [productName, setProductName] = useState(view.effective.productName);
  const [logoText, setLogoText] = useState(view.effective.logoText);
  const [theme, setTheme] = useState<ResolvedThemeDocument>(view.effective.theme);
  const [uploading, setUploading] = useState(false);

  const write = async (update: BrandingUpdate, success: string) => {
    onFeedback(null);
    if (await save.run(update)) {
      onSaved(success);
    }
  };

  const upload = async () => {
    const picked = await pickImage();
    if (!picked) {
      return;
    }
    onFeedback(null);
    setUploading(true);
    let logoFileId: string;
    try {
      logoFileId = await uploadLogoFile(picked);
    } catch (cause) {
      setUploading(false);
      onFeedback({ tone: 'danger', message: errorMessage(cause) });
      return;
    }
    setUploading(false);
    await write({ logoFileId }, 'Logo uploaded.');
  };

  return (
    <SettingsScroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          label="Save branding"
          icon="checkmark"
          loading={save.busy}
          disabled={uploading || !productName.trim() || !logoText.trim()}
          onPress={() =>
            void write(
              {
                productName: productName.trim(),
                logoText: logoText.trim(),
                // The whole document, not a diff: what the form shows is what the tenant chose.
                theme: { ...theme, version: THEME_DOCUMENT_VERSION },
              },
              'Branding saved.',
            )
          }
          style={{ flex: 1 }}
        />
      }
    >
      <FeedbackBanner feedback={feedback} />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
      <IdentitySection
        view={view}
        productName={productName}
        logoText={logoText}
        onProductName={setProductName}
        onLogoText={setLogoText}
        uploading={uploading}
        onUpload={() => void upload()}
        onRemoveLogo={() => void write({ logoFileId: null }, 'Logo removed.')}
      />
      <Section
        title="Colours"
        icon="color-fill-outline"
        action={
          <Button
            label="Reset to defaults"
            size="sm"
            variant="ghost"
            accessibilityHint="Replaces the whole theme with the Ashniva Desk defaults"
            onPress={() =>
              void write(
                { theme: { version: THEME_DOCUMENT_VERSION } },
                'Theme reset to the Ashniva Desk defaults.',
              )
            }
          />
        }
      >
        <ColorFields
          colors={theme.colors}
          onChange={(key, value) =>
            setTheme((current) => ({ ...current, colors: { ...current.colors, [key]: value } }))
          }
        />
      </Section>
      <Section title="Shape and type" icon="shapes-outline" collapsible initiallyOpen={false}>
        <ShapeFields
          theme={theme}
          onChange={(change) =>
            setTheme((current) =>
              resolveThemeDocument(current, {
                version: THEME_DOCUMENT_VERSION,
                [change.family]: { [change.key]: change.value },
              }),
            )
          }
        />
      </Section>
      <ThemeSourceSection readiness={view.themeSource} />
    </SettingsScroll>
  );
}
