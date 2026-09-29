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
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { uploadApprovalFile } from './approval-files';

/**
 * What is attached to a request, and — while it is still a draft — attaching more.
 *
 * Pictures are shown, because the attachment people add from a phone is a screenshot; anything
 * else is a row with its name and size, for the reason the README gives. The client's DTO carries
 * only client-visible files, so the same component draws both sides; only the provider is told
 * which audience each file has, and only the provider may upload.
 */
export function ApprovalFiles({
  files,
  approvalId,
  canUpload = false,
  showAudience = false,
  onUploaded,
}: {
  files: readonly FileSummary[];
  approvalId: string;
  canUpload?: boolean;
  showAudience?: boolean;
  onUploaded?: () => void;
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
      await uploadApprovalFile(file, approvalId, visibility);
      onUploaded?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Files" count={files.length} icon="attach-outline">
      {files.length === 0 ? (
        <AppText size="sm" tone="muted">
          No files attached.
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
              style={{ backgroundColor: theme.colors.surfaceRaised, height: 180, width: '100%' }}
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
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium" numberOfLines={2}>
                {file.name}
              </AppText>
              <AppText size="xs" tone="faint">
                {formatBytes(file.sizeBytes)}
                {showAudience ? audienceNote(file) : ''}
              </AppText>
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

function audienceNote(file: FileSummary): string {
  return file.visibility === VISIBILITY.CLIENT ? ' · the client sees this' : ' · team only';
}
