import {
  resolveThemeDocument,
  THEME_DOCUMENT_VERSION,
  type AdminBrandingView,
  type BrandingUpdate,
  type ResolvedThemeDocument,
} from '@ashniva/types';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@ashniva/ui';
import { useState, type ChangeEvent } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { brandingLogoSrc, useAdminBrandingQuery, useBrandingMutations } from '../api';
import { ThemeColorFields } from '../components/ThemeColorFields';
import { ThemeShapeFields } from '../components/ThemeShapeFields';
import { ThemeSourceCard } from '../components/ThemeSourceCard';

import '../branding.css';

/** Product name, logo and theme tokens for this organization. */
export function BrandingSettingsPage() {
  const query = useAdminBrandingQuery();

  return (
    <div className="branding-page">
      <PageHeader
        title="Branding"
        subtitle="What this organization is called, and the design tokens every screen is built from"
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? <Loaded key={query.dataUpdatedAt} view={query.data} /> : null}
      </QueryState>
    </div>
  );
}

function Loaded({ view }: { view: AdminBrandingView }) {
  const { save, uploadLogo } = useBrandingMutations();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [productName, setProductName] = useState(view.effective.productName);
  const [logoText, setLogoText] = useState(view.effective.logoText);
  const [theme, setTheme] = useState<ResolvedThemeDocument>(view.effective.theme);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(success);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const onSave = () =>
    void run(
      () =>
        save.mutateAsync({
          productName: productName.trim(),
          logoText: logoText.trim(),
          // The whole document, not a diff: what the form shows is what the tenant is choosing,
          // and the API resolves anything it does not mention against the built-in defaults.
          theme: { ...theme, version: THEME_DOCUMENT_VERSION },
        } satisfies BrandingUpdate),
      'Branding saved. Reload to see it applied everywhere.',
    );

  const onPickLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void run(() => uploadLogo.mutateAsync(file), 'Logo uploaded.');
    }
  };

  const onReset = () =>
    void run(
      () => save.mutateAsync({ theme: { version: THEME_DOCUMENT_VERSION } }),
      'Theme reset to the Ashniva Desk defaults.',
    );

  const logoSrc = brandingLogoSrc(view.effective);

  return (
    <>
      <Card title="Identity">
        <div className="branding-identity">
          <FormField label="Product name" hint="Shown in the sidebar, the tab title and emails">
            <Input value={productName} onChange={(event) => setProductName(event.target.value)} />
          </FormField>
          <FormField label="Logo text" hint="Up to four characters, used until a logo is uploaded">
            <Input
              maxLength={4}
              value={logoText}
              onChange={(event) => setLogoText(event.target.value)}
            />
          </FormField>
        </div>
        <div className="branding-logo">
          <span className="branding-logo__preview">
            {logoSrc ? <img src={logoSrc} alt="Current logo" /> : view.effective.logoText}
          </span>
          <label className="ui-button ui-button--secondary">
            {uploadLogo.isPending ? 'Uploading…' : 'Upload a logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onPickLogo}
            />
          </label>
          {view.stored.logoFileId ? (
            <Button
              variant="ghost"
              onClick={() =>
                void run(() => save.mutateAsync({ logoFileId: null }), 'Logo removed.')
              }
            >
              Remove logo
            </Button>
          ) : null}
        </div>
      </Card>

      <Card
        title="Colours"
        headerAddon={
          <Button variant="ghost" onClick={onReset}>
            Reset to defaults
          </Button>
        }
      >
        <ThemeColorFields
          colors={theme.colors}
          onChange={(key, value) =>
            setTheme({ ...theme, colors: { ...theme.colors, [key]: value } })
          }
        />
      </Card>

      <Card title="Shape and type">
        <ThemeShapeFields
          theme={theme}
          onChange={(change) =>
            setTheme(
              resolveThemeDocument(theme, {
                version: THEME_DOCUMENT_VERSION,
                [change.family]: { [change.key]: change.value },
              }),
            )
          }
        />
        <div className="detail-actions">
          <Button loading={save.isPending} onClick={onSave}>
            Save branding
          </Button>
        </div>
        {notice ? <p className="branding-notice">{notice}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Card>

      <ThemeSourceCard readiness={view.themeSource} />
    </>
  );
}
