import { PRIORITY_LABELS, PROBLEM_STATUS_LABELS, type ProblemDetail } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Hero } from '../../../shared/components/layout';
import { Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatDateTime, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import {
  PROBLEM_INTERNAL_NOTE,
  problemTone,
  reportedByLabel,
  SEVERITY_ICON_TONE,
  SEVERITY_TONE,
} from '../problem-display';

/** The top of a problem: what it is, where it stands, and how many separate clients hit it. */
export function ProblemHero({ problem }: { problem: ProblemDetail }) {
  const theme = useTheme();
  return (
    <>
      <Hero
        overline={`${problem.key} · ${PROBLEM_INTERNAL_NOTE}`}
        title={problem.title}
        icon="bug-outline"
        iconTone={SEVERITY_ICON_TONE[problem.severity]}
      >
        <PillRow>
          <Pill label={PROBLEM_STATUS_LABELS[problem.status]} tone={problemTone(problem.status)} />
          <Pill label={PRIORITY_LABELS[problem.severity]} tone={SEVERITY_TONE[problem.severity]} />
          {problem.module ? <Pill label={problem.module} /> : null}
        </PillRow>
        <View style={{ gap: theme.spacing.xs }}>
          {problem.project ? (
            <MetaLine icon="folder-open-outline">
              {problem.project.name}
              {problem.product ? ` · ${problem.product.name}` : ''}
            </MetaLine>
          ) : null}
          <MetaLine icon="person-outline">
            {problem.owner ? `Owned by ${problem.owner.name}` : 'No owner yet'}
          </MetaLine>
          {problem.rcaDueDate ? (
            <MetaLine icon="calendar-outline">RCA due {formatDate(problem.rcaDueDate)}</MetaLine>
          ) : null}
          <MetaLine icon="time-outline">
            Opened {formatSince(problem.createdAt)}
            {problem.createdBy ? ` by ${problem.createdBy.name}` : ''}
          </MetaLine>
        </View>
      </Hero>
      <Banner tone={problem.thresholdHitAt ? 'danger' : 'info'}>
        {`${reportedByLabel(problem.clientCount, problem.versions)}${
          problem.thresholdHitAt
            ? ` · threshold crossed ${formatDateTime(problem.thresholdHitAt) ?? ''}`
            : ''
        }`}
      </Banner>
    </>
  );
}
