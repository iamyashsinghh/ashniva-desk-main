import { VISIBILITY, type FileSummary } from '@ashniva/types';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import {
  attachmentImageSource,
  formatBytes,
  isViewableImage,
  pickDocument,
  pickImage,
  uploadAttachment,
  useAccessTokenForImages,
  type PickedFile,
} from '../../shared/attachments/attachments';
import { Banner } from '../../shared/components/feedback';
import { Grow, Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { mobileEnv } from '../../config/env';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A task's attachments: what is there, and adding one.
 *
 * Images are shown rather than listed. The overwhelmingly common attachment on a phone is a
 * screenshot of the thing that is wrong, and a filename is not a screenshot. `GET
 * /files/:id/download` streams through the API after its access checks, so the request carries
 * the bearer token — React Native's `Image` takes headers for exactly this, and no signed URL or
 * public bucket path is involved. The token is subscribed to rather than read once: an image
 * request is outside the API client and cannot take its retry path, so a picture whose token
 * expired mid-scroll would otherwise stay broken until the screen was remounted.
 *
 * Anything that is not an image is a row with its name and size. Opening a PDF or a log would
 * mean writing it to the device and handing it to another app, which is a decision about where a
 * client's file ends up; that belongs on the web app until somebody has taken it deliberately.
 *
 * New attachments are internal. Client visibility is a decision taken with the client's reading
 * of it in mind, and the phone is not where that judgement is made.
 */
export function TaskAttachments({
  taskId,
  files,
  onUploaded,
}: {
  taskId: string;
  files: readonly FileSummary[];
  onUploaded: () => void;
}) {
  const theme = useTheme();
  const token = useAccessTokenForImages();
  // Which of the two buttons started the upload, so only that one spins; both stay disabled.
  const [busy, setBusy] = useState<'photo' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attach = async (kind: 'photo' | 'file', pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try {
      // Null and a throw are different answers and are treated differently. Null is the person
      // cancelling or refusing access, which is an ordinary thing to do and not worth a message.
      // A throw is the picker itself failing — a native module error, an OS refusal — and
      // swallowing that leaves somebody tapping a button that appears to do nothing.
      const file = await pick();
      if (!file) {
        return;
      }
      setBusy(kind);
      await uploadAttachment(file, { taskId }, VISIBILITY.INTERNAL);
      onUploaded();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title={`Attachments (${files.length})`}>
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
            gap: theme.spacing.sm,
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
              gap: 2,
              paddingBottom: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              paddingTop: isViewableImage(file) ? 0 : theme.spacing.md,
            }}
          >
            <AppText size="sm" weight="medium" numberOfLines={1}>
              {file.name}
            </AppText>
            <AppText size="xs" tone="faint">
              {formatBytes(file.sizeBytes)} · {file.uploadedBy.name}
              {file.visibility === VISIBILITY.CLIENT ? ' · the client sees this' : ''}
            </AppText>
            {isViewableImage(file) ? null : (
              <AppText size="xs" tone="muted">
                Open this one on the web app.
              </AppText>
            )}
          </View>
        </View>
      ))}

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Grow>
          <Button
            label="Attach a photo"
            variant="secondary"
            icon="plus"
            loading={busy === 'photo'}
            disabled={busy !== null}
            accessibilityHint="Adds a picture from your library as an internal attachment"
            onPress={() => void attach('photo', pickImage)}
          />
        </Grow>
        <Grow>
          <Button
            label="Attach a file"
            variant="secondary"
            icon="plus"
            loading={busy === 'file'}
            disabled={busy !== null}
            accessibilityHint="Adds a document as an internal attachment"
            onPress={() => void attach('file', pickDocument)}
          />
        </Grow>
      </View>
    </Section>
  );
}
