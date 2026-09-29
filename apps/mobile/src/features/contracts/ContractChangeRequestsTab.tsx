import type { ChangeRequestSummary } from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { Button } from '../../shared/components/primitives';
import { EmptyState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ChangeRequestRow } from '../change-requests/ChangeRequestRow';
import { ErrorNote } from './commercial-ui';

/** Every change request raised against this contract, open or closed, newest first. */
export function ContractChangeRequestsTab({
  contractId,
  onOpen,
}: {
  contractId: string;
  onOpen: (changeRequestId: string) => void;
}) {
  const theme = useTheme();
  const query = { contractId, limit: 25 };
  const list = usePagedResource<ChangeRequestSummary>(
    ['change-requests', 'list', query],
    '/change-requests',
    query,
  );

  if (list.isLoading) {
    return <LoadingState label="Loading change requests" variant="spinner" />;
  }
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {list.error ? <ErrorNote message={errorMessage(list.error)} /> : null}
      {!list.error && list.items.length === 0 ? (
        <EmptyState
          title="No change requests against this contract"
          icon="git-pull-request-outline"
        />
      ) : null}
      {list.items.map((item) => (
        <ChangeRequestRow key={item.id} item={item} onOpen={() => onOpen(item.id)} />
      ))}
      {list.hasMore ? (
        <Button
          label="Show more"
          variant="ghost"
          size="sm"
          loading={list.isLoadingMore}
          onPress={list.loadMore}
        />
      ) : null}
    </View>
  );
}
