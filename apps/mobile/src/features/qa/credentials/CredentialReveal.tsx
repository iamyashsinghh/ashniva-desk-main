import type { RevealedCredential } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { apiRequest, errorMessage } from '../../../shared/api/client';
import { KeyValueRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useTimedReveal } from './use-timed-reveal';

/**
 * The one control in the app that puts a password on screen.
 *
 * The value is fetched with a plain request, not a query or a mutation — either would keep a copy
 * in a cache that outlives the countdown — and is held by `useTimedReveal` in this component's
 * state alone. It disappears when the countdown ends, when "Hide it now" is pressed, when the app
 * leaves the foreground or when this unmounts. Nothing here writes it anywhere else.
 */
export function CredentialReveal({
  grantId,
  unavailableReason,
}: {
  /** The live grant this person holds, or null when they hold none this session. */
  grantId: string | null;
  /** Why the button is off, when it is. A disabled control must say what would turn it on. */
  unavailableReason?: string | null;
}) {
  const theme = useTheme();
  const { revealed, secondsLeft, hasLapsed, show, hide } = useTimedReveal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = unavailableReason ?? (grantId ? null : 'Nobody has granted you this login');

  const run = async () => {
    if (!grantId) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      show(await apiRequest<RevealedCredential>(`/grants/${grantId}/reveal`, { method: 'POST' }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {revealed ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
          }}
        >
          <KeyValueRow label="Username" value={revealed.username} />
          <KeyValueRow label="Password" value={revealed.secret} emphasis />
          <AppText size="xs" tone="muted">
            Hidden again in {secondsLeft}s. Nothing keeps a copy — reveal it again if you need it.
          </AppText>
          <Button
            label="Hide it now"
            size="sm"
            variant="secondary"
            icon="eye-off-outline"
            onPress={hide}
          />
        </View>
      ) : (
        <>
          <Button
            label={hasLapsed ? 'Reveal again' : 'Reveal password'}
            icon="eye-outline"
            size="sm"
            loading={pending}
            disabled={Boolean(blocked)}
            {...(blocked ? { accessibilityHint: blocked } : {})}
            onPress={() => void run()}
          />
          {blocked ? (
            <AppText size="xs" tone="muted">
              {blocked}
            </AppText>
          ) : null}
          {hasLapsed ? (
            <AppText size="xs" tone="muted">
              Hidden again. Every reveal is logged.
            </AppText>
          ) : null}
        </>
      )}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </View>
  );
}
