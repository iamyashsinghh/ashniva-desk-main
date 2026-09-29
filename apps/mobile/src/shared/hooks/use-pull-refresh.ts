import { useCallback, useState } from 'react';

const SPIN_LIMIT_MS = 15_000;

/**
 * Pull-to-refresh that spins only for the pull.
 *
 * Binding `RefreshControl.refreshing` to a query's `isRefetching` shows the spinner for every
 * background refetch too — a screen coming back into focus, a realtime event, a poll. On iOS a
 * refresh control switched on programmatically also moves the list down to reveal itself, and
 * one switched on before the list has laid out can leave the content stranded far down the
 * screen. So the spinner here belongs to the gesture: it starts when somebody pulls and stops
 * when the refetch that pull caused has finished.
 *
 * `busy` is the query's refetching flag; `refresh` may return the refetch promise, which ends the
 * spin when it settles even if `busy` never flipped (a refetch deduplicated into one in flight).
 */
export function usePullRefresh(
  busy: boolean,
  refresh: () => unknown,
): { refreshing: boolean; onRefresh: () => void } {
  const [pulling, setPulling] = useState(false);
  const [sawBusy, setSawBusy] = useState(false);

  if (pulling && busy && !sawBusy) {
    setSawBusy(true);
  }
  if (pulling && !busy && sawBusy) {
    setPulling(false);
    setSawBusy(false);
  }

  const onRefresh = useCallback(() => {
    setPulling(true);
    setSawBusy(false);
    const result = refresh();
    if (result instanceof Promise) {
      void result.catch(() => undefined).finally(() => setPulling(false));
    } else {
      // A refresh that returns nothing and never becomes busy must not spin forever.
      setTimeout(() => setPulling(false), SPIN_LIMIT_MS);
    }
  }, [refresh]);

  return { refreshing: pulling, onRefresh };
}
