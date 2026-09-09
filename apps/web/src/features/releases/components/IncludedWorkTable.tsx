import {
  RELEASE_ITEM_KIND,
  type ReleaseDetail,
  type ReleaseItemRow,
  type ReleaseItemKind,
} from '@ashniva/types';
import { Alert, Badge, Button, Card, EmptyState, Table, type TableColumn } from '@ashniva/ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { useReleaseMutations } from '../api';
import { ITEM_KIND_LABELS, isDraft } from '../release-display';
import { AddReleaseItemModal } from './AddReleaseItemModal';

/** Where an item's own screen lives, so a reader can check what is actually going out. */
function pathFor(item: ReleaseItemRow): string | null {
  if (item.kind === RELEASE_ITEM_KIND.TASK && item.taskId) {
    return `/tasks/${item.taskId}`;
  }
  if (item.kind === RELEASE_ITEM_KIND.TICKET && item.ticketId) {
    return `/tickets/${item.ticketId}`;
  }
  if (item.kind === RELEASE_ITEM_KIND.CHANGE_REQUEST && item.changeRequestId) {
    return `/change-requests/${item.changeRequestId}`;
  }
  return null;
}

const KIND_TONES: Record<ReleaseItemKind, 'neutral' | 'info' | 'review'> = {
  TASK: 'neutral',
  TICKET: 'info',
  CHANGE_REQUEST: 'review',
};

/**
 * What is going out.
 *
 * Editable only while the release is a draft: once approval has been requested, the sign-offs
 * refer to this list, so adding to it afterwards would ship something nobody approved. The API
 * refuses it either way — this only stops the screen offering a button that cannot work.
 */
export function IncludedWorkTable({
  release,
  canManage,
}: {
  release: ReleaseDetail;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { removeItem } = useReleaseMutations();
  const mayChange = canManage && isDraft(release.status);

  const remove = async (item: ReleaseItemRow) => {
    setError(null);
    try {
      await removeItem.mutateAsync({ id: release.id, itemId: item.id });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const columns: TableColumn<ReleaseItemRow>[] = [
    {
      key: 'kind',
      header: 'Kind',
      width: '150px',
      render: (item) => <Badge tone={KIND_TONES[item.kind]}>{ITEM_KIND_LABELS[item.kind]}</Badge>,
    },
    {
      key: 'reference',
      header: 'Reference',
      width: '130px',
      render: (item) => {
        const path = pathFor(item);
        return path ? <Link to={path}>{item.reference}</Link> : item.reference;
      },
    },
    { key: 'title', header: 'Title', render: (item) => item.title },
  ];

  if (mayChange) {
    columns.push({
      key: 'remove',
      header: '',
      width: '90px',
      align: 'right',
      render: (item) => (
        <Button size="sm" variant="ghost" onClick={() => void remove(item)}>
          Remove
        </Button>
      ),
    });
  }

  return (
    <Card
      title={`Included work (${release.items.length})`}
      headerAddon={
        mayChange ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            Add work
          </Button>
        ) : (
          <span className="muted">Contents are fixed once approval is requested</span>
        )
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Table
        aria-label="Work included in this release"
        columns={columns}
        rows={release.items}
        rowKey={(item) => item.id}
        empty={
          <EmptyState
            title="Nothing in this release yet"
            description="Add the tasks, tickets and change requests that go out together."
            action={
              mayChange ? <Button onClick={() => setAdding(true)}>Add work</Button> : undefined
            }
          />
        }
      />
      {adding ? <AddReleaseItemModal release={release} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
