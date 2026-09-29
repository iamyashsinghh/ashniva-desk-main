import {
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS,
  PERMISSIONS,
  type ChangeRequestStatus,
  type PortalChangeRequestSummary,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { usePagedResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { SearchFilterBar, useDebounced } from '../../../shared/components/FilterSheet';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Button, Pill, PillRow } from '../../../shared/components/primitives';
import { formatMinutes, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { changeRequestTone, formatCost, ICON_TONES } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { PermissionGate } from '../PortalFrame';
import { PortalList } from '../PortalList';
import { StatusChips } from '../StatusChips';
import { ChangeRequestFormSheet } from './ChangeRequestFormSheet';

const S = CHANGE_REQUEST_STATUS;

type ListView = 'decide' | 'open' | 'drafts' | 'closed';

/** Grouped by who the request is waiting on; the API takes the statuses as a comma list. */
const VIEWS: Record<ListView, { label: string; statuses: ChangeRequestStatus[] }> = {
  decide: { label: 'Needs your decision', statuses: [S.CLIENT_REVIEW] },
  open: {
    label: 'Open',
    statuses: [
      S.SUBMITTED,
      S.INTERNAL_REVIEW,
      S.CLIENT_REVIEW,
      S.CHANGES_REQUESTED,
      S.APPROVED,
      S.SCHEDULED,
    ],
  },
  drafts: { label: 'Drafts', statuses: [S.DRAFT, S.CHANGES_REQUESTED] },
  closed: { label: 'Closed', statuses: [S.COMPLETED, S.REJECTED, S.CANCELLED] },
};
const VIEW_ORDER: ListView[] = ['decide', 'open', 'drafts', 'closed'];

/**
 * Change requests for the client's organization: the ones waiting on a decision, and the ones
 * this person raised. Search and the status filter go to the API, which pages the result.
 */
export function PortalChangeRequestsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <PermissionGate
      permission={PERMISSIONS.CHANGE_REQUEST_READ}
      title="Change requests are not shared with you"
      description="Ask your administrator if you need to see or raise change requests."
    >
      <ChangeRequestList onOpen={onOpen} />
    </PermissionGate>
  );
}

function ChangeRequestList({ onOpen }: { onOpen: (id: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView | null>(null);
  const [raising, setRaising] = useState(false);
  const term = useDebounced(search.trim());
  const status = view ? VIEWS[view].statuses.join(',') : '';

  const list = usePagedResource<PortalChangeRequestSummary>(
    portalKeys.changeRequestList({ status, search: term }),
    '/portal/change-requests',
    { limit: 20, ...(status ? { status } : {}), ...(term ? { search: term } : {}) },
  );

  return (
    <>
      <PortalList
        items={list.items}
        isLoading={list.isLoading}
        error={list.error}
        isRefreshing={list.isRefreshing}
        onRefresh={list.refresh}
        {...(list.hasMore ? { onEndReached: list.loadMore } : {})}
        isLoadingMore={list.isLoadingMore}
        loadingLabel="Loading change requests"
        emptyTitle="No change requests"
        emptyDescription="Requests to change the agreed scope appear here, with the provider’s estimate for you to decide on."
        emptyIcon="git-pull-request-outline"
        filtered={Boolean(term) || view !== null}
        header={
          <View style={{ gap: theme.spacing.sm }}>
            {can(PERMISSIONS.CHANGE_REQUEST_RAISE) ? (
              <Button label="Raise a change request" icon="add" onPress={() => setRaising(true)} />
            ) : null}
            <SearchFilterBar
              search={search}
              onSearch={setSearch}
              placeholder="Search change requests"
            />
            <StatusChips
              options={VIEW_ORDER}
              value={view}
              onChange={setView}
              labelFor={(value) => VIEWS[value].label}
            />
          </View>
        }
        renderItem={(cr) => <ChangeRequestCard cr={cr} onPress={() => onOpen(cr.id)} />}
      />
      <ChangeRequestFormSheet
        visible={raising}
        onClose={() => setRaising(false)}
        onSaved={onOpen}
      />
    </>
  );
}

function ChangeRequestCard({
  cr,
  onPress,
}: {
  cr: PortalChangeRequestSummary;
  onPress: () => void;
}) {
  const waiting = cr.status === S.CLIENT_REVIEW;
  const tone = changeRequestTone(cr.status);
  return (
    <PressableCard
      accessibilityLabel={`${cr.number} ${cr.title}`}
      accessibilityHint="Opens the change request"
      onPress={onPress}
      highlight={waiting}
      icon="git-pull-request"
      iconTone={ICON_TONES[tone]}
    >
      <MetaLine icon="pricetag-outline">
        {cr.number}
        {cr.project ? ` · ${cr.project.name}` : ''}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {cr.title}
      </AppText>
      <PillRow>
        <Pill label={CHANGE_REQUEST_STATUS_LABELS[cr.status]} tone={tone} />
        {waiting ? <Pill label="Your decision is needed" tone="warning" /> : null}
      </PillRow>
      {cr.estimatedMinutes !== null || cr.costImpact !== null ? (
        <MetaLine icon="cash-outline">
          {[
            cr.estimatedMinutes !== null ? formatMinutes(cr.estimatedMinutes) : null,
            cr.costImpact !== null ? formatCost(cr.costImpact, cr.currency) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </MetaLine>
      ) : null}
      <MetaLine icon="time-outline">Updated {formatSince(cr.updatedAt)}</MetaLine>
    </PressableCard>
  );
}
