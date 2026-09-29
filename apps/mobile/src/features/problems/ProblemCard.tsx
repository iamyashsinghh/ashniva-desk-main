import {
  PRIORITY_LABELS,
  PROBLEM_STATUS,
  PROBLEM_STATUS_LABELS,
  type ProblemSummary,
} from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { problemTone, SEVERITY_ICON_TONE, SEVERITY_TONE } from './problem-display';

/**
 * One problem in the list.
 *
 * The client count leads, counted in companies rather than tickets — it is the number the whole
 * feature exists to show — and turns red once the duplicate threshold has been crossed.
 */
export function ProblemCard({
  problem,
  onPress,
}: {
  problem: ProblemSummary;
  onPress: () => void;
}) {
  const clients = `${problem.clientCount} ${problem.clientCount === 1 ? 'client' : 'clients'}`;
  return (
    <PressableCard
      accessibilityLabel={`${problem.key} ${problem.title}`}
      accessibilityHint="Opens the problem"
      onPress={onPress}
      icon="bug-outline"
      iconTone={SEVERITY_ICON_TONE[problem.severity]}
      highlight={Boolean(problem.thresholdHitAt) && problem.status === PROBLEM_STATUS.OPEN}
    >
      <MetaLine icon="pricetag-outline">
        {problem.key}
        {problem.module ? ` · ${problem.module}` : ''}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {problem.title}
      </AppText>
      <PillRow>
        <Pill label={PROBLEM_STATUS_LABELS[problem.status]} tone={problemTone(problem.status)} />
        <Pill label={PRIORITY_LABELS[problem.severity]} tone={SEVERITY_TONE[problem.severity]} />
        <Pill label={clients} tone={problem.thresholdHitAt ? 'danger' : 'neutral'} />
      </PillRow>
      <MetaLine icon="ticket-outline">
        {problem.ticketCount} {problem.ticketCount === 1 ? 'ticket' : 'tickets'}
        {problem.versions.length > 0 ? ` · ${problem.versions.join(', ')}` : ''}
        {` · updated ${formatSince(problem.updatedAt) ?? ''}`}
      </MetaLine>
      {problem.owner ? <MetaLine icon="person-outline">{problem.owner.name}</MetaLine> : null}
    </PressableCard>
  );
}
