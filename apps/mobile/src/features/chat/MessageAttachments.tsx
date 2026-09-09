import type { FileSummary } from '@ashniva/types';
import { Image, StyleSheet, View } from 'react-native';

import { mobileEnv } from '../../config/env';
import { AppText } from '../../shared/components/primitives';
import {
  attachmentImageSource,
  formatBytes,
  isViewableImage,
  useAccessTokenForImages,
} from '../../shared/attachments/attachments';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What came with a message.
 *
 * Pictures are shown and everything else is a row with its name and size, for the same reason the
 * task screens do it: the common attachment on a phone is a screenshot, and a filename is not one.
 *
 * `GET /files/:id/download` streams through the API after its access checks, so `Image` is handed
 * the bearer token as a header — there is no signed URL and no public bucket path. The token is
 * subscribed to rather than read once, because an image request happens outside the API client and
 * cannot take its retry path: a picture whose token expired mid-scroll would stay broken until the
 * screen was remounted.
 *
 * Opening a non-image is deliberately absent here as everywhere else on the phone: it would mean
 * writing a client's file to the device and handing it to another app.
 */
export function MessageAttachments({ files }: { files: readonly FileSummary[] }) {
  const theme = useTheme();
  const token = useAccessTokenForImages();

  if (files.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {files.map((file) =>
        isViewableImage(file) ? (
          <Image
            key={file.id}
            accessibilityLabel={file.name}
            accessible
            source={attachmentImageSource(file, mobileEnv.apiBaseUrl, token)}
            resizeMode="cover"
            style={{
              backgroundColor: theme.colors.pillBackground,
              borderRadius: theme.radius.sm,
              height: 160,
              width: '100%',
            }}
          />
        ) : (
          <View
            key={file.id}
            style={{
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
              borderWidth: StyleSheet.hairlineWidth,
              padding: theme.spacing.sm,
            }}
          >
            <AppText size="sm" numberOfLines={1}>
              {file.name}
            </AppText>
            <AppText size="xs" tone="faint">
              {formatBytes(file.sizeBytes)}
            </AppText>
          </View>
        ),
      )}
    </View>
  );
}
