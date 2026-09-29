import type { ClientUpdateSummary } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { CLIENT_UPDATE_INVALIDATE } from './completed-today';

/**
 * Publishing and withdrawing client updates.
 *
 * `activeId` is which row is in flight, so its own button spins rather than every button on the
 * screen. "Publish all" goes one at a time, as the web does, and stops at the first refusal: the
 * rest of the queue stays where it is, and the refusal is shown rather than buried under a second.
 */
export function useClientUpdateActions() {
  const publish = useApiMutation<string, ClientUpdateSummary>({
    path: (id) => `/client-updates/${id}/publish`,
    invalidate: CLIENT_UPDATE_INVALIDATE,
  });
  const withdraw = useApiMutation<string, ClientUpdateSummary>({
    path: (id) => `/client-updates/${id}/withdraw`,
    invalidate: CLIENT_UPDATE_INVALIDATE,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);

  const publishOne = async (id: string) => {
    withdraw.reset();
    setActiveId(id);
    await publish.run(id);
    setActiveId(null);
  };

  const withdrawOne = async (id: string) => {
    publish.reset();
    setActiveId(id);
    await withdraw.run(id);
    setActiveId(null);
  };

  const publishAll = async (ids: readonly string[]) => {
    withdraw.reset();
    setPublishingAll(true);
    for (const id of ids) {
      if ((await publish.run(id)) === null) {
        break;
      }
    }
    setPublishingAll(false);
  };

  return {
    publishOne,
    withdrawOne,
    publishAll,
    activeId,
    publishingAll,
    busy: publish.busy || withdraw.busy || publishingAll,
    error: publish.error ?? withdraw.error,
  };
}

export type ClientUpdateActions = ReturnType<typeof useClientUpdateActions>;
