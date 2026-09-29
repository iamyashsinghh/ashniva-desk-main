import type { ReleaseNoteSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatSince } from '../../shared/format/format';
import { releaseNoteStatusLabel, releaseNoteTone } from './release-note-display';

/** One note in the list: which project, which version, and where it is in review. */
export function ReleaseNoteRow({ note, onOpen }: { note: ReleaseNoteSummary; onOpen: () => void }) {
  const status = releaseNoteStatusLabel(note.status);
  const lines = `${note.itemCount} line${note.itemCount === 1 ? '' : 's'}`;

  return (
    <PressableCard
      onPress={onOpen}
      icon="document-text-outline"
      iconTone="teal"
      accessibilityLabel={`${note.projectCode} ${note.version}, ${status}`}
    >
      <AppText variant="label" tone="muted" uppercase numberOfLines={1}>
        {note.projectCode}
      </AppText>
      <AppText weight="bold" numberOfLines={1}>
        {note.version}
      </AppText>
      <PillRow>
        <Pill label={status} tone={releaseNoteTone(note.status)} />
      </PillRow>
      <MetaLine icon="calendar-outline">
        {`Released ${formatDate(note.releaseDate) ?? '—'} · ${lines} · ${
          note.publishedAt
            ? `published ${formatSince(note.publishedAt)}`
            : `updated ${formatSince(note.updatedAt)}`
        }`}
      </MetaLine>
    </PressableCard>
  );
}
