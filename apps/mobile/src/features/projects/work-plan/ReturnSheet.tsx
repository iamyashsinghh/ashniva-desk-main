import { VISIBILITY } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import {
  formatBytes,
  pickImage,
  uploadAttachment,
  type PickedFile,
} from '../../../shared/attachments/attachments';
import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { usePointRunner } from './point-runner';

/**
 * "Report error": what is wrong, and optionally the screenshot of it.
 *
 * The screenshot is uploaded first, internal and on the project, then its id is sent with the
 * error — the same order as the web, so it lands under the linked task's comment.
 */
export function ReturnSheet({
  pointId,
  visible,
  onClose,
}: {
  pointId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const runner = usePointRunner();
  const [body, setBody] = useState('');
  const [shot, setShot] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const sending = uploading || runner.returnBusy;

  const close = () => {
    if (sending) {
      return;
    }
    setLocalError(null);
    runner.clearSheetErrors();
    onClose();
  };

  const choose = async () => {
    setLocalError(null);
    try {
      const picked = await pickImage();
      if (picked) {
        setShot(picked);
      }
    } catch (cause) {
      setLocalError(errorMessage(cause));
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text) {
      return;
    }
    setLocalError(null);
    let fileId: string | undefined;
    if (shot) {
      setUploading(true);
      try {
        fileId = (
          await uploadAttachment(shot, { projectId: runner.projectId }, VISIBILITY.INTERNAL)
        ).id;
      } catch (cause) {
        setLocalError(errorMessage(cause));
        return;
      } finally {
        setUploading(false);
      }
    }
    if (await runner.returnPoint(pointId, text, fileId)) {
      setBody('');
      setShot(null);
      onClose();
    }
  };

  const error = localError ?? runner.returnError;

  return (
    <Sheet
      visible={visible}
      title="Report error"
      subtitle="The developer sees this on the task comments. Their leftover time stays paused until they resume."
      onClose={close}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="secondary" disabled={sending} onPress={close} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Send error"
              variant="danger"
              icon="arrow-undo-outline"
              loading={sending}
              disabled={!body.trim()}
              onPress={() => void send()}
            />
          </View>
        </>
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <Field label="What is wrong?" required hint="Posted as an internal task comment.">
        <Input
          multiline
          value={body}
          onChangeText={setBody}
          placeholder="Steps to reproduce, what you expected, what happened"
          style={{ minHeight: 110 }}
        />
      </Field>
      <Field label="Screenshot" hint="Optional. The developer sees it under the comment.">
        {shot ? (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radius.sm,
              flexDirection: 'row',
              gap: theme.spacing.md,
              padding: theme.spacing.sm,
            }}
          >
            <IconTile name="image-outline" tone="info" size={36} />
            <View style={{ flex: 1 }}>
              <AppText size="sm" weight="medium" numberOfLines={1}>
                {shot.name}
              </AppText>
              {shot.sizeBytes !== null ? (
                <AppText size="xs" tone="muted">
                  {formatBytes(shot.sizeBytes)}
                </AppText>
              ) : null}
            </View>
            <Button
              label="Remove"
              variant="ghost"
              size="sm"
              disabled={sending}
              onPress={() => setShot(null)}
            />
          </View>
        ) : (
          <Button
            label="Attach screenshot"
            icon="image-outline"
            variant="secondary"
            disabled={sending}
            onPress={() => void choose()}
          />
        )}
      </Field>
    </Sheet>
  );
}
