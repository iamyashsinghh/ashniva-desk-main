import type { FileSummary } from '@ashniva/types';
import { Image, View } from 'react-native';

import { mobileEnv } from '../../config/env';
import {
  attachmentImageSource,
  formatBytes,
  isViewableImage,
  useAccessTokenForImages,
} from '../../shared/attachments/attachments';
import { IconTile } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Files the team shared with the client, read-only.
 *
 * Pictures are shown, because they are what a phone can usefully display; anything else is a row
 * with its name, size and age, as on the approval and ticket screens. Every portal response
 * carries client-visible files only, so there is nothing to filter here.
 */
export function PortalFileList({
  files,
  emptyText = 'No files shared yet.',
}: {
  files: readonly FileSummary[];
  emptyText?: string;
}) {
  const theme = useTheme();
  const token = useAccessTokenForImages();

  if (files.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        {emptyText}
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {files.map((file) => {
        const image = isViewableImage(file);
        return (
          <View
            key={file.id}
            style={{
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radius.md,
              overflow: 'hidden',
            }}
          >
            {image ? (
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
              {image ? null : <IconTile name="document-attach-outline" tone="info" size={36} />}
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <AppText size="sm" weight="medium" numberOfLines={2}>
                  {file.name}
                </AppText>
                {file.caption ? (
                  <AppText size="xs" tone="muted">
                    {file.caption}
                  </AppText>
                ) : null}
                <AppText size="xs" tone="faint">
                  {formatBytes(file.sizeBytes)}
                  {file.createdAt ? ` · ${formatSince(file.createdAt)}` : ''}
                </AppText>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
