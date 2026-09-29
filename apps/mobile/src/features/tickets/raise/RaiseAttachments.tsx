import type { FileSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import {
  formatBytes,
  pickDocument,
  pickImage,
  uploadAttachment,
  UNPARENTED,
  type PickedFile,
} from '../../../shared/attachments/attachments';
import { ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Grow, Section } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { RAISE_LIMITS } from './raise-form';

/**
 * Screenshots and files for a ticket that does not exist yet.
 *
 * Each file is uploaded as soon as it is picked, unparented, and the new ticket adopts them by id
 * — the same two steps the web form takes — so a slow upload shows up here rather than as a
 * failed "Raise".
 */
export function RaiseAttachments({
  files,
  onChange,
}: {
  files: readonly FileSummary[];
  onChange: (files: FileSummary[]) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState<'photo' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = files.length >= RAISE_LIMITS.files;

  const attach = async (kind: 'photo' | 'file', pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try {
      const picked = await pick();
      if (!picked) {
        return;
      }
      setBusy(kind);
      const uploaded = await uploadAttachment(picked, UNPARENTED);
      onChange([...files, uploaded]);
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
          A screenshot of the problem saves a round of questions.
        </AppText>
      ) : null}
      {files.map((file) => (
        <ListRow
          key={file.id}
          icon={file.contentType.startsWith('image/') ? 'image-outline' : 'document-text-outline'}
          iconTone="info"
          title={file.name}
          subtitle={formatBytes(file.sizeBytes)}
          trailing={
            <Button
              label="Remove"
              size="sm"
              variant="dangerGhost"
              onPress={() => onChange(files.filter((other) => other.id !== file.id))}
            />
          }
        />
      ))}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Grow>
          <Button
            label="Add a photo"
            variant="secondary"
            icon="camera-outline"
            loading={busy === 'photo'}
            disabled={busy !== null || full}
            onPress={() => void attach('photo', pickImage)}
          />
        </Grow>
        <Grow>
          <Button
            label="Add a file"
            variant="secondary"
            icon="attach"
            loading={busy === 'file'}
            disabled={busy !== null || full}
            onPress={() => void attach('file', pickDocument)}
          />
        </Grow>
      </View>
      {full ? (
        <AppText size="xs" tone="faint">
          Up to {RAISE_LIMITS.files} attachments per ticket.
        </AppText>
      ) : null}
    </Section>
  );
}
