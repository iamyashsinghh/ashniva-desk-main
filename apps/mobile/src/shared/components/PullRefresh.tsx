import { RefreshControl, type RefreshControlProps } from 'react-native';

import { usePullRefresh } from '../hooks/use-pull-refresh';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A `RefreshControl` whose spinner belongs to the pull, not to every background refetch — see
 * `usePullRefresh` for why that matters on iOS.
 *
 * Passed as a scroll view's `refreshControl` exactly like the original. The rest of the props,
 * `children` and `style` included, are forwarded because Android wraps the scroll view inside
 * the control it is given.
 */
export function PullRefresh({
  busy,
  onRefresh,
  ...rest
}: Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  /** The query's refetching flag. */
  busy: boolean;
  /** Starts the refetch; may return its promise. */
  onRefresh: () => unknown;
}) {
  const theme = useTheme();
  const pull = usePullRefresh(busy, onRefresh);
  return (
    <RefreshControl
      tintColor={theme.colors.primary}
      colors={[theme.colors.primary]}
      {...rest}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
    />
  );
}
