import type { ApprovalHistoryEntry, FileSummary } from '@ashniva/types';
import { View } from 'react-native';

import { AppText, Card, Divider } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { approvalStatusLabel } from './approval-display';

/**
 * The trail behind a request, and what is attached to it.
 *
 * Both halves are rendered from whatever the API sent. The provider's DTO and the client's carry
 * the same two field names and deliberately not the same rows — the client's history is built by
 * an allow-list mapper — so one component can draw both without either audience learning what the
 * other was told.
 */

export function ApprovalHistoryCard({ history }: { history: readonly ApprovalHistoryEntry[] }) {
  const theme = useTheme();

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        History
      </AppText>
      {history.length === 0 ? (
        <AppText tone="muted">Nothing has happened to this request yet.</AppText>
      ) : (
        history.map((entry) => (
          <View key={entry.id} style={{ gap: theme.spacing.xs }}>
            <Divider />
            <AppText size="xs" tone="faint">
              {entry.actor.name} · {formatDateTime(entry.createdAt)}
            </AppText>
            <AppText size="sm" weight="medium">
              {approvalStatusLabel(entry.toStatus)}
            </AppText>
            {entry.comment ? <AppText size="sm">{entry.comment}</AppText> : null}
          </View>
        ))
      )}
    </Card>
  );
}

/**
 * Attachments, listed rather than opened.
 *
 * Downloading a client's file onto the device and handing it to another app is a decision this
 * app has not taken — see the README. Naming the files is still worth doing: somebody deciding on
 * a request needs to know a signed document is attached even if they will open it at a desk.
 */
export function ApprovalFilesCard({ files }: { files: readonly FileSummary[] }) {
  const theme = useTheme();

  if (files.length === 0) {
    return null;
  }

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Attached ({files.length})
      </AppText>
      {files.map((file) => (
        <View key={file.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText size="sm">{file.name}</AppText>
          <AppText size="xs" tone="faint">
            {Math.max(1, Math.round(file.sizeBytes / 1024))} KB · open it on the web app
          </AppText>
        </View>
      ))}
    </Card>
  );
}
