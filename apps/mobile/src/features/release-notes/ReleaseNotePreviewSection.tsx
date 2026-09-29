import type { ReleaseNoteDetail } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../shared/components/layout';
import { AppText, Pill } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { lineLabel } from './release-note-display';

/**
 * What the client will read, built with the portal mapper's two rules: lines not marked
 * client-visible are dropped, and the client wording wins over the internal one. A reviewer sees
 * the document before it goes out rather than guessing.
 */
export function ReleaseNotePreviewSection({ note }: { note: ReleaseNoteDetail }) {
  const theme = useTheme();
  const visible = note.items.filter((item) => item.clientVisible);
  const hidden = note.items.length - visible.length;

  return (
    <Section
      title="Client preview"
      icon="eye-outline"
      action={<Pill label="The client sees this" tone="success" />}
    >
      <AppText weight="bold">{note.version}</AppText>
      {note.clientSummary ? <AppText size="sm">{note.clientSummary}</AppText> : null}
      {visible.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing here yet — a note with no client-visible line cannot be published.
        </AppText>
      ) : (
        <View style={{ gap: theme.spacing.xs }}>
          {visible.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <AppText size="sm" tone="muted">
                •
              </AppText>
              <AppText size="sm" style={{ flex: 1 }}>
                {lineLabel(item)}
              </AppText>
            </View>
          ))}
        </View>
      )}
      {hidden > 0 ? (
        <AppText size="xs" tone="faint">
          {hidden === 1
            ? '1 internal line is hidden from this view.'
            : `${hidden} internal lines are hidden from this view.`}
        </AppText>
      ) : null}
    </Section>
  );
}
