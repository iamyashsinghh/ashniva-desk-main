import { APPROVAL_STATUS, type PortalApprovalSummary } from '@ashniva/types';
import { SectionList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { PressableCard, SectionHeader } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  approvalStatusIcon,
  approvalStatusLabel,
  approvalTone,
  splitPortalApprovals,
  subjectLine,
} from './approval-display';

/**
 * What a client has been asked to approve, in the portal's two halves: what is waiting for them,
 * then everything already answered.
 *
 * `GET /portal/approvals` returns one list rather than a page — it is scoped to the caller's own
 * organization and to requests that were actually published, which is a handful, not a backlog.
 * So there is no paging here; there is a pull-to-refresh, because the answer changes when the
 * provider publishes something.
 *
 * Whether this person may decide is not guessed here. The list is readable by anyone at the
 * client; the detail screen asks the API, which returns `canDecide` per request.
 */
export function ClientApprovalsScreen({ onOpen }: { onOpen: (approvalId: string) => void }) {
  const theme = useTheme();
  const query = useResource<PortalApprovalSummary[]>(['portal', 'approvals'], '/portal/approvals');
  const approvals = query.data ?? [];
  const refresh = () => void query.refetch();

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading what needs your approval" />
      </Screen>
    );
  }

  if (query.error && approvals.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }

  const { waiting, decided } = splitPortalApprovals(approvals);
  // An organization that has never been asked anything gets one sentence, not two empty halves.
  const sections =
    approvals.length === 0
      ? []
      : [
          {
            key: 'waiting',
            title: 'Waiting for you',
            empty: 'Nothing to approve right now.',
            data: waiting,
          },
          { key: 'decided', title: 'Already decided', empty: 'No decisions yet.', data: decided },
        ];

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(approval) => approval.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing to approve"
            description="When your team asks you to sign something off, it appears here."
            icon="shield-checkmark-outline"
          />
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            {...(section.data.length > 0 ? { count: section.data.length } : {})}
          />
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <AppText size="sm" tone="muted">
              {section.empty}
            </AppText>
          ) : null
        }
        renderItem={({ item }) => <ClientApprovalRow item={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}

function ClientApprovalRow({ item, onOpen }: { item: PortalApprovalSummary; onOpen: () => void }) {
  // A published request is the one only this client can move; the brand edge says so before the
  // pill is read.
  const waiting = item.status === APPROVAL_STATUS.PUBLISHED;
  const mark = approvalStatusIcon(item.status);
  return (
    <PressableCard
      accessibilityLabel={item.title}
      accessibilityHint="Opens the request"
      highlight={waiting}
      icon={mark.icon}
      iconTone={mark.tone}
      onPress={onOpen}
    >
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {subjectLine(item.subject)}
        {item.project ? ` · ${item.project.name}` : ''}
      </AppText>
      <AppText weight="medium" numberOfLines={2}>
        {item.title}
      </AppText>
      <PillRow>
        <Pill label={approvalStatusLabel(item.status)} tone={approvalTone(item.status)} />
        {waiting ? <Pill label="Waiting for you" tone="warning" /> : null}
        {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      {item.dueDate ? (
        <MetaLine icon="alarm-outline" danger={item.isOverdue}>
          Asked for by {formatDate(item.dueDate)}
        </MetaLine>
      ) : null}
      {item.decidedBy ? (
        <MetaLine icon="checkmark-done-outline">
          {item.decidedBy.name} · {formatDate(item.decidedAt)}
        </MetaLine>
      ) : null}
    </PressableCard>
  );
}
