import { VISIBILITY, type FileSummary, type Visibility } from '@ashniva/types';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { mobileEnv } from '../../config/env';
import { errorMessage } from '../../shared/api/client';
import {
  attachmentImageSource,
  formatBytes,
  isViewableImage,
  pickDocument,
  pickImage,
  useAccessTokenForImages,
  type PickedFile,
} from '../../shared/attachments/attachments';
import { Banner } from '../../shared/components/feedback';
import { IconTile } from '../../shared/components/Icon';
import { Grow, Section } from '../../shared/components/layout';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Button, Pill } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { uploadCommercialFile, type CommercialFileParent } from './commercial-files';

/**
 * The documents on a contract, or the files on a change request, and adding more.
 *
 * Each file says who can see it, because the same list holds the signed copy the client reads in
 * the portal and the costing sheet they must not. The audience of the next upload is chosen before
 * picking, and starts on "Team only" so a slip keeps a file private rather than publishing it.
 */
export function CommercialFiles({
  files,
  parent,
  canUpload,
  title = 'Files',
  hint,
  onUploaded,
}: {
  files: readonly FileSummary[];
  parent: CommercialFileParent;
  canUpload: boolean;
  title?: string;
  hint?: string;
  onUploaded: () => void;
}) {
  const theme = useTheme();
  const token = useAccessTokenForImages();
  const [visibility, setVisibility] = useState<Visibility>(VISIBILITY.INTERNAL);
  const [busy, setBusy] = useState<'photo' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attach = async (kind: 'photo' | 'file', pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try {
      const file = await pick();
      if (!file) {
        return;
      }
      setBusy(kind);
      await uploadCommercialFile(file, parent, visibility);
      onUploaded();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title={title} count={files.length} icon="attach-outline">
      {hint ? (
        <AppText size="xs" tone="muted">
          {hint}
        </AppText>
      ) : null}
      {files.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing attached yet.
        </AppText>
      ) : null}
      {files.map((file) => (
        <View
          key={file.id}
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            overflow: 'hidden',
          }}
        >
          {isViewableImage(file) ? (
            <Image
              accessibilityLabel={file.name}
              source={attachmentImageSource(file, mobileEnv.apiBaseUrl, token)}
              resizeMode="cover"
              style={{ backgroundColor: theme.colors.surfaceRaised, height: 160, width: '100%' }}
            />
          ) : null}
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.md,
              padding: theme.spacing.md,
            }}
          >
            {isViewableImage(file) ? null : (
              <IconTile name="document-attach-outline" tone="info" size={36} />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <AppText size="sm" weight="medium" numberOfLines={2}>
                {file.name}
              </AppText>
              <AppText size="xs" tone="faint">
                {formatBytes(file.sizeBytes)} · {file.uploadedBy.name} ·{' '}
                {formatDate(file.createdAt)}
              </AppText>
              <View style={{ flexDirection: 'row' }}>
                {file.visibility === VISIBILITY.CLIENT ? (
                  <Pill label="Client sees this" tone="success" />
                ) : (
                  <Pill label="Team only" tone="neutral" />
                )}
              </View>
            </View>
          </View>
        </View>
      ))}

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      {canUpload ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Segmented
            label="Who sees the next file"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: VISIBILITY.INTERNAL, label: 'Team only', icon: 'lock-closed-outline' },
              { value: VISIBILITY.CLIENT, label: 'Client too', icon: 'eye-outline' },
            ]}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Grow>
              <Button
                label="Attach a photo"
                variant="secondary"
                icon="camera-outline"
                loading={busy === 'photo'}
                disabled={busy !== null}
                onPress={() => void attach('photo', pickImage)}
              />
            </Grow>
            <Grow>
              <Button
                label="Attach a file"
                variant="secondary"
                icon="attach"
                loading={busy === 'file'}
                disabled={busy !== null}
                onPress={() => void attach('file', pickDocument)}
              />
            </Grow>
          </View>
        </View>
      ) : null}
    </Section>
  );
}
