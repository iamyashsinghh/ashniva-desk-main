import { VISIBILITY, type FileSummary, type Visibility } from '@ashniva/types';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { mobileEnv } from '../../../config/env';
import { errorMessage } from '../../../shared/api/client';
import {
  attachmentImageSource,
  formatBytes,
  isViewableImage,
  pickDocument,
  pickImage,
  uploadAttachment,
  useAccessTokenForImages,
  type PickedFile,
} from '../../../shared/attachments/attachments';
import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { Grow, Section } from '../../../shared/components/layout';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText, Button } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

const audienceNote = (file: FileSummary) =>
  file.visibility === VISIBILITY.CLIENT ? ' · the client sees this' : ' · internal';

/**
 * A ticket's attachments, and adding one.
 *
 * Staff who may write internal notes choose who sees a new file, starting from internal — the
 * safe default everywhere in this system. Everybody else uploads with the client-visible flag;
 * for a client the API sets it regardless, since anything a client attaches is theirs to see.
 */
export function TicketFiles({
  ticketId,
  files,
  canUpload,
  chooseVisibility,
  onUploaded,
}: {
  ticketId: string;
  files: readonly FileSummary[];
  canUpload: boolean;
  chooseVisibility: boolean;
  onUploaded: () => void;
}) {
  const theme = useTheme();
  const token = useAccessTokenForImages();
  const [visibility, setVisibility] = useState<Visibility>(VISIBILITY.INTERNAL);
  const [busy, setBusy] = useState<'photo' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0 && !canUpload) {
    return null;
  }

  const attach = async (kind: 'photo' | 'file', pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try {
      const file = await pick();
      if (!file) {
        return;
      }
      setBusy(kind);
      await uploadAttachment(file, { ticketId }, chooseVisibility ? visibility : VISIBILITY.CLIENT);
      onUploaded();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Attachments" count={files.length} icon="attach">
      {files.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing attached.
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
              <IconTile name="document-text-outline" tone="info" size={40} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium" numberOfLines={1}>
                {file.name}
              </AppText>
              <AppText size="xs" tone="faint">
                {formatBytes(file.sizeBytes)} · {file.uploadedBy.name}
                {chooseVisibility ? audienceNote(file) : ''}
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
          {chooseVisibility ? (
            <Segmented
              label="Who sees the next attachment"
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: VISIBILITY.INTERNAL, label: 'Team only', icon: 'lock-closed-outline' },
                { value: VISIBILITY.CLIENT, label: 'Client too', icon: 'eye-outline' },
              ]}
            />
          ) : null}
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
