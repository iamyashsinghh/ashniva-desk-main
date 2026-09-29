import type { ReleaseSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatSince } from '../../shared/format/format';
import { ENVIRONMENT_LABELS, releaseStatusLabel, releaseTone } from './release-display';

/** One release in the list: which project, which version, and where it has got to. */
export function ReleaseRow({ release, onOpen }: { release: ReleaseSummary; onOpen: () => void }) {
  const status = releaseStatusLabel(release.status);
  const tone = releaseTone(release.status);

  return (
    <PressableCard
      onPress={onOpen}
      icon="rocket-outline"
      iconTone={tone === 'danger' ? 'danger' : 'violet'}
      accessibilityLabel={`${release.projectName}, ${release.version} — ${release.title}, ${status}`}
    >
      <AppText variant="label" tone="muted" uppercase numberOfLines={1}>
        {release.projectName}
      </AppText>
      <AppText weight="bold" numberOfLines={2}>
        {release.version} — {release.title}
      </AppText>
      <PillRow>
        <Pill label={status} tone={tone} />
        <Pill label={ENVIRONMENT_LABELS[release.environment]} />
      </PillRow>
      <MetaLine icon="layers-outline">{whenLine(release)}</MetaLine>
    </PressableCard>
  );
}

function whenLine(release: ReleaseSummary): string {
  const items = `${release.itemCount} item${release.itemCount === 1 ? '' : 's'}`;
  if (release.publishedAt) {
    return `${items} · published ${formatSince(release.publishedAt)}`;
  }
  if (release.scheduledFor) {
    return `${items} · planned for ${formatDate(release.scheduledFor)}`;
  }
  return `${items} · updated ${formatSince(release.updatedAt)}`;
}
