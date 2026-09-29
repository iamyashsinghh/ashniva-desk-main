import type { ChangeRequestAction } from '@ashniva/types';
import { View } from 'react-native';

import { Grow, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ErrorNote } from '../contracts/commercial-ui';
import type { ActionButton } from './change-request-display';

/**
 * The bottom bar: the first thing the API says this person can do next, big, and every action —
 * including the ones it refuses, with its reason — one tap away in a sheet. The API decides which
 * actions exist and which are enabled; this only draws them.
 */
export function ChangeRequestActionBar({
  buttons,
  busy,
  onAction,
  onOpenAll,
}: {
  buttons: readonly ActionButton[];
  busy: boolean;
  onAction: (action: ChangeRequestAction) => void;
  onOpenAll: () => void;
}) {
  if (buttons.length === 0) {
    return null;
  }
  const next = buttons.find((button) => button.enabled && button.variant === 'primary');
  const others = buttons.length - (next ? 1 : 0);
  return (
    <StickyActionBar>
      {others > 0 ? (
        <Grow>
          <Button
            label={next ? 'More actions' : 'Actions'}
            icon="ellipsis-horizontal"
            variant="secondary"
            onPress={onOpenAll}
          />
        </Grow>
      ) : null}
      {next ? (
        <Grow>
          <Button
            label={next.label}
            icon={next.icon}
            loading={busy}
            onPress={() => onAction(next.action)}
          />
        </Grow>
      ) : null}
    </StickyActionBar>
  );
}

export function ChangeRequestActionsSheet({
  visible,
  buttons,
  busy,
  error,
  closed,
  onAction,
  onClose,
}: {
  visible: boolean;
  buttons: readonly ActionButton[];
  busy: boolean;
  error: string | null;
  closed: boolean;
  onAction: (action: ChangeRequestAction) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} title="Actions for your role" onClose={onClose}>
      {buttons.length === 0 ? (
        <AppText tone="muted">
          {closed ? 'This request is closed.' : 'Waiting for the other side.'}
        </AppText>
      ) : (
        buttons.map((button) => (
          <View key={button.action} style={{ gap: theme.spacing.xs }}>
            <Button
              label={button.label}
              icon={button.icon}
              variant={button.variant}
              disabled={!button.enabled || busy}
              onPress={() => onAction(button.action)}
              {...(button.reason ? { accessibilityHint: button.reason } : {})}
            />
            {!button.enabled && button.reason ? (
              <AppText size="xs" tone="muted">
                {button.reason}
              </AppText>
            ) : null}
          </View>
        ))
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}
