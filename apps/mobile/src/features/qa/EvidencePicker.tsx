import { VISIBILITY, type FileSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import {
  formatBytes,
  pickDocument,
  pickImage,
  uploadAttachment,
  type AttachmentTarget,
  type PickedFile,
} from '../../shared/attachments/attachments';
import { Banner } from '../../shared/components/feedback';
import { ListRow } from '../../shared/components/data-display';
import { Grow } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A screenshot or log for a test result.
 *
 * It is uploaded as an internal file on the work the assignment is about — the same upload path
 * and rules as every other attachment — and the result carries only its id. Internal, always:
 * evidence of a failure is for the developer, never for a client reading the task.
 */
export function EvidencePicker({
  target,
  file,
  onChange,
}: {
  target: AttachmentTarget;
  file: FileSummary | null;
  onChange: (file: FileSummary | null) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState<'photo' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attach = async (kind: 'photo' | 'file', pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try {
      const picked = await pick();
      if (!picked) {
        return;
      }
      setBusy(kind);
      onChange(await uploadAttachment(picked, target, VISIBILITY.INTERNAL));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText size="sm" weight="medium">
        Evidence
      </AppText>
      <AppText size="xs" tone="muted">
        A screenshot or log, attached to the work as an internal file.
      </AppText>
      {file ? (
        <ListRow
          title={file.name}
          subtitle={formatBytes(file.sizeBytes)}
          icon="document-attach-outline"
          iconTone="info"
          trailing={
            <Button
              label="Remove"
              size="sm"
              variant="ghost"
              accessibilityHint="Leaves the file on the work but takes it off this result"
              onPress={() => onChange(null)}
            />
          }
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Grow>
            <Button
              label="Attach a screenshot"
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
      )}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </View>
  );
}
